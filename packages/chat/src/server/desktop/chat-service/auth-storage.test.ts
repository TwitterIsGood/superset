import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSupersetAuthStorage, SupersetAuthStorage } from "./auth-storage";

let tempRoot = "";

function staticImportSpecifiers(source: string): string[] {
	const importDeclarations =
		source.match(/import(?:[\s\S]*?)from\s+["'][^"']+["'];/g) ?? [];
	return importDeclarations.flatMap((declaration) => {
		if (declaration.startsWith("import type")) return [];
		const match = declaration.match(/from\s+["']([^"']+)["'];/);
		return match?.[1] ? [match[1]] : [];
	});
}

describe("SupersetAuthStorage", () => {
	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "superset-auth-storage-"));
	});

	afterEach(() => {
		if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
		tempRoot = "";
	});

	it("reads and writes the MastraCode-compatible auth.json format", () => {
		const authPath = join(tempRoot, "auth.json");
		const storage = new SupersetAuthStorage({ authPath });

		storage.set("anthropic", { type: "api_key", key: "sk-ant-api-test" });
		storage.setStoredApiKey("openai-codex", "sk-openai-test");

		expect(JSON.parse(readFileSync(authPath, "utf-8"))).toEqual({
			anthropic: { type: "api_key", key: "sk-ant-api-test" },
			"apikey:openai-codex": { type: "api_key", key: "sk-openai-test" },
		});

		const reloaded = createSupersetAuthStorage({ authPath });
		expect(reloaded.get("anthropic")).toEqual({
			type: "api_key",
			key: "sk-ant-api-test",
		});
		expect(reloaded.getStoredApiKey("openai-codex")).toBe("sk-openai-test");
	});

	it("returns unexpired OAuth access without loading MastraCode", async () => {
		const storage = new SupersetAuthStorage({
			authPath: join(tempRoot, "auth.json"),
			resolveMastracodeImportPath: mock(async () => {
				throw new Error("should not load delegate");
			}),
		});
		storage.set("anthropic", {
			type: "oauth",
			access: "live-token",
			refresh: "refresh-token",
			expires: Date.now() + 60_000,
		});

		await expect(storage.getApiKey("anthropic")).resolves.toBe("live-token");
	});

	it("delegates OAuth login and refresh to a lazy MastraCode auth runtime", async () => {
		const delegateAuthPath = join(tempRoot, "delegate-auth.json");
		const delegateModulePath = join(tempRoot, "delegate.mjs");
		mkdirSync(tempRoot, { recursive: true });
		await Bun.write(
			delegateModulePath,
			`
				import { readFileSync, writeFileSync, existsSync } from "node:fs";
				const authPath = ${JSON.stringify(delegateAuthPath)};
				function read() {
					return existsSync(authPath) ? JSON.parse(readFileSync(authPath, "utf-8")) : {};
				}
				function write(data) {
					writeFileSync(authPath, JSON.stringify(data, null, 2), "utf-8");
				}
				export function createAuthStorage() {
					return {
						reload() {},
						get(provider) { return read()[provider]; },
						set(provider, credential) { const data = read(); data[provider] = credential; write(data); },
						remove(provider) { const data = read(); delete data[provider]; write(data); },
						hasStoredApiKey(provider) { return Boolean(read()["apikey:" + provider]); },
						getStoredApiKey(provider) { return read()["apikey:" + provider]?.key; },
						setStoredApiKey(provider, key) { const data = read(); data["apikey:" + provider] = { type: "api_key", key }; write(data); },
						async login(providerId, callbacks) {
							callbacks.onAuth({ url: "https://example.test/oauth" });
							const data = read();
							data[providerId] = { type: "oauth", access: "login-token", refresh: "refresh-token", expires: Date.now() + 60000 };
							write(data);
						},
						async getApiKey(providerId) {
							const data = read();
							data[providerId] = { type: "oauth", access: "refreshed-token", refresh: "refresh-token", expires: Date.now() + 60000 };
							write(data);
							return "refreshed-token";
						},
					};
				}
			`,
		);

		const authPath = delegateAuthPath;
		const storage = new SupersetAuthStorage({
			authPath,
			resolveMastracodeImportPath: async () => delegateModulePath,
		});
		await storage.login("anthropic", {
			onAuth: mock(() => {}),
			onPrompt: mock(async () => "code"),
		});
		expect(storage.get("anthropic")).toEqual(
			expect.objectContaining({ type: "oauth", access: "login-token" }),
		);

		storage.set("anthropic", {
			type: "oauth",
			access: "expired-token",
			refresh: "refresh-token",
			expires: Date.now() - 1_000,
		});

		await expect(storage.getApiKey("anthropic")).resolves.toBe(
			"refreshed-token",
		);
		expect(storage.get("anthropic")).toEqual(
			expect.objectContaining({ type: "oauth", access: "refreshed-token" }),
		);
	});

	it("keeps auth-storage consumers off the MastraCode top-level import path", () => {
		const sourcePaths = [
			"chat-service.ts",
			"../auth/anthropic/anthropic.ts",
			"../auth/openai/openai.ts",
			"../../shared/small-model/get-small-model.ts",
			"../../../../../host-service/src/providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts",
			"../../../../../host-service/src/providers/model-providers/LocalModelProvider/utils/resolveOpenAICredential.ts",
		].map((path) => resolve(import.meta.dirname, path));

		for (const sourcePath of sourcePaths) {
			expect(
				staticImportSpecifiers(readFileSync(sourcePath, "utf8")),
			).not.toEqual(expect.arrayContaining(["mastracode"]));
		}
	});
});
