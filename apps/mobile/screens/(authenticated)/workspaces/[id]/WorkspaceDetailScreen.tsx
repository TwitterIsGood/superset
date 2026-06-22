import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { useAuthenticatedChrome } from "@/screens/(authenticated)/components/AuthenticatedChromeContext";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { WorkspaceMobileShell } from "./components/WorkspaceMobileShell";

type WorkspaceListRow = Awaited<
	ReturnType<typeof apiClient.v2Workspace.list.query>
>[number];
type HostListRow = Awaited<
	ReturnType<typeof apiClient.host.list.query>
>[number];
type HostFallback = {
	machineId: string;
	name: string;
	isOnline: boolean;
	updatedAt: Date;
};

function toHostFallback(row: HostListRow): HostFallback {
	return {
		machineId: row.id,
		name: row.name,
		isOnline: row.online,
		updatedAt: row.updatedAt,
	};
}

export function WorkspaceDetailScreen() {
	const { id, terminalId } = useLocalSearchParams<{
		id: string;
		terminalId?: string;
	}>();
	const insets = useSafeAreaInsets();
	const collections = useCollections();
	const { data: session } = useSession();
	const currentUserId = session?.user?.id ?? null;
	const { activeOrganizationId } = useOrganizations();
	const { setTabBarHidden } = useAuthenticatedChrome();
	const workspaceId = id ?? "";
	const [fallbackWorkspace, setFallbackWorkspace] =
		useState<WorkspaceListRow | null>(null);
	const [fallbackStatus, setFallbackStatus] = useState<
		"idle" | "loading" | "loaded" | "error"
	>("idle");
	const [fallbackHost, setFallbackHost] = useState<HostFallback | null>(null);
	const [fallbackHostStatus, setFallbackHostStatus] = useState<
		"idle" | "loading" | "loaded" | "error"
	>("idle");

	useEffect(() => {
		setTabBarHidden(true);
		return () => setTabBarHidden(false);
	}, [setTabBarHidden]);

	const { data: workspaceRows = [], isReady: workspaceReady } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const electricWorkspace = workspaceRows[0] ?? null;
	const scopedFallbackWorkspace =
		fallbackWorkspace?.id === workspaceId ? fallbackWorkspace : null;
	const workspace = electricWorkspace ?? scopedFallbackWorkspace;

	useEffect(() => {
		if (electricWorkspace || !workspaceId || !activeOrganizationId) {
			setFallbackWorkspace(null);
			setFallbackStatus("idle");
			return;
		}

		let cancelled = false;
		setFallbackStatus("loading");
		apiClient.v2Workspace.list
			.query({ organizationId: activeOrganizationId })
			.then((rows) => {
				if (cancelled) return;
				setFallbackWorkspace(
					rows.find((row) => row.id === workspaceId) ?? null,
				);
				setFallbackStatus("loaded");
			})
			.catch(() => {
				if (!cancelled) setFallbackStatus("error");
			});

		return () => {
			cancelled = true;
		};
	}, [activeOrganizationId, electricWorkspace, workspaceId]);

	const { data: projectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) => eq(projects.id, workspace?.projectId ?? "")),
		[collections, workspace?.projectId],
	);
	const project = projectRows[0] ?? null;

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) => eq(hosts.machineId, workspace?.hostId ?? "")),
		[collections, workspace?.hostId],
	);
	const electricHost = hostRows[0] ?? null;
	const scopedFallbackHost =
		fallbackHost?.machineId === workspace?.hostId ? fallbackHost : null;
	const fallbackHostBelongsToAnotherWorkspace =
		Boolean(fallbackHost) && fallbackHost?.machineId !== workspace?.hostId;
	const hostSnapshotIsSettled =
		fallbackHostStatus === "loaded" || fallbackHostStatus === "error";
	const host =
		scopedFallbackHost ??
		(hostSnapshotIsSettled && !fallbackHostBelongsToAnotherWorkspace
			? electricHost
			: null);

	useEffect(() => {
		if (!workspace?.hostId || !activeOrganizationId) {
			setFallbackHost(null);
			setFallbackHostStatus("idle");
			return;
		}

		let cancelled = false;
		setFallbackHostStatus("loading");
		const knownHostName =
			electricHost?.name ?? `Host ${workspace.hostId.slice(0, 8)}`;

		const markHostReachableFromControlPlane = () => {
			setFallbackHost({
				machineId: workspace.hostId,
				name: knownHostName,
				isOnline: true,
				updatedAt: new Date(),
			});
			setFallbackHostStatus("loaded");
		};

		const loadRelayAwareHost = async () => {
			let found: HostListRow | undefined;
			try {
				const hosts = await apiClient.host.list.query({
					organizationId: activeOrganizationId,
				});
				if (cancelled) return;
				found = hosts.find((row) => row.id === workspace.hostId);
				if (found?.online) {
					setFallbackHost(toHostFallback(found));
					setFallbackHostStatus("loaded");
					return;
				}
			} catch {
				// Fall through to the workspace-control probe below. `host.list` can
				// miss local/dev relay memory, but a host-control route is the product
				// authority for whether this Worktree can be driven from mobile.
			}

			try {
				await apiClient.v2Workspace.listTerminals.query({
					workspaceId: workspace.id,
				});
				if (cancelled) return;
				markHostReachableFromControlPlane();
			} catch {
				if (cancelled) return;
				setFallbackHost(found ? toHostFallback(found) : null);
				setFallbackHostStatus(found ? "loaded" : "error");
			}
		};

		void loadRelayAwareHost();

		return () => {
			cancelled = true;
		};
	}, [
		activeOrganizationId,
		electricHost?.name,
		workspace?.hostId,
		workspace?.id,
	]);

	const { data: hostAccessRows = [], isReady: hostAccessReady } = useLiveQuery(
		(q) =>
			q
				.from({ hostAccesses: collections.v2UsersHosts })
				.where(({ hostAccesses }) =>
					eq(hostAccesses.hostId, workspace?.hostId ?? ""),
				),
		[collections, workspace?.hostId],
	);
	const hasElectricHostAccess =
		currentUserId && (hostAccessReady || hostAccessRows.length > 0)
			? hostAccessRows.some((access) => access.userId === currentUserId)
			: null;
	const hasHostAccess = scopedFallbackHost
		? true
		: fallbackHostBelongsToAnotherWorkspace ||
				fallbackHostStatus === "idle" ||
				fallbackHostStatus === "loading"
			? null
			: fallbackHostStatus === "loaded"
				? false
				: hasElectricHostAccess;

	const { data: chatSessions = [] } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspace?.id ?? ""),
				),
		[collections, workspace?.id],
	);
	const currentUserChatSessions = useMemo(
		() =>
			currentUserId
				? chatSessions.filter((session) => session.createdBy === currentUserId)
				: [],
		[chatSessions, currentUserId],
	);

	return (
		<View className="flex-1 bg-[#111116]">
			{!workspace &&
			!workspaceReady &&
			fallbackStatus !== "loaded" &&
			fallbackStatus !== "error" ? (
				<View className="gap-4 px-3" style={{ paddingTop: insets.top + 16 }}>
					<Skeleton className="h-5 w-52 bg-[#1a1a20]" />
					<Skeleton className="h-20 rounded-md bg-[#1a1a20]" />
					<Skeleton className="h-32 rounded-md bg-[#1a1a20]" />
				</View>
			) : !workspace ? (
				<View className="px-3" style={{ paddingTop: insets.top + 16 }}>
					<View className="rounded-md bg-[#1a1a20] px-3 py-3">
						<Text className="text-sm font-semibold text-[#d9d9df]">
							Workspace not found
						</Text>
						<Text className="mt-1 text-xs text-[#8b8b96]">
							This workspace is not available in the current organization.
						</Text>
					</View>
				</View>
			) : (
				<WorkspaceMobileShell
					workspace={workspace}
					project={project}
					host={host}
					hasHostAccess={hasHostAccess}
					chatSessions={currentUserChatSessions}
					initialTerminalId={typeof terminalId === "string" ? terminalId : null}
				/>
			)}
		</View>
	);
}
