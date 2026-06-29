const backgroundTerminalIds = new Set<string>();
const backgroundTerminalMarkersByWorkspace = new Map<string, Set<string>>();
const markerListeners = new Set<() => void>();
const autoAttachSuppressionsByWorkspace = new Map<
	string,
	Map<string, number>
>();
const autoAttachSuppressionListeners = new Set<() => void>();
const autoAttachSuppressionTimers = new Map<
	string,
	ReturnType<typeof setTimeout>
>();

export const TERMINAL_AUTO_ATTACH_SUPPRESSION_TTL_MS = 30_000;

function emitMarkerChange(): void {
	for (const listener of markerListeners) {
		listener();
	}
}

function emitAutoAttachSuppressionChange(): void {
	for (const listener of autoAttachSuppressionListeners) {
		listener();
	}
}

function getSuppressionTimerKey(
	workspaceId: string,
	terminalId: string,
): string {
	return `${workspaceId}:${terminalId}`;
}

function getWorkspaceMarkers(workspaceId: string): Set<string> {
	const existing = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	if (existing) return existing;

	const markers = new Set<string>();
	backgroundTerminalMarkersByWorkspace.set(workspaceId, markers);
	return markers;
}

function getWorkspaceAutoAttachSuppressions(
	workspaceId: string,
): Map<string, number> {
	const existing = autoAttachSuppressionsByWorkspace.get(workspaceId);
	if (existing) return existing;

	const suppressions = new Map<string, number>();
	autoAttachSuppressionsByWorkspace.set(workspaceId, suppressions);
	return suppressions;
}

export function markTerminalForBackground(
	terminalId: string,
	workspaceId?: string,
): void {
	backgroundTerminalIds.add(terminalId);

	if (!workspaceId) return;

	const markers = getWorkspaceMarkers(workspaceId);
	if (markers.has(terminalId)) return;

	markers.add(terminalId);
	emitMarkerChange();
}

export function consumeTerminalBackgroundIntent(terminalId: string): boolean {
	return backgroundTerminalIds.delete(terminalId);
}

export function suppressTerminalAutoAttachAfterExplicitClose(
	workspaceId: string,
	terminalId: string,
	ttlMs = TERMINAL_AUTO_ATTACH_SUPPRESSION_TTL_MS,
): void {
	if (!workspaceId || !terminalId) return;

	const suppressions = getWorkspaceAutoAttachSuppressions(workspaceId);
	const expiresAt = Date.now() + ttlMs;
	const prevExpiresAt = suppressions.get(terminalId) ?? 0;
	suppressions.set(terminalId, expiresAt);

	const timerKey = getSuppressionTimerKey(workspaceId, terminalId);
	const prevTimer = autoAttachSuppressionTimers.get(timerKey);
	if (prevTimer) clearTimeout(prevTimer);
	autoAttachSuppressionTimers.set(
		timerKey,
		setTimeout(() => {
			clearTerminalAutoAttachSuppression(workspaceId, terminalId);
		}, ttlMs),
	);

	if (prevExpiresAt === expiresAt) return;
	emitAutoAttachSuppressionChange();
}

export function clearTerminalAutoAttachSuppression(
	workspaceId: string,
	terminalId: string,
): void {
	const timerKey = getSuppressionTimerKey(workspaceId, terminalId);
	const timer = autoAttachSuppressionTimers.get(timerKey);
	if (timer) {
		clearTimeout(timer);
		autoAttachSuppressionTimers.delete(timerKey);
	}

	const suppressions = autoAttachSuppressionsByWorkspace.get(workspaceId);
	if (!suppressions?.delete(terminalId)) return;

	if (suppressions.size === 0) {
		autoAttachSuppressionsByWorkspace.delete(workspaceId);
	}
	emitAutoAttachSuppressionChange();
}

export function clearTerminalBackgroundMarker(
	workspaceId: string,
	terminalId: string,
): void {
	const markers = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	if (!markers?.delete(terminalId)) return;

	if (markers.size === 0) {
		backgroundTerminalMarkersByWorkspace.delete(workspaceId);
	}
	emitMarkerChange();
}

export function getTerminalBackgroundMarkerIdsKey(workspaceId: string): string {
	const markers = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	return JSON.stringify(markers ? [...markers].sort() : []);
}

export function getTerminalAutoAttachSuppressionIdsKey(
	workspaceId: string,
): string {
	const suppressions = autoAttachSuppressionsByWorkspace.get(workspaceId);
	return JSON.stringify(suppressions ? [...suppressions.keys()].sort() : []);
}

export function subscribeTerminalBackgroundMarkers(
	listener: () => void,
): () => void {
	markerListeners.add(listener);
	return () => {
		markerListeners.delete(listener);
	};
}

export function subscribeTerminalAutoAttachSuppressions(
	listener: () => void,
): () => void {
	autoAttachSuppressionListeners.add(listener);
	return () => {
		autoAttachSuppressionListeners.delete(listener);
	};
}
