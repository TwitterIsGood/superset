import type { UniqueIdentifier } from "@dnd-kit/core";
import { parseId } from "../../../../../../hooks/useSidebarDnd/sidebarDndIds";
import type { DashboardSidebarWorkspace } from "../../../../../../types";

export const DEFAULT_DASHBOARD_SIDEBAR_WORKSPACE_LIMIT = 8;

interface BuildDashboardSidebarVisibleItemsParams {
	flatItems: UniqueIdentifier[];
	workspacesById: ReadonlyMap<string, DashboardSidebarWorkspace>;
	activeWorkspaceId?: string | null;
	hiddenWorkspaceIds?: ReadonlySet<string>;
	workspaceLimit?: number;
	disabled?: boolean;
}

export interface DashboardSidebarVisibleItems {
	items: UniqueIdentifier[];
	visibleWorkspaceCount: number;
	totalWorkspaceCount: number;
	hiddenWorkspaceCount: number;
	isLimited: boolean;
}

export function buildDashboardSidebarVisibleItems({
	flatItems,
	workspacesById,
	activeWorkspaceId = null,
	hiddenWorkspaceIds = new Set(),
	workspaceLimit = DEFAULT_DASHBOARD_SIDEBAR_WORKSPACE_LIMIT,
	disabled = false,
}: BuildDashboardSidebarVisibleItemsParams): DashboardSidebarVisibleItems {
	if (disabled) {
		const totalWorkspaceCount = countVisibleWorkspaces(
			flatItems,
			hiddenWorkspaceIds,
		);
		return {
			items: flatItems,
			visibleWorkspaceCount: totalWorkspaceCount,
			totalWorkspaceCount,
			hiddenWorkspaceCount: 0,
			isLimited: false,
		};
	}

	const normalizedLimit = Math.max(0, Math.floor(workspaceLimit));
	const eligibleWorkspaceIds: string[] = [];
	const forcedWorkspaceIds = new Set<string>();

	for (const item of flatItems) {
		const parsed = parseId(item);
		if (parsed?.type !== "workspace") continue;
		if (hiddenWorkspaceIds.has(parsed.realId)) continue;

		eligibleWorkspaceIds.push(parsed.realId);
		const workspace = workspacesById.get(parsed.realId);
		if (
			parsed.realId === activeWorkspaceId ||
			workspace?.pendingTransaction?.type === "insert"
		) {
			forcedWorkspaceIds.add(parsed.realId);
		}
	}

	const includedWorkspaceIds = new Set<string>(
		eligibleWorkspaceIds.slice(0, normalizedLimit),
	);
	for (const workspaceId of forcedWorkspaceIds) {
		includedWorkspaceIds.add(workspaceId);
	}

	const items: UniqueIdentifier[] = [];
	for (const item of flatItems) {
		const parsed = parseId(item);
		if (!parsed) continue;

		if (parsed.type === "section") {
			items.push(item);
			continue;
		}

		if (hiddenWorkspaceIds.has(parsed.realId)) continue;
		if (includedWorkspaceIds.has(parsed.realId)) {
			items.push(item);
		}
	}

	const totalWorkspaceCount = eligibleWorkspaceIds.length;
	const visibleWorkspaceCount = includedWorkspaceIds.size;
	const hiddenWorkspaceCount = Math.max(
		0,
		totalWorkspaceCount - visibleWorkspaceCount,
	);

	return {
		items,
		visibleWorkspaceCount,
		totalWorkspaceCount,
		hiddenWorkspaceCount,
		isLimited: hiddenWorkspaceCount > 0,
	};
}

function countVisibleWorkspaces(
	flatItems: UniqueIdentifier[],
	hiddenWorkspaceIds: ReadonlySet<string>,
): number {
	let count = 0;
	for (const item of flatItems) {
		const parsed = parseId(item);
		if (
			parsed?.type === "workspace" &&
			!hiddenWorkspaceIds.has(parsed.realId)
		) {
			count++;
		}
	}
	return count;
}
