import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

export interface V2WorkspacesProjectGroup {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	workspaces: AccessibleV2Workspace[];
	latestCreatedAt: number;
}

export interface V2WorkspacesProjectMeta {
	isCollapsed?: boolean;
}

export type V2WorkspacesVirtualRow =
	| {
			type: "project";
			project: V2WorkspacesProjectGroup;
			isCollapsed: boolean;
	  }
	| {
			type: "workspace";
			workspace: AccessibleV2Workspace;
	  };

export function buildV2WorkspacesVirtualRows({
	currentWorkspaceId,
	projectGroups,
	projectMetaById,
}: {
	currentWorkspaceId: string | null;
	projectGroups: V2WorkspacesProjectGroup[];
	projectMetaById: Record<string, V2WorkspacesProjectMeta | undefined>;
}): V2WorkspacesVirtualRow[] {
	const rows: V2WorkspacesVirtualRow[] = [];

	for (const project of projectGroups) {
		const containsCurrent =
			currentWorkspaceId != null &&
			project.workspaces.some(
				(workspace) => workspace.id === currentWorkspaceId,
			);
		const isCollapsed =
			(projectMetaById[project.projectId]?.isCollapsed ?? false) &&
			!containsCurrent;

		rows.push({ type: "project", project, isCollapsed });

		if (isCollapsed) continue;

		for (const workspace of project.workspaces) {
			rows.push({ type: "workspace", workspace });
		}
	}

	return rows;
}

export function getV2WorkspaceProjectHeaderIndices(
	rows: V2WorkspacesVirtualRow[],
): number[] {
	const indices: number[] = [];
	for (let index = 0; index < rows.length; index += 1) {
		if (rows[index]?.type === "project") {
			indices.push(index);
		}
	}
	return indices;
}
