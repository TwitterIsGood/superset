import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSource(relativePath: string): string {
	return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("host-service startup dependency boundaries", () => {
	test("createApp defers workspace watchers and PR timers until a consumer appears", () => {
		const source = readSource("app.ts");

		const gitWatcherStartCalls = [
			...source.matchAll(/gitWatcher\.start\(\);/g),
		];
		expect(gitWatcherStartCalls).toHaveLength(1);
		expect(
			source.slice(
				Math.max(0, (gitWatcherStartCalls[0]?.index ?? 0) - 160),
				gitWatcherStartCalls[0]?.index,
			),
		).toContain("const ensureGitWatcherStarted");

		const pullRequestStartCalls = [
			...source.matchAll(/pullRequestRuntime\.start\(\);/g),
		];
		expect(pullRequestStartCalls).toHaveLength(1);
		expect(
			source.slice(
				Math.max(0, (pullRequestStartCalls[0]?.index ?? 0) - 180),
				pullRequestStartCalls[0]?.index,
			),
		).toContain("const ensurePullRequestRuntimeStarted");

		const eventBusStartCalls = [...source.matchAll(/eventBus\.start\(\);/g)];
		expect(eventBusStartCalls).toHaveLength(1);
		expect(
			source.slice(
				Math.max(0, (eventBusStartCalls[0]?.index ?? 0) - 160),
				eventBusStartCalls[0]?.index,
			),
		).toContain("const ensureEventBusStarted");
		expect(source).toContain("onClientOpen: ensureEventBusStarted");
	});

	test("createApp keeps chat and model gateway modules off the static startup path", () => {
		const source = readSource("app.ts");

		expect(source).not.toMatch(
			/import\s+\{\s*ChatService\s*\}\s+from\s+["']@superset\/chat\/server\/desktop["']/,
		);
		expect(source).not.toMatch(
			/import\s+\{\s*ChatRuntimeManager\s*\}\s+from\s+["']\.\/runtime\/chat["']/,
		);
		expect(source).not.toMatch(
			/import\s+\{\s*handleModelGatewayRequest\s*\}\s+from\s+["']\.\/model-gateway["']/,
		);

		expect(source).toContain('"@superset/chat/server/desktop/chat-service"');
		expect(source).not.toContain(
			'await import("@superset/chat/server/desktop")',
		);
		expect(source).toContain('import("./runtime/chat")');
		expect(source).toContain('await import("./model-gateway")');
	});

	test("workspace AI naming stays lazy instead of importing Mastra at router load", () => {
		const source = readSource("trpc/router/workspaces/workspaces.ts");
		const aiWorkspaceNames = readSource(
			"trpc/router/workspace-creation/utils/ai-workspace-names.ts",
		);
		const aiBranchName = readSource(
			"trpc/router/workspace-creation/utils/ai-branch-name.ts",
		);

		expect(source).not.toMatch(
			/import\s+\{[^}]*generateWorkspaceNamesFromPrompt[^}]*\}\s+from\s+["'][^"']*ai-workspace-names["']/s,
		);
		expect(source).not.toMatch(
			/import\s+\{[^}]*applyAiWorkspaceRename[^}]*\}\s+from\s+["'][^"']*ai-workspace-names["']/s,
		);
		expect(source).toContain(
			'import("../workspace-creation/utils/ai-workspace-names")',
		);

		expect(aiWorkspaceNames).not.toMatch(
			/import\s+\{[^}]*Agent[^}]*\}\s+from\s+["']@mastra\/core\/agent["']/s,
		);
		expect(aiWorkspaceNames).not.toContain("@mastra/core/agent");
		expect(aiWorkspaceNames).not.toMatch(
			/import\s+\{[^}]*getSmallModel[^}]*\}\s+from\s+["']@superset\/chat\/server\/shared["']/s,
		);
		expect(aiWorkspaceNames).toContain(
			'import("@superset/chat/server/desktop/title-generation")',
		);
		expect(aiWorkspaceNames).toContain(
			'import("@superset/chat/server/shared")',
		);
		expect(aiBranchName).not.toMatch(
			/import\s+\{[^}]*getSmallModel[^}]*\}\s+from\s+["']@superset\/chat\/server\/shared["']/s,
		);
		expect(aiBranchName).not.toMatch(
			/import\s+\{[^}]*generateTitleFromMessage[^}]*\}\s+from\s+["']@superset\/chat\/server\/desktop\/title-generation["']/s,
		);
		expect(aiBranchName).toContain('import("@superset/chat/server/shared")');
		expect(aiBranchName).toContain(
			'import("@superset/chat/server/desktop/title-generation")',
		);
	});
});
