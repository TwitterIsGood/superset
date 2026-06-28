import { describe, expect, test } from "bun:test";

describe("ChatPaneInterface Claude runtime pack wiring", () => {
	test("gates standalone chat sends on the on-demand Claude runtime pack", async () => {
		const source = await Bun.file(
			new URL("./ChatPaneInterface.tsx", import.meta.url),
		).text();

		expect(source).toContain("CLAUDE_AGENT_RUNTIME_PACK_ID");
		expect(source).toContain("usePackStatus(CLAUDE_AGENT_RUNTIME_PACK_ID");
		expect(source).toContain("enabled: shouldResolveClaudeRuntimePack");
		expect(source).toContain("workspaceId === null");
		expect(source).toContain("prepareStandaloneClaudeRuntime");
		expect(source).toContain('process.env.NODE_ENV === "development"');
		expect(source).toContain("PackLoadingState");
		expect(source).toContain("PackErrorState");
		expect(source).toContain("standalone-chat-runtime-pack-status");
		expect(source).toContain("submitDisabled={isClaudeRuntimeSendBlocked}");
		expect(source).toMatch(
			/Boolean\(submitDisabled\)\s*\|\|\s*\(sessionId \? isUploading : false\)/,
		);
	});
});
