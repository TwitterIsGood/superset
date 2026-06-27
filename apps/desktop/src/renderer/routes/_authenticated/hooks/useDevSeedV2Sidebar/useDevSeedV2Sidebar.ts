import { useEffect, useMemo, useRef } from "react";
import { env } from "renderer/env.renderer";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarCoreState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarCoreState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const SEED_FLAG_KEY = "superset:dev:v2-sidebar-seeded";
const MAX_DEV_SEED_WORKSPACES_PER_PROJECT = 1;
const MAX_DEV_SEED_WORKSPACES_TOTAL = 20;

export function getDevSidebarSeedWorkspaces(
	workspaces: AccessibleV2Workspace[],
	options: {
		maxPerProject?: number;
		maxTotal?: number;
	} = {},
): AccessibleV2Workspace[] {
	const maxPerProject =
		options.maxPerProject ?? MAX_DEV_SEED_WORKSPACES_PER_PROJECT;
	const maxTotal = options.maxTotal ?? MAX_DEV_SEED_WORKSPACES_TOTAL;
	if (maxPerProject <= 0 || maxTotal <= 0) return [];

	const countByProjectId = new Map<string, number>();
	const seedWorkspaces: AccessibleV2Workspace[] = [];

	for (const workspace of workspaces) {
		if (workspace.isInSidebar) continue;
		const projectCount = countByProjectId.get(workspace.projectId) ?? 0;
		if (projectCount >= maxPerProject) continue;

		countByProjectId.set(workspace.projectId, projectCount + 1);
		seedWorkspaces.push(workspace);
		if (seedWorkspaces.length >= maxTotal) break;
	}

	return seedWorkspaces;
}

/**
 * Auto-pins accessible v2 workspaces in dev so a fresh worktree's sidebar
 * isn't blank. Chromium's localStorage is per-origin: the dev Vite origin
 * (`http://localhost:<port>`) can't share data with the packaged `file://`
 * origin, so copying prod's leveldb seeds the wrong namespace.
 *
 * Keep this intentionally small and one-shot. The loaded perf fixture can have
 * hundreds of workspaces; pinning all of them creates a local collection write
 * storm and can trigger repeated live-query renders in fresh dev worktrees.
 */
export function useDevSeedV2Sidebar(): void {
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarCoreState();
	const { all: accessibleWorkspaces } = useAccessibleV2Workspaces();
	const attemptedRef = useRef(false);
	const seedWorkspaces = useMemo(
		() => getDevSidebarSeedWorkspaces(accessibleWorkspaces),
		[accessibleWorkspaces],
	);

	useEffect(() => {
		if (env.NODE_ENV !== "development") return;
		if (attemptedRef.current) return;
		if (window.localStorage.getItem(SEED_FLAG_KEY) === "1") return;
		if (accessibleWorkspaces.length === 0) return;
		if (collections.v2WorkspaceLocalState.state.size > 0) {
			attemptedRef.current = true;
			window.localStorage.setItem(SEED_FLAG_KEY, "1");
			return;
		}

		attemptedRef.current = true;
		if (seedWorkspaces.length === 0) {
			window.localStorage.setItem(SEED_FLAG_KEY, "1");
			return;
		}

		for (const workspace of seedWorkspaces) {
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		}
		window.localStorage.setItem(SEED_FLAG_KEY, "1");
	}, [
		accessibleWorkspaces.length,
		collections,
		ensureWorkspaceInSidebar,
		seedWorkspaces,
	]);
}
