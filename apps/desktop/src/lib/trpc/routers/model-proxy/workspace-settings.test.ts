import { describe, expect, test } from "bun:test";
import { mergeWorkspaceModelSettings } from "./workspace-settings-merge";

const env = {
	ANTHROPIC_AUTH_TOKEN: "local-token",
	ANTHROPIC_BASE_URL: "http://127.0.0.1:1234",
	API_TIMEOUT_MS: "3000000",
	CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
	ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku",
	ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet",
	ANTHROPIC_DEFAULT_OPUS_MODEL: "opus",
};

describe("mergeWorkspaceModelSettings", () => {
	test("preserves unrelated top-level and env keys", () => {
		const result = mergeWorkspaceModelSettings(
			JSON.stringify({ permissions: { allow: ["Bash(bun test)"] }, env: { CUSTOM_FLAG: "keep", ANTHROPIC_BASE_URL: "old" } }),
			env,
		);
		const parsed = JSON.parse(result.text);
		expect(parsed.permissions.allow).toEqual(["Bash(bun test)"]);
		expect(parsed.env.CUSTOM_FLAG).toBe("keep");
		expect(parsed.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:1234");
		expect(result.preservedEnvKeys).toEqual(["CUSTOM_FLAG"]);
	});

	test("replaces invalid json", () => {
		const result = mergeWorkspaceModelSettings("{", env);
		expect(result.replacedInvalidJson).toBe(true);
		expect(JSON.parse(result.text).env.ANTHROPIC_AUTH_TOKEN).toBe("local-token");
	});

	test("replaces non-object env", () => {
		const result = mergeWorkspaceModelSettings(JSON.stringify({ env: "bad" }), env);
		expect(result.replacedNonObjectEnv).toBe(true);
		expect(JSON.parse(result.text).env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("opus");
	});
});
