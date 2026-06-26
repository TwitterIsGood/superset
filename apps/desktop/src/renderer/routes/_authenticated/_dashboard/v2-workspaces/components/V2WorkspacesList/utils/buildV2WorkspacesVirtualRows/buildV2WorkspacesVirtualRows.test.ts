import { describe, expect, it } from "bun:test";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	buildV2WorkspacesVirtualRows,
	getV2WorkspaceProjectHeaderIndices,
	type V2WorkspacesProjectGroup,
} from "./buildV2WorkspacesVirtualRows";

function workspace(
	overrides: Partial<AccessibleV2Workspace>,
): AccessibleV2Workspace {
	return {
		id: "workspace-1",
		name: "Workspace 1",
		branch: "main",
		type: "worktree",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		createdByUserId: "user-1",
		createdByName: "User One",
		createdByImage: null,
		isCreatedByCurrentUser: true,
		projectId: "project-1",
		projectName: "Project 1",
		projectRepoId: null,
		projectGithubOwner: null,
		hostId: "host-1",
		hostName: "Host 1",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: false,
		pr: null,
		...overrides,
	};
}

function projectGroup(
	overrides: Partial<V2WorkspacesProjectGroup> & {
		projectId: string;
		workspaces: AccessibleV2Workspace[];
	},
): V2WorkspacesProjectGroup {
	return {
		projectName: overrides.projectId,
		githubOwner: null,
		latestCreatedAt: 0,
		...overrides,
	};
}

describe("buildV2WorkspacesVirtualRows", () => {
	it("renders expanded project headers followed by workspace rows", () => {
		const rows = buildV2WorkspacesVirtualRows({
			currentWorkspaceId: null,
			projectMetaById: {},
			projectGroups: [
				projectGroup({
					projectId: "project-1",
					workspaces: [
						workspace({ id: "workspace-1", projectId: "project-1" }),
						workspace({ id: "workspace-2", projectId: "project-1" }),
					],
				}),
			],
		});

		expect(rows.map((row) => row.type)).toEqual([
			"project",
			"workspace",
			"workspace",
		]);
		expect(getV2WorkspaceProjectHeaderIndices(rows)).toEqual([0]);
	});

	it("omits workspace rows for collapsed projects", () => {
		const rows = buildV2WorkspacesVirtualRows({
			currentWorkspaceId: null,
			projectMetaById: {
				"project-1": { isCollapsed: true },
			},
			projectGroups: [
				projectGroup({
					projectId: "project-1",
					workspaces: [
						workspace({ id: "workspace-1", projectId: "project-1" }),
					],
				}),
			],
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			type: "project",
			isCollapsed: true,
		});
	});

	it("keeps the current workspace project expanded", () => {
		const rows = buildV2WorkspacesVirtualRows({
			currentWorkspaceId: "workspace-1",
			projectMetaById: {
				"project-1": { isCollapsed: true },
			},
			projectGroups: [
				projectGroup({
					projectId: "project-1",
					workspaces: [
						workspace({ id: "workspace-1", projectId: "project-1" }),
					],
				}),
			],
		});

		expect(rows.map((row) => row.type)).toEqual(["project", "workspace"]);
		expect(rows[0]).toMatchObject({
			type: "project",
			isCollapsed: false,
		});
	});
});
