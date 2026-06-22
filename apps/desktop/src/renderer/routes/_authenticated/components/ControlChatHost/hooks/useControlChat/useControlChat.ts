import type { RouterOutputs } from "@superset/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useControlChatStore } from "renderer/stores/control-chat";

type ControlChatSessionData = RouterOutputs["controlChat"]["getSession"];
type ControlChatSession = RouterOutputs["controlChat"]["listSessions"][number];

function inferResourceFromPath(pathname: string): {
	kind?: "automation" | "capability" | "host" | "workspace" | "project";
	id?: string;
	label?: string;
} {
	const automationMatch = pathname.match(/\/automations\/([^/]+)/);
	if (automationMatch?.[1]) {
		return { kind: "automation", id: automationMatch[1] };
	}
	const workspaceMatch = pathname.match(/\/v2-workspace\/([^/]+)/);
	if (workspaceMatch?.[1]) {
		return { kind: "workspace", id: workspaceMatch[1] };
	}
	if (pathname.includes("/settings/tools-and-skills")) {
		return { kind: "capability", label: "Tools & Skills" };
	}
	if (pathname.includes("/settings/hosts")) {
		return { kind: "host", label: "Hosts" };
	}
	return {};
}

export function useControlChat() {
	const queryClient = useQueryClient();
	const location = useLocation();
	const { machineId } = useLocalHostService();
	const activeSessionId = useControlChatStore((state) => state.activeSessionId);
	const setActiveSessionId = useControlChatStore(
		(state) => state.setActiveSessionId,
	);

	const rendererContext = useMemo(
		() => ({
			routePath: location.pathname,
			routeId: location.href,
			resource: inferResourceFromPath(location.pathname),
			localMachineId: machineId,
		}),
		[location.href, location.pathname, machineId],
	);

	const sessionsQuery = useQuery({
		queryKey: ["control-chat", "sessions"],
		queryFn: () => apiTrpcClient.controlChat.listSessions.query(),
		refetchInterval: 15_000,
	});
	const sessions = sessionsQuery.data ?? [];

	useEffect(() => {
		if (activeSessionId) return;
		const firstSession = sessions[0];
		if (firstSession) {
			setActiveSessionId(firstSession.id);
		}
	}, [activeSessionId, sessions, setActiveSessionId]);

	const sessionQuery = useQuery({
		queryKey: ["control-chat", "session", activeSessionId],
		enabled: Boolean(activeSessionId),
		queryFn: () =>
			apiTrpcClient.controlChat.getSession.query({
				sessionId: activeSessionId ?? "",
			}),
		refetchInterval: (query) => {
			const data = query.state.data as ControlChatSessionData | undefined;
			return data?.session.activeRunId ? 1_500 : 8_000;
		},
	});

	const sendMutation = useMutation({
		mutationFn: (message: string) =>
			apiTrpcClient.controlChat.send.mutate({
				sessionId: activeSessionId ?? undefined,
				message,
				rendererContext,
			}),
		onSuccess: (data) => {
			setActiveSessionId(data.session.id);
			queryClient.setQueryData(
				["control-chat", "session", data.session.id],
				data,
			);
			queryClient.setQueryData(
				["control-chat", "sessions"],
				(previous: ControlChatSession[] | undefined) => {
					const rows = previous ?? [];
					const next = rows.filter((session) => session.id !== data.session.id);
					return [data.session, ...next];
				},
			);
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["control-chat"] });
		},
	});

	const stopMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.controlChat.stop.mutate({
				sessionId: activeSessionId ?? "",
			}),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["control-chat"] });
		},
	});

	return {
		activeSessionId,
		setActiveSessionId,
		sessions,
		sessionsQuery,
		session: sessionQuery.data ?? null,
		sessionQuery,
		sendMessage: sendMutation.mutateAsync,
		sendStatus: sendMutation.status,
		sendError: sendMutation.error,
		stop: stopMutation.mutateAsync,
		stopStatus: stopMutation.status,
		rendererContext,
	};
}
