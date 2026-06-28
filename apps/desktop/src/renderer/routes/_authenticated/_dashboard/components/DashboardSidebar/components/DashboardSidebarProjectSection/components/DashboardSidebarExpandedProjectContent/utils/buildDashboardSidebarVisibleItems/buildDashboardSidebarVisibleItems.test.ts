import { describe, expect, it } from "bun:test";
import {
	secId,
	wsId,
} from "../../../../../../hooks/useSidebarDnd/sidebarDndIds";
import type { DashboardSidebarWorkspace } from "../../../../../../types";
import {
	buildDashboardSidebarVisibleItems,
	DEFAULT_DASHBOARD_SIDEBAR_WORKSPACE_LIMIT,
} from "./buildDashboardSidebarVisibleItems";

const DATE = new Date("2026-01-01T00:00:00.000Z");

function workspace(
	id: string,
	overrides: Partial<DashboardSidebarWorkspace> = {},
): DashboardSidebarWorkspace {
	return {
		id,
		projectId: "project-1",
		hostId: "host-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: null,
		accentColor: null,
		name: id,
		branch: id,
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: DATE,
		updatedAt: DATE,
		taskId: null,
		pendingTransaction: null,
		...overrides,
	};
}

function workspaceMap(
	workspaces: DashboardSidebarWorkspace[],
): Map<string, DashboardSidebarWorkspace> {
	return new Map(workspaces.map((item) => [item.id, item]));
}

describe("buildDashboardSidebarVisibleItems", () => {
	it("keeps all rows when the visible workspace count is under the limit", () => {
		const workspaces = [workspace("ws-1"), workspace("ws-2")];
		const result = buildDashboardSidebarVisibleItems({
			flatItems: [secId("section-1"), wsId("ws-1"), wsId("ws-2")],
			workspacesById: workspaceMap(workspaces),
			workspaceLimit: DEFAULT_DASHBOARD_SIDEBAR_WORKSPACE_LIMIT,
		});

		expect(result.items).toEqual([
			secId("section-1"),
			wsId("ws-1"),
			wsId("ws-2"),
		]);
		expect(result.hiddenWorkspaceCount).toBe(0);
		expect(result.isLimited).toBe(false);
	});

	it("caps mounted workspace rows but keeps section headers", () => {
		const workspaces = [
			workspace("ws-1"),
			workspace("ws-2"),
			workspace("ws-3"),
			workspace("ws-4"),
		];
		const result = buildDashboardSidebarVisibleItems({
			flatItems: [
				secId("section-1"),
				wsId("ws-1"),
				wsId("ws-2"),
				secId("section-2"),
				wsId("ws-3"),
				wsId("ws-4"),
			],
			workspacesById: workspaceMap(workspaces),
			workspaceLimit: 2,
		});

		expect(result.items).toEqual([
			secId("section-1"),
			wsId("ws-1"),
			wsId("ws-2"),
			secId("section-2"),
		]);
		expect(result.visibleWorkspaceCount).toBe(2);
		expect(result.totalWorkspaceCount).toBe(4);
		expect(result.hiddenWorkspaceCount).toBe(2);
		expect(result.isLimited).toBe(true);
	});

	it("forces the active workspace to stay mounted beyond the cap", () => {
		const workspaces = [
			workspace("ws-1"),
			workspace("ws-2"),
			workspace("ws-3"),
		];
		const result = buildDashboardSidebarVisibleItems({
			flatItems: [wsId("ws-1"), wsId("ws-2"), wsId("ws-3")],
			workspacesById: workspaceMap(workspaces),
			activeWorkspaceId: "ws-3",
			workspaceLimit: 1,
		});

		expect(result.items).toEqual([wsId("ws-1"), wsId("ws-3")]);
		expect(result.visibleWorkspaceCount).toBe(2);
		expect(result.hiddenWorkspaceCount).toBe(1);
	});

	it("forces pending insert rows to stay mounted beyond the cap", () => {
		const pendingInsert: DashboardSidebarWorkspace["pendingTransaction"] = {
			id: "transaction-1",
			workspaceId: "ws-3",
			type: "insert",
			state: "pending",
			createdAt: DATE,
			updatedAt: DATE,
			progress: null,
		};
		const workspaces = [
			workspace("ws-1"),
			workspace("ws-2"),
			workspace("ws-3", { pendingTransaction: pendingInsert }),
		];
		const result = buildDashboardSidebarVisibleItems({
			flatItems: [wsId("ws-1"), wsId("ws-2"), wsId("ws-3")],
			workspacesById: workspaceMap(workspaces),
			workspaceLimit: 1,
		});

		expect(result.items).toEqual([wsId("ws-1"), wsId("ws-3")]);
		expect(result.visibleWorkspaceCount).toBe(2);
		expect(result.hiddenWorkspaceCount).toBe(1);
	});

	it("does not count section-collapsed rows against the cap", () => {
		const workspaces = [
			workspace("visible-1"),
			workspace("hidden-1"),
			workspace("hidden-2"),
		];
		const result = buildDashboardSidebarVisibleItems({
			flatItems: [
				wsId("visible-1"),
				secId("section-1"),
				wsId("hidden-1"),
				wsId("hidden-2"),
			],
			workspacesById: workspaceMap(workspaces),
			hiddenWorkspaceIds: new Set(["hidden-1", "hidden-2"]),
			workspaceLimit: 1,
		});

		expect(result.items).toEqual([wsId("visible-1"), secId("section-1")]);
		expect(result.totalWorkspaceCount).toBe(1);
		expect(result.hiddenWorkspaceCount).toBe(0);
	});
});
