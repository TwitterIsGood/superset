export interface PaneLayoutSyncState {
	workspaceId: string;
	lastSyncedSnapshot: string;
	hydrated: boolean;
}

export function createPaneLayoutSyncState(
	workspaceId: string,
	initialSnapshot: string,
): PaneLayoutSyncState {
	return {
		workspaceId,
		lastSyncedSnapshot: initialSnapshot,
		hydrated: false,
	};
}

export function resetPaneLayoutSyncState(
	state: PaneLayoutSyncState,
	workspaceId: string,
	initialSnapshot: string,
) {
	state.workspaceId = workspaceId;
	state.lastSyncedSnapshot = initialSnapshot;
	state.hydrated = false;
}

export function shouldHydratePaneLayout(input: {
	state: PaneLayoutSyncState;
	workspaceId: string;
	nextSnapshot: string;
	hasHydrationSource: boolean;
}): boolean {
	if (input.state.workspaceId !== input.workspaceId) return false;
	if (!input.hasHydrationSource) return false;
	if (!input.state.hydrated) return true;
	return input.nextSnapshot !== input.state.lastSyncedSnapshot;
}

export function markPaneLayoutHydrated(
	state: PaneLayoutSyncState,
	workspaceId: string,
	snapshot: string,
) {
	state.workspaceId = workspaceId;
	state.lastSyncedSnapshot = snapshot;
	state.hydrated = true;
}

export function shouldPersistPaneLayout(input: {
	state: PaneLayoutSyncState;
	workspaceId: string;
	nextSnapshot: string;
}): boolean {
	if (input.state.workspaceId !== input.workspaceId) return false;
	if (!input.state.hydrated) return false;
	return input.nextSnapshot !== input.state.lastSyncedSnapshot;
}

export function markPaneLayoutPersisted(
	state: PaneLayoutSyncState,
	workspaceId: string,
	snapshot: string,
) {
	state.workspaceId = workspaceId;
	state.lastSyncedSnapshot = snapshot;
}
