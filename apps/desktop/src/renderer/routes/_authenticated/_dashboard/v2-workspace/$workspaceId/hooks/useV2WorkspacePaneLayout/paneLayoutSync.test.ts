import { describe, expect, test } from "bun:test";
import {
	createPaneLayoutSyncState,
	markPaneLayoutHydrated,
	markPaneLayoutPersisted,
	resetPaneLayoutSyncState,
	shouldHydratePaneLayout,
	shouldPersistPaneLayout,
} from "./paneLayoutSync";

describe("pane layout sync", () => {
	test("does not hydrate or persist before the current workspace local state is available", () => {
		const state = createPaneLayoutSyncState("workspace-a", "empty");

		expect(
			shouldHydratePaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "empty",
				hasHydrationSource: false,
			}),
		).toBe(false);
		expect(
			shouldPersistPaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "tab-2",
			}),
		).toBe(false);
	});

	test("hydrates from a cached row even before the live query is fully ready", () => {
		const state = createPaneLayoutSyncState("workspace-a", "empty");

		expect(
			shouldHydratePaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "workspace-a-tab-2",
				hasHydrationSource: true,
			}),
		).toBe(true);
		markPaneLayoutHydrated(state, "workspace-a", "workspace-a-tab-2");

		expect(
			shouldPersistPaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "workspace-a-tab-2",
			}),
		).toBe(false);
		expect(
			shouldPersistPaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "workspace-a-tab-1",
			}),
		).toBe(true);
	});

	test("resets hydration when switching worktrees so stale tab state cannot write to the next workspace", () => {
		const state = createPaneLayoutSyncState("workspace-a", "empty");
		markPaneLayoutHydrated(state, "workspace-a", "workspace-a-tab-2");
		markPaneLayoutPersisted(state, "workspace-a", "workspace-a-tab-2");

		resetPaneLayoutSyncState(state, "workspace-b", "empty");

		expect(
			shouldPersistPaneLayout({
				state,
				workspaceId: "workspace-b",
				nextSnapshot: "workspace-a-tab-2",
			}),
		).toBe(false);
		expect(
			shouldHydratePaneLayout({
				state,
				workspaceId: "workspace-b",
				nextSnapshot: "workspace-b-tab-1",
				hasHydrationSource: true,
			}),
		).toBe(true);
		markPaneLayoutHydrated(state, "workspace-b", "workspace-b-tab-1");
		expect(
			shouldPersistPaneLayout({
				state,
				workspaceId: "workspace-a",
				nextSnapshot: "workspace-a-tab-2",
			}),
		).toBe(false);
	});
});
