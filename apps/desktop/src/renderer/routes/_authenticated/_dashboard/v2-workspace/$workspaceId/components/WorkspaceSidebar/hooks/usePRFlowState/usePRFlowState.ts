import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import {
	type PullRequest as FlowPullRequest,
	getPRFlowState,
	type PRFlowState,
} from "../../components/PRActionHeader/utils/getPRFlowState";

interface UsePRFlowStateResult {
	flowState: PRFlowState;
	onRetry: () => void;
}

interface UsePRFlowStateOptions {
	enabled?: boolean;
}

export function usePRFlowState(
	workspaceId: string,
	options: UsePRFlowStateOptions = {},
): UsePRFlowStateResult {
	const enabled = options.enabled ?? true;
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: enabled && !!workspaceId,
			refetchInterval: enabled ? 10_000 : false,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);

	const syncQuery = workspaceTrpc.git.getBranchSyncStatus.useQuery(
		{ workspaceId },
		{
			enabled: enabled && !!workspaceId,
			refetchInterval: enabled ? 10_000 : false,
			refetchOnWindowFocus: true,
			staleTime: 5_000,
		},
	);

	const flowState = useMemo(() => {
		if (!enabled) return { kind: "idle" } satisfies PRFlowState;
		return getPRFlowState({
			pr: (prQuery.data as FlowPullRequest | null) ?? null,
			sync: syncQuery.data ?? null,
			isLoading: prQuery.isLoading || syncQuery.isLoading,
			isAgentRunning: false,
			loadError:
				(prQuery.error as Error | null) ??
				(syncQuery.error as Error | null) ??
				null,
		});
	}, [
		enabled,
		prQuery.data,
		prQuery.error,
		prQuery.isLoading,
		syncQuery.data,
		syncQuery.error,
		syncQuery.isLoading,
	]);

	return {
		flowState,
		onRetry: () => {
			if (!enabled) return;
			void prQuery.refetch();
			void syncQuery.refetch();
		},
	};
}
