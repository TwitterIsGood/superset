import { useCallback } from "react";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

function scheduleWorkspacePaneRuntimeCleanup(rows: PaneLifecycleRow[]): void {
	void import(
		"renderer/routes/_authenticated/hooks/useDashboardSidebarCoreState/sidebarPaneRuntimeCleanup"
	)
		.then((module) => module.cleanupWorkspacePaneRuntimes(rows))
		.catch((error) => {
			console.warn("[dashboard-sidebar] Failed to clean pane runtimes", error);
		});
}

export function useDashboardSidebarWorkspaceRemoval() {
	const collections = useCollections();

	return useCallback(
		(workspaceId: string) => {
			const workspace = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!workspace) return;
			scheduleWorkspacePaneRuntimeCleanup([workspace]);
			collections.v2WorkspaceLocalState.delete(workspaceId);
		},
		[collections],
	);
}
