import { describe, expect, test } from "bun:test";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { getDevSidebarSeedWorkspaces } from "./useDevSeedV2Sidebar";

function workspace(
	id: string,
	projectId: string,
	isInSidebar = false,
): AccessibleV2Workspace {
	return {
		id,
		projectId,
		isInSidebar,
		name: id,
		branch: "main",
		type: "worktree",
		createdAt: new Date("2026-06-27T00:00:00Z"),
		createdByUserId: null,
		createdByName: null,
		createdByImage: null,
		isCreatedByCurrentUser: false,
		projectName: projectId,
		projectRepoId: null,
		projectGithubOwner: null,
		hostId: "host",
		hostName: "Host",
		hostIsOnline: true,
		hostType: "local-device",
		pr: null,
	};
}

describe("getDevSidebarSeedWorkspaces", () => {
	test("seeds at most one workspace per project by default", () => {
		const selected = getDevSidebarSeedWorkspaces([
			workspace("p1-a", "p1"),
			workspace("p1-b", "p1"),
			workspace("p2-a", "p2"),
		]);

		expect(selected.map((item) => item.id)).toEqual(["p1-a", "p2-a"]);
	});

	test("skips workspaces already present in the sidebar", () => {
		const selected = getDevSidebarSeedWorkspaces([
			workspace("p1-a", "p1", true),
			workspace("p1-b", "p1"),
			workspace("p2-a", "p2", true),
			workspace("p2-b", "p2"),
		]);

		expect(selected.map((item) => item.id)).toEqual(["p1-b", "p2-b"]);
	});

	test("caps the total dev seed size", () => {
		const selected = getDevSidebarSeedWorkspaces(
			[
				workspace("p1-a", "p1"),
				workspace("p2-a", "p2"),
				workspace("p3-a", "p3"),
			],
			{ maxTotal: 2 },
		);

		expect(selected.map((item) => item.id)).toEqual(["p1-a", "p2-a"]);
	});
});
