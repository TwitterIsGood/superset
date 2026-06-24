import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PaneViewerData } from "../../types";
import {
	createPaneLayoutSyncState,
	markPaneLayoutHydrated,
	markPaneLayoutPersisted,
	resetPaneLayoutSyncState,
	shouldHydratePaneLayout,
	shouldPersistPaneLayout,
} from "./paneLayoutSync";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

function getSnapshot(state: WorkspaceState<PaneViewerData>): string {
	return JSON.stringify(state);
}

export function useV2WorkspacePaneLayout() {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const collections = useCollections();
	// Keep the volatile pane store scoped to the route workspace. During fast
	// workspace switches, live queries can briefly return stale rows; sharing
	// the same store across that boundary lets panes from one worktree render
	// and persist under another.
	const workspaceRuntime = useMemo(
		() => ({
			workspaceId,
			store: createWorkspaceStore<PaneViewerData>({
				initialState: EMPTY_STATE,
			}),
		}),
		[workspaceId],
	);
	const { store } = workspaceRuntime;
	const emptySnapshot = getSnapshot(EMPTY_STATE);
	const syncStateRef = useRef(
		createPaneLayoutSyncState(workspaceId, emptySnapshot),
	);

	const { data: localWorkspaceRows = [], isReady: isPaneLayoutReady } =
		useLiveQuery(
			(query) =>
				query
					.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
					.where(({ v2WorkspaceLocalState }) =>
						eq(v2WorkspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
	const localWorkspaceState =
		localWorkspaceRows.find((row) => row.workspaceId === workspaceId) ?? null;
	const persistedPaneLayout = useMemo(
		() =>
			localWorkspaceState?.workspaceId === workspaceId
				? ((localWorkspaceState.paneLayout as
						| WorkspaceState<PaneViewerData>
						| undefined) ?? EMPTY_STATE)
				: EMPTY_STATE,
		[localWorkspaceState, workspaceId],
	);
	const hasPaneLayoutHydrationSource =
		Boolean(localWorkspaceState) || isPaneLayoutReady;

	useEffect(() => {
		resetPaneLayoutSyncState(syncStateRef.current, workspaceId, emptySnapshot);
	}, [emptySnapshot, workspaceId]);

	useEffect(() => {
		const nextSnapshot = getSnapshot(persistedPaneLayout);
		if (
			!shouldHydratePaneLayout({
				state: syncStateRef.current,
				workspaceId,
				nextSnapshot,
				hasHydrationSource: hasPaneLayoutHydrationSource,
			})
		) {
			return;
		}

		markPaneLayoutHydrated(syncStateRef.current, workspaceId, nextSnapshot);
		store.getState().replaceState(persistedPaneLayout);
	}, [hasPaneLayoutHydrationSource, persistedPaneLayout, store, workspaceId]);

	useEffect(() => {
		const unsubscribe = store.subscribe((nextStore) => {
			const nextWorkspaceState: WorkspaceState<PaneViewerData> = {
				version: nextStore.version,
				tabs: nextStore.tabs,
				activeTabId: nextStore.activeTabId,
			};
			const nextSnapshot = getSnapshot(nextWorkspaceState);
			if (
				!shouldPersistPaneLayout({
					state: syncStateRef.current,
					workspaceId,
					nextSnapshot,
				})
			) {
				return;
			}

			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				return;
			}

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = nextWorkspaceState;
			});
			markPaneLayoutPersisted(syncStateRef.current, workspaceId, nextSnapshot);
		});

		return () => {
			unsubscribe();
		};
	}, [collections, store, workspaceId]);

	return { store, isPaneLayoutReady };
}
