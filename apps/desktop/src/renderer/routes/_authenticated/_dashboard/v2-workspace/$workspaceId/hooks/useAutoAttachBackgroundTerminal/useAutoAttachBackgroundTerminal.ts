import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import {
	clearTerminalAutoAttachSuppression,
	getTerminalAutoAttachSuppressionIdsKey,
	getTerminalBackgroundMarkerIdsKey,
	subscribeTerminalAutoAttachSuppressions,
	subscribeTerminalBackgroundMarkers,
} from "renderer/lib/terminal/terminal-background-intents";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import {
	getAttachedTerminalIdsKey,
	getAutoAttachBackgroundTerminalId,
	parseAttachedTerminalIdsKey,
} from "../../components/BackgroundTerminalsButton/BackgroundTerminalsButton.utils";
import type { PaneViewerData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

const EMPTY_MARKERS_KEY = "[]";
const AUTO_ATTACH_REFETCH_INTERVAL_MS = 5_000;

interface UseAutoAttachBackgroundTerminalArgs {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	paneLayoutReady: boolean;
}

/**
 * Remote clients can create terminal sessions on this host before this
 * renderer has a matching pane in its local-only layout. When the workspace is
 * otherwise showing no usable live terminal, surface the newest live session so
 * the host machine can observe and take over the same conversation.
 */
export function useAutoAttachBackgroundTerminal({
	workspaceId,
	store,
	paneLayoutReady,
}: UseAutoAttachBackgroundTerminalArgs): void {
	const consumedTerminalIdsRef = useRef<Set<string>>(new Set());
	const attachedTerminalIdsKey = useStore(store, (state) =>
		getAttachedTerminalIdsKey(state.tabs),
	);
	const attachedTerminalIds = useMemo(
		() => parseAttachedTerminalIdsKey(attachedTerminalIdsKey),
		[attachedTerminalIdsKey],
	);
	const getBackgroundMarkerSnapshot = useCallback(
		() => getTerminalBackgroundMarkerIdsKey(workspaceId),
		[workspaceId],
	);
	const backgroundMarkerIdsKey = useSyncExternalStore(
		subscribeTerminalBackgroundMarkers,
		getBackgroundMarkerSnapshot,
		() => EMPTY_MARKERS_KEY,
	);
	const backgroundMarkerIds = useMemo(
		() => parseAttachedTerminalIdsKey(backgroundMarkerIdsKey),
		[backgroundMarkerIdsKey],
	);
	const getAutoAttachSuppressionSnapshot = useCallback(
		() => getTerminalAutoAttachSuppressionIdsKey(workspaceId),
		[workspaceId],
	);
	const autoAttachSuppressionIdsKey = useSyncExternalStore(
		subscribeTerminalAutoAttachSuppressions,
		getAutoAttachSuppressionSnapshot,
		() => EMPTY_MARKERS_KEY,
	);
	const autoAttachSuppressionIds = useMemo(
		() => parseAttachedTerminalIdsKey(autoAttachSuppressionIdsKey),
		[autoAttachSuppressionIdsKey],
	);
	const suppressedTerminalIds = useMemo(
		() => [...new Set([...backgroundMarkerIds, ...autoAttachSuppressionIds])],
		[backgroundMarkerIds, autoAttachSuppressionIds],
	);

	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{
			enabled: paneLayoutReady,
			notifyOnChangeProps: ["data", "isSuccess"],
			refetchInterval:
				attachedTerminalIds.length === 0
					? AUTO_ATTACH_REFETCH_INTERVAL_MS
					: false,
			refetchOnWindowFocus: true,
			staleTime: 1_000,
		},
	);

	useEffect(() => {
		if (!paneLayoutReady) return;
		if (!sessionsQuery.isSuccess) return;

		const terminalId = getAutoAttachBackgroundTerminalId({
			sessions: sessionsQuery.data.sessions,
			attachedTerminalIds,
			suppressedTerminalIds,
			preferTitledBackgroundOverUntitledAttached: true,
		});
		if (!terminalId) return;
		if (consumedTerminalIdsRef.current.has(terminalId)) return;

		consumedTerminalIdsRef.current.add(terminalId);
		focusOrAddTerminalPane(store, terminalId);
	}, [
		attachedTerminalIds,
		paneLayoutReady,
		sessionsQuery.data,
		sessionsQuery.isSuccess,
		store,
		suppressedTerminalIds,
	]);

	useEffect(() => {
		if (!sessionsQuery.data) return;
		if (autoAttachSuppressionIds.length === 0) return;

		const liveTerminalIds = new Set(
			sessionsQuery.data.sessions
				.filter((session) => !session.exited)
				.map((session) => session.terminalId),
		);
		for (const terminalId of autoAttachSuppressionIds) {
			if (liveTerminalIds.has(terminalId)) continue;
			clearTerminalAutoAttachSuppression(workspaceId, terminalId);
		}
	}, [autoAttachSuppressionIds, sessionsQuery.data, workspaceId]);
}
