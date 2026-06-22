import type { SelectV2Host } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useRouter } from "expo-router";
import {
	Laptop,
	ListFilter,
	MoreHorizontal,
	Search,
	SquarePen,
	TerminalSquare,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActionSheetIOS,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	type StyleProp,
	StyleSheet,
	TextInput,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import {
	getBottomOverlayListFooterHeight,
	getBottomOverlayScrollPadding,
} from "@/lib/layout";
import { apiClient } from "@/lib/trpc/client";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceListSkeleton } from "./components/WorkspaceListSkeleton";
import { WorkspaceProjectGroup } from "./components/WorkspaceProjectGroup";
import { buildWorkspaceGroups } from "./utils/buildWorkspaceGroups";

type WorkspaceListRow = Awaited<
	ReturnType<typeof apiClient.v2Workspace.list.query>
>[number];
type HostListRow = Awaited<
	ReturnType<typeof apiClient.host.list.query>
>[number];
type FallbackHost = {
	organizationId: string;
	machineId: string;
	name: string;
	isOnline: boolean;
	updatedAt: Date;
};

function toFallbackHost(row: HostListRow): FallbackHost {
	return {
		organizationId: row.organizationId,
		machineId: row.id,
		name: row.name,
		isOnline: row.online,
		updatedAt: row.updatedAt,
	};
}

function mergeHostsWithApiSnapshot(
	electricHosts: SelectV2Host[],
	apiHosts: FallbackHost[],
) {
	const hostById = new Map<string, SelectV2Host | FallbackHost>(
		electricHosts.map((host) => [host.machineId, host as SelectV2Host]),
	);
	for (const host of apiHosts) {
		hostById.set(host.machineId, host);
	}
	return Array.from(hostById.values());
}

function hostOnlineDotColor(isOnline: boolean | null | undefined): string {
	if (isOnline === true) return "#20c997";
	if (isOnline === false) return "#ef7f83";
	return "#f59e0b";
}

function AdaptiveGlassCapsule({
	children,
	isInteractive = false,
	style,
	tone = "dark",
}: {
	children: ReactNode;
	isInteractive?: boolean;
	style?: StyleProp<ViewStyle>;
	tone?: "dark" | "light";
}) {
	const glassAvailable = Platform.OS === "ios" && isGlassEffectAPIAvailable();
	const toneStyle =
		tone === "light" ? styles.glassCapsuleLight : styles.glassCapsuleDark;
	if (glassAvailable) {
		return (
			<GlassView
				colorScheme={tone === "light" ? "light" : "dark"}
				glassEffectStyle="regular"
				isInteractive={isInteractive}
				style={[styles.glassCapsule, toneStyle, style]}
				tintColor={
					tone === "light"
						? "rgba(242, 242, 244, 0.9)"
						: "rgba(22, 22, 26, 0.78)"
				}
			>
				{children}
			</GlassView>
		);
	}

	return (
		<View
			style={[
				styles.glassCapsule,
				toneStyle,
				styles.glassCapsuleFallback,
				style,
			]}
		>
			{children}
		</View>
	);
}

export function WorkspacesScreen() {
	const router = useRouter();
	const collections = useCollections();
	const { data: session } = useSession();
	const currentUserId = session?.user?.id ?? null;
	const [refreshing, setRefreshing] = useState(false);
	const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [organizationSheetOpen, setOrganizationSheetOpen] = useState(false);
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const bottomOverlayPadding = getBottomOverlayScrollPadding(insets.bottom);
	const bottomOverlayFooterHeight = getBottomOverlayListFooterHeight(
		insets.bottom,
	);
	const [fallbackWorkspaces, setFallbackWorkspaces] = useState<
		WorkspaceListRow[]
	>([]);
	const [fallbackWorkspaceStatus, setFallbackWorkspaceStatus] = useState<
		"idle" | "loading" | "loaded" | "error"
	>("idle");
	const [fallbackHosts, setFallbackHosts] = useState<FallbackHost[]>([]);
	const [fallbackHostStatus, setFallbackHostStatus] = useState<
		"idle" | "loading" | "loaded" | "error"
	>("idle");
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const { data: projects = [], isReady: projectsReady } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);
	const { data: workspaces = [], isReady: workspacesReady } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts = [], isReady: hostsReady } = useLiveQuery(
		(q) => q.from({ hosts: collections.v2Hosts }),
		[collections],
	);
	const { data: hostAccesses = [], isReady: hostAccessesReady } = useLiveQuery(
		(q) => q.from({ hostAccesses: collections.v2UsersHosts }),
		[collections],
	);

	useEffect(() => {
		if (!activeOrganizationId) {
			setFallbackWorkspaces([]);
			setFallbackWorkspaceStatus("idle");
			return;
		}
		if (workspaces.length > 0) {
			setFallbackWorkspaces([]);
			setFallbackWorkspaceStatus("idle");
			return;
		}

		let cancelled = false;
		setFallbackWorkspaceStatus("loading");
		apiClient.v2Workspace.list
			.query({ organizationId: activeOrganizationId })
			.then((rows) => {
				if (cancelled) return;
				setFallbackWorkspaces(rows);
				setFallbackWorkspaceStatus("loaded");
			})
			.catch(() => {
				if (!cancelled) setFallbackWorkspaceStatus("error");
			});

		return () => {
			cancelled = true;
		};
	}, [activeOrganizationId, workspaces.length]);

	useEffect(() => {
		if (!activeOrganizationId) {
			setFallbackHosts([]);
			setFallbackHostStatus("idle");
			return;
		}

		let cancelled = false;
		setFallbackHostStatus("loading");
		apiClient.host.list
			.query({ organizationId: activeOrganizationId })
			.then((rows) => {
				if (cancelled) return;
				setFallbackHosts(rows.map(toFallbackHost));
				setFallbackHostStatus("loaded");
			})
			.catch(() => {
				if (!cancelled) setFallbackHostStatus("error");
			});

		return () => {
			cancelled = true;
		};
	}, [activeOrganizationId]);

	const effectiveWorkspaces = useMemo(
		() =>
			workspaces.length > 0
				? workspaces
				: fallbackWorkspaces.map((workspace) => ({
						...workspace,
						taskId: null,
					})),
		[fallbackWorkspaces, workspaces],
	);
	const fallbackProjects = useMemo(
		() =>
			fallbackWorkspaces.map((workspace) => ({
				id: workspace.projectId,
				name: workspace.projectName || "Project",
				slug:
					workspace.projectName
						?.trim()
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/(^-|-$)/g, "") || workspace.projectId.slice(0, 8),
				repoCloneUrl: null,
				iconUrl: null,
			})),
		[fallbackWorkspaces],
	);
	const effectiveProjects = projects.length > 0 ? projects : fallbackProjects;
	const effectiveHosts = mergeHostsWithApiSnapshot(hosts, fallbackHosts);
	const fallbackHostAccesses =
		currentUserId && fallbackHostStatus === "loaded"
			? fallbackHosts.map((host) => ({
					organizationId: host.organizationId,
					userId: currentUserId,
					hostId: host.machineId,
				}))
			: null;
	const hostAccessRows =
		hostAccesses.length > 0
			? hostAccesses
			: (fallbackHostAccesses ?? hostAccesses);

	const workspaceGroups = useMemo(
		() =>
			buildWorkspaceGroups({
				projects: effectiveProjects,
				workspaces: effectiveWorkspaces,
				hosts: effectiveHosts,
				hostAccesses: hostAccessRows,
				currentUserId,
			}),
		[
			effectiveHosts,
			hostAccessRows,
			effectiveProjects,
			currentUserId,
			effectiveWorkspaces,
		],
	);
	const normalizedSearchQuery = searchQuery.trim().toLowerCase();
	const filteredWorkspaceGroups = useMemo(
		() =>
			workspaceGroups
				.map((group) => ({
					...group,
					workspaces: group.workspaces.filter((workspace) => {
						if (selectedHostId && workspace.hostId !== selectedHostId) {
							return false;
						}
						if (!normalizedSearchQuery) return true;
						const searchable = [
							group.name,
							workspace.displayName,
							workspace.name,
							workspace.branch,
							workspace.hostName,
						]
							.filter(Boolean)
							.join(" ")
							.toLowerCase();
						return searchable.includes(normalizedSearchQuery);
					}),
				}))
				.filter((group) => group.workspaces.length > 0),
		[normalizedSearchQuery, selectedHostId, workspaceGroups],
	);
	const isReady =
		(projectsReady && workspacesReady && hostsReady && hostAccessesReady) ||
		fallbackWorkspaceStatus === "loaded";
	const hasGroups = filteredWorkspaceGroups.length > 0;

	const handlePressWorkspace = (workspaceId: string) => {
		router.push({
			pathname: "/workspaces/[id]",
			params: { id: workspaceId },
		});
	};

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		setRefreshing(false);
	}, []);

	const handleSwitchOrganization = (organizationId: string) => {
		setOrganizationSheetOpen(false);
		void switchOrganization(organizationId);
	};

	const showNativeHomeActions = () => {
		if (Platform.OS !== "ios") {
			router.push("/(authenticated)/(more)/settings");
			return;
		}

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				options: ["取消", "设置", "刷新"],
				title: activeOrganization?.name ?? "Superset",
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				if (buttonIndex === 1) {
					router.push("/(authenticated)/(more)/settings");
				}
				if (buttonIndex === 2) {
					void onRefresh();
				}
			},
		);
	};

	const handleOpenFirstSession = () => {
		const firstWorkspace = filteredWorkspaceGroups[0]?.workspaces[0];
		if (!firstWorkspace) return;
		handlePressWorkspace(firstWorkspace.id);
	};

	return (
		<View className="flex-1 bg-[#050507]">
			<View
				className="bg-[#050507] px-5 pb-3"
				style={{ paddingTop: insets.top + 12 }}
			>
				<View className="h-16 flex-row items-center justify-between">
					<Pressable
						onPress={() => setOrganizationSheetOpen(true)}
						accessibilityRole="button"
						accessibilityLabel="Switch organization"
						className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15"
					>
						<Icon as={ListFilter} className="size-6 text-[#f2f2f4]" />
					</Pressable>
					<Text className="text-[21px] font-semibold text-[#f2f2f4]">
						Superset
					</Text>
					<Pressable
						onPress={showNativeHomeActions}
						accessibilityRole="button"
						accessibilityLabel="More options"
						className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15"
					>
						<Icon as={MoreHorizontal} className="size-6 text-[#f2f2f4]" />
					</Pressable>
				</View>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ gap: 10, paddingRight: 20 }}
				>
					<Pressable
						onPress={() => setSelectedHostId(null)}
						className={
							selectedHostId === null
								? "h-11 justify-center rounded-full bg-[#f2f2f4] px-5"
								: "h-11 justify-center rounded-full bg-white/18 px-5 active:bg-white/24"
						}
					>
						<Text
							className={
								selectedHostId === null
									? "text-[16px] font-medium text-[#050507]"
									: "text-[16px] text-[#f2f2f4]"
							}
						>
							全部
						</Text>
					</Pressable>
					{effectiveHosts.map((host) => {
						const selected = host.machineId === selectedHostId;
						const HostIcon = host.isOnline ? TerminalSquare : Laptop;
						return (
							<Pressable
								key={host.machineId}
								onPress={() => setSelectedHostId(host.machineId)}
								className={
									selected
										? "h-11 max-w-[280px] flex-row items-center gap-2 rounded-full bg-[#3b3b40] px-4"
										: "h-11 max-w-[280px] flex-row items-center gap-2 rounded-full bg-white/18 px-4 active:bg-white/24"
								}
							>
								<View
									className="size-2.5 rounded-full"
									style={{ backgroundColor: hostOnlineDotColor(host.isOnline) }}
								/>
								<Icon as={HostIcon} className="size-5 text-[#f2f2f4]" />
								<Text
									className="min-w-0 text-[16px] text-[#f2f2f4]"
									numberOfLines={1}
								>
									{host.name}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>
			</View>
			<ScrollView
				className="flex-1 bg-[#050507]"
				contentInsetAdjustmentBehavior="automatic"
				contentInset={{ bottom: bottomOverlayPadding }}
				style={{ flex: 1 }}
				contentContainerStyle={{
					paddingBottom: bottomOverlayPadding,
				}}
				scrollIndicatorInsets={{ bottom: bottomOverlayPadding }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="gap-1 px-5 py-5">
					<Text className="mb-5 text-[22px] font-semibold text-[#f2f2f4]">
						项目
					</Text>
					{hasGroups ? (
						<View className="gap-7">
							{filteredWorkspaceGroups.map((group) => (
								<WorkspaceProjectGroup
									key={group.id}
									group={group}
									onPressWorkspace={handlePressWorkspace}
								/>
							))}
						</View>
					) : !isReady ? (
						<WorkspaceListSkeleton />
					) : (
						<WorkspaceEmptyState />
					)}
					<View style={{ height: bottomOverlayFooterHeight }} />
				</View>
			</ScrollView>
			<View
				pointerEvents="box-none"
				className="absolute bottom-0 left-0 right-0 z-40 px-5 pt-3"
				style={{ paddingBottom: Math.max(insets.bottom, 12) }}
			>
				<View className="flex-row items-center gap-3">
					<AdaptiveGlassCapsule style={{ flex: 1 }}>
						<View className="h-14 flex-row items-center gap-3 px-4">
							<Icon as={Search} className="size-6 text-[#f2f2f4]" />
							<TextInput
								value={searchQuery}
								onChangeText={setSearchQuery}
								placeholder="搜索项目或 Worktree"
								placeholderTextColor="#8b8b96"
								returnKeyType="search"
								autoCapitalize="none"
								autoCorrect={false}
								spellCheck={false}
								className="min-w-0 flex-1 text-[18px] text-[#f2f2f4]"
							/>
						</View>
					</AdaptiveGlassCapsule>
					<Pressable
						onPress={handleOpenFirstSession}
						disabled={!hasGroups}
						accessibilityRole="button"
						accessibilityLabel="Open latest session"
						className={!hasGroups ? "opacity-45" : undefined}
					>
						<AdaptiveGlassCapsule isInteractive tone="light">
							<View className="h-14 flex-row items-center gap-3 px-5">
								<Icon as={SquarePen} className="size-6 text-[#050507]" />
								<Text className="text-[18px] font-semibold text-[#050507]">
									聊天
								</Text>
							</View>
						</AdaptiveGlassCapsule>
					</Pressable>
				</View>
			</View>
			<OrganizationSwitcherSheet
				isPresented={organizationSheetOpen}
				onIsPresentedChange={setOrganizationSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	glassCapsule: {
		borderRadius: 28,
		overflow: "hidden",
	},
	glassCapsuleDark: {
		backgroundColor: "rgba(24, 24, 28, 0.92)",
	},
	glassCapsuleLight: {
		backgroundColor: "rgba(242, 242, 244, 0.94)",
	},
	glassCapsuleFallback: {
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(255, 255, 255, 0.14)",
	},
});
