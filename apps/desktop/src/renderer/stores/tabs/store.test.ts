import { describe, expect, it } from "bun:test";
import type { Pane } from "shared/tabs-types";
import {
	createPersistedTabsState,
	stripPersistedChatLaunchAttachments,
} from "./persistence";
import type { TabsState } from "./types";

describe("tabs store persistence", () => {
	it("strips inline launch attachments from persisted chat config", () => {
		const largeDataUrl = `data:text/plain;base64,${"a".repeat(100_000)}`;
		const slim = stripPersistedChatLaunchAttachments({
			initialPrompt: "Review this context",
			initialFiles: [
				{
					data: largeDataUrl,
					mediaType: "text/plain",
					filename: "context.txt",
				},
			],
			metadata: { model: "claude" },
			retryCount: 2,
		});

		expect(JSON.stringify(slim)).not.toContain(largeDataUrl);
		expect(slim?.initialFiles).toBeUndefined();
		expect(slim?.initialPrompt).toBe("Review this context");
		expect(slim?.metadata?.model).toBe("claude");
		expect(slim?.retryCount).toBe(2);
	});

	it("keeps runtime pane state intact while slimming the persisted copy", () => {
		const largeDataUrl = `data:text/plain;base64,${"b".repeat(100_000)}`;
		const pane: Pane = {
			id: "pane-1",
			tabId: "tab-1",
			type: "chat",
			name: "Chat",
			chat: {
				sessionId: "session-1",
				launchConfig: {
					initialPrompt: "Use this file",
					initialFiles: [
						{
							data: largeDataUrl,
							mediaType: "text/plain",
							filename: "notes.txt",
						},
					],
				},
			},
		};
		const state: TabsState = {
			tabs: [
				{
					id: "tab-1",
					name: "Chat",
					workspaceId: "workspace-1",
					layout: "pane-1",
					createdAt: 1,
				},
			],
			panes: { "pane-1": pane },
			activeTabIds: { "workspace-1": "tab-1" },
			focusedPaneIds: { "tab-1": "pane-1" },
			tabHistoryStacks: {},
			closedTabsStack: [],
		};

		const persisted = createPersistedTabsState(state);

		expect(
			state.panes["pane-1"]?.chat?.launchConfig?.initialFiles?.[0]?.data,
		).toBe(largeDataUrl);
		expect(JSON.stringify(persisted)).not.toContain(largeDataUrl);
		expect(
			persisted.panes["pane-1"]?.chat?.launchConfig?.initialFiles,
		).toBeUndefined();
		expect(persisted.panes["pane-1"]?.chat?.launchConfig?.initialPrompt).toBe(
			"Use this file",
		);
	});
});
