import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { LocalModelProvider } from "./LocalModelProvider";

const ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv(): Partial<Record<EnvKey, string | undefined>> {
	return Object.fromEntries(
		ENV_KEYS.map((key) => [key, process.env[key]]),
	) as Partial<Record<EnvKey, string | undefined>>;
}

function restoreEnv(
	snapshot: Partial<Record<EnvKey, string | undefined>>,
): void {
	for (const key of ENV_KEYS) {
		const value = snapshot[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe("LocalModelProvider", () => {
	let envSnapshot: Partial<Record<EnvKey, string | undefined>>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of ENV_KEYS) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("treats parent Anthropic env credentials as a usable Chat runtime", async () => {
		const provider = new LocalModelProvider({
			envResolver: () => ({
				ANTHROPIC_API_KEY: "env-anthropic-key",
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			}),
		});

		expect(await provider.hasUsableRuntimeEnv()).toBe(true);
		await provider.prepareRuntimeEnv();

		expect(process.env.ANTHROPIC_API_KEY).toBe("env-anthropic-key");
		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"https://ai-gateway.vercel.sh/v1",
		);
	});

	it("treats parent OpenAI env credentials as a usable Chat runtime", async () => {
		const provider = new LocalModelProvider({
			envResolver: () => ({
				OPENAI_API_KEY: "env-openai-key",
			}),
		});

		expect(await provider.hasUsableRuntimeEnv()).toBe(true);
		await provider.prepareRuntimeEnv();

		expect(process.env.OPENAI_API_KEY).toBe("env-openai-key");
		expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	it("does not treat local development placeholder keys as usable credentials", async () => {
		const provider = new LocalModelProvider({
			envResolver: () => ({
				ANTHROPIC_API_KEY: "sk-ant-fake-local-dev",
				OPENAI_API_KEY: "sk-placeholder",
			}),
		});

		expect(await provider.hasUsableRuntimeEnv()).toBe(false);
		await provider.prepareRuntimeEnv();

		expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(process.env.OPENAI_API_KEY).toBeUndefined();
	});
});
