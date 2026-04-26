import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import {
	listStoredProviders,
	MODEL_PROVIDERS_STORAGE_PATH,
	upsertProvider,
} from "./storage";

describe("model provider storage", () => {
	afterEach(async () => {
		await fs.rm(MODEL_PROVIDERS_STORAGE_PATH, { force: true });
	});

	test("redacts secrets and writes storage with 0600 permissions", async () => {
		const provider = await upsertProvider({
			name: "Local",
			protocol: "openai",
			baseUrl: "https://example.test/v1",
			enabled: true,
			secret: "secret-key",
			models: ["gpt-test"],
		});
		expect(provider.hasSecret).toBe(true);
		expect(JSON.stringify(provider)).not.toContain("secret-key");
		const listed = await listStoredProviders();
		expect(JSON.stringify(listed)).not.toContain("secret-key");
		const stat = await fs.stat(MODEL_PROVIDERS_STORAGE_PATH);
		expect(stat.mode & 0o777).toBe(0o600);
	});

	test("persists trimmed proxy URLs and removes blank proxy values", async () => {
		const provider = await upsertProvider({
			name: "Proxy Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			proxyUrl: "  http://127.0.0.1:7890  ",
			enabled: true,
			secret: "secret-key",
			models: ["claude-test"],
		});

		expect(provider.proxyUrl).toBe("http://127.0.0.1:7890");
		expect((await listStoredProviders())[0]?.proxyUrl).toBe(
			"http://127.0.0.1:7890",
		);

		const updated = await upsertProvider({
			id: provider.id,
			name: "Proxy Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			proxyUrl: "  ",
			enabled: true,
			models: ["claude-test"],
		});

		expect(updated.proxyUrl).toBeUndefined();
		expect((await listStoredProviders())[0]?.proxyUrl).toBeUndefined();
	});
});
