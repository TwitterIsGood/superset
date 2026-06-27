import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Outlet, useMatchRoute, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";
import { useDashboardSidebarCoreState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarCoreState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import type { WorkspaceSearch } from "./$workspaceId/V2WorkspacePageContent";
import { WorkspaceCreateErrorState } from "./components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "./components/WorkspaceCreatingState";
import { WorkspaceHostIncompatibleState } from "./components/WorkspaceHostIncompatibleState";
import { WorkspaceHostOfflineState } from "./components/WorkspaceHostOfflineState";
import { WorkspaceLoadingState } from "./components/WorkspaceLoadingState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { useRemoteHostStatus } from "./hooks/useRemoteHostStatus";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";

const LazyV2WorkspacePageContent = lazy(() =>
	import("./$workspaceId/V2WorkspacePageContent").then((module) => ({
		default: module.V2WorkspacePageContent,
	})),
);

function parseOpenUrlTarget(value: unknown): WorkspaceSearch["openUrlTarget"] {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseWorkspaceSearch(raw: Record<string, unknown>): WorkspaceSearch {
	return {
		terminalId: parseNonEmptyString(raw.terminalId),
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	};
}

export function V2WorkspaceLayoutContent() {
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const location = useRouterState({ select: (state) => state.location });
	const isDefaultWorkspaceRoute =
		workspaceId !== null &&
		location.pathname.replace(/\/$/, "") === `/v2-workspace/${workspaceId}`;
	const workspaceSearch = parseWorkspaceSearch(
		location.search as Record<string, unknown>,
	);
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarCoreState();
	const pendingTransaction = useWorkspaceTransactionsStore((state) =>
		workspaceId ? (state.byWorkspaceId[workspaceId] ?? null) : null,
	);
	const clearWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.clear,
	);
	const isCreatePending = pendingTransaction?.type === "insert";

	const { data: workspaces, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const { data: failedEntries } = useLiveQuery(
		(q) =>
			q
				.from({ failed: collections.failedWorkspaceCreates })
				.where(({ failed }) => eq(failed.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;
	const failedEntry = failedEntries?.[0] ?? null;

	useEffect(() => {
		if (workspace?.$synced === true && pendingTransaction?.type === "insert") {
			clearWorkspaceTransaction(workspace.id);
		}
	}, [clearWorkspaceTransaction, pendingTransaction, workspace]);

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	const hostStatus = useRemoteHostStatus(workspace);

	if (!workspaceId || !workspaces || (!workspace && !isReady)) {
		return <WorkspaceLoadingState message="Syncing workspace metadata..." />;
	}

	if (!workspace) {
		if (failedEntry) {
			return <WorkspaceCreateErrorState entry={failedEntry} />;
		}
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	if (isCreatePending) {
		return (
			<WorkspaceCreatingState
				name={workspace.name}
				branch={workspace.branch}
				startedAt={new Date(workspace.createdAt).getTime()}
				progress={pendingTransaction.progress}
			/>
		);
	}

	if (hostStatus.status === "incompatible") {
		return (
			<WorkspaceHostIncompatibleState
				hostName={hostStatus.hostName}
				hostVersion={hostStatus.hostVersion}
				minVersion={hostStatus.minVersion}
			/>
		);
	}
	if (hostStatus.status === "offline") {
		return (
			<WorkspaceHostOfflineState
				hostId={hostStatus.hostId}
				hostName={hostStatus.hostName}
			/>
		);
	}
	if (hostStatus.status === "loading") {
		return <WorkspaceLoadingState message="Checking the workspace host..." />;
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			{isDefaultWorkspaceRoute ? (
				<Suspense
					fallback={
						<output
							aria-label="Loading workspace"
							className="flex h-full w-full flex-1 items-center justify-center"
						/>
					}
				>
					<LazyV2WorkspacePageContent search={workspaceSearch} />
				</Suspense>
			) : (
				<Outlet />
			)}
		</WorkspaceProvider>
	);
}
