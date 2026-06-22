import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import {
	AlertTriangle,
	CheckSquare,
	Plus,
	RefreshCw,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
	getBottomOverlayListFooterHeight,
	getBottomOverlayScrollPadding,
} from "@/lib/layout";
import { apiClient } from "@/lib/trpc/client";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { TaskEmptyState } from "./components/TaskEmptyState";
import { TaskListSkeleton } from "./components/TaskListSkeleton";
import { TaskRow } from "./components/TaskRow";
import {
	buildTaskRows,
	type TaskListItem,
	type TaskStatusGroup,
} from "./utils/buildTaskRows";

type TaskListRow = Awaited<
	ReturnType<typeof apiClient.task.list.query>
>[number];
type TaskStatusListRow = Awaited<
	ReturnType<typeof apiClient.task.statuses.list.query>
>[number];
type FallbackTaskStatus = TaskStatusListRow & {
	progressPercent: number | null;
};
type FallbackStatus = "idle" | "loading" | "loaded" | "error";
type TaskListEntry =
	| {
			type: "status";
			id: string;
			name: string;
			color: string | null;
			count: number;
	  }
	| {
			type: "task";
			id: string;
			task: TaskListItem;
	  };

function formatFallbackError(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return "Could not load tasks from the API.";
}

function flattenTaskGroupsForList(groups: TaskStatusGroup[]): TaskListEntry[] {
	return groups.flatMap((group) => [
		{
			type: "status" as const,
			id: `status:${group.id}`,
			name: group.name,
			color: group.color,
			count: group.tasks.length,
		},
		...group.tasks.map((task) => ({
			type: "task" as const,
			id: `task:${task.id}`,
			task,
		})),
	]);
}

export function TasksScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const bottomOverlayPadding = getBottomOverlayScrollPadding(insets.bottom);
	const bottomOverlayFooterHeight = getBottomOverlayListFooterHeight(
		insets.bottom,
	);
	const collections = useCollections();
	const { activeOrganizationId } = useOrganizations();
	const [refreshing, setRefreshing] = useState(false);
	const [fallbackTasks, setFallbackTasks] = useState<TaskListRow["task"][]>([]);
	const [fallbackStatuses, setFallbackStatuses] = useState<
		FallbackTaskStatus[]
	>([]);
	const [createdTasks, setCreatedTasks] = useState<TaskListRow["task"][]>([]);
	const [fallbackStatus, setFallbackStatus] = useState<FallbackStatus>("idle");
	const [fallbackError, setFallbackError] = useState<string | null>(null);
	const [creatingTask, setCreatingTask] = useState(false);
	const [createTaskError, setCreateTaskError] = useState<string | null>(null);

	const { data: tasks = [], isReady: tasksReady } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);
	const { data: statuses = [], isReady: statusesReady } = useLiveQuery(
		(q) => q.from({ statuses: collections.taskStatuses }),
		[collections],
	);
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

	const electricReady =
		tasksReady &&
		statusesReady &&
		projectsReady &&
		workspacesReady &&
		hostsReady;
	const loadFallbackTasks = useCallback(async () => {
		setFallbackStatus("loading");
		setFallbackError(null);
		try {
			const [taskRows, statusRows] = await Promise.all([
				apiClient.task.list.query({ limit: 500 }),
				apiClient.task.statuses.list.query(),
			]);
			setFallbackTasks(taskRows.map((row) => row.task));
			setFallbackStatuses(
				statusRows.map((status) => ({
					...status,
					progressPercent: null,
				})),
			);
			setFallbackStatus("loaded");
		} catch (error) {
			setFallbackTasks([]);
			setFallbackStatuses([]);
			setFallbackError(formatFallbackError(error));
			setFallbackStatus("error");
		}
	}, []);

	useEffect(() => {
		if (!activeOrganizationId) {
			setFallbackTasks([]);
			setFallbackStatuses([]);
			setCreatedTasks([]);
			setFallbackStatus("idle");
			setFallbackError(null);
			setCreateTaskError(null);
			return;
		}

		if (tasks.length > 0 && statuses.length > 0) {
			setFallbackTasks([]);
			setFallbackStatuses([]);
			setFallbackStatus("idle");
			setFallbackError(null);
			return;
		}

		void loadFallbackTasks();
	}, [activeOrganizationId, loadFallbackTasks, statuses.length, tasks.length]);

	const baseTasks = tasks.length > 0 ? tasks : fallbackTasks;
	const effectiveTasks = useMemo(() => {
		if (createdTasks.length === 0) return baseTasks;
		const existingIds = new Set(baseTasks.map((task) => task.id));
		return [
			...createdTasks.filter((task) => !existingIds.has(task.id)),
			...baseTasks,
		];
	}, [baseTasks, createdTasks]);
	const effectiveStatuses = statuses.length > 0 ? statuses : fallbackStatuses;
	const taskGroups = useMemo(
		() =>
			buildTaskRows({
				tasks: effectiveTasks,
				statuses: effectiveStatuses,
				projects,
				workspaces,
				hosts,
			}),
		[effectiveTasks, effectiveStatuses, hosts, projects, workspaces],
	);
	const taskListEntries = useMemo(
		() => flattenTaskGroupsForList(taskGroups),
		[taskGroups],
	);
	const hasTasks = taskGroups.length > 0;
	const fallbackFinished =
		fallbackStatus === "loaded" || fallbackStatus === "error";
	const isReady = electricReady || fallbackFinished;
	const isUsingFallback =
		!electricReady && fallbackStatus === "loaded" && tasks.length === 0;

	const handlePressTask = (taskId: string) => {
		router.push({
			pathname: "/(authenticated)/(tasks)/[id]",
			params: { id: taskId },
		});
	};

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await loadFallbackTasks();
		setRefreshing(false);
	}, [loadFallbackTasks]);

	const handleCreateTask = useCallback(
		async (title: string | undefined) => {
			const trimmedTitle = title?.trim();
			if (!trimmedTitle || creatingTask) return;

			setCreatingTask(true);
			setCreateTaskError(null);
			try {
				const result = await apiClient.task.create.mutate({
					title: trimmedTitle,
					priority: "none",
				});
				if (result.task) {
					setCreatedTasks((current) => [result.task, ...current]);
				}
				await loadFallbackTasks();
			} catch (error) {
				setCreateTaskError(formatFallbackError(error));
			} finally {
				setCreatingTask(false);
			}
		},
		[creatingTask, loadFallbackTasks],
	);

	const showCreateTaskPrompt = useCallback(() => {
		if (Platform.OS === "ios") {
			Alert.prompt(
				"新任务",
				"创建一个 Superset 任务。",
				[
					{ text: "取消", style: "cancel" },
					{
						text: "创建",
						onPress: (title?: string) => {
							void handleCreateTask(title);
						},
					},
				],
				"plain-text",
				"",
			);
			return;
		}

		Alert.alert("新任务", "请在 iOS 设备上使用原生输入框创建任务。");
	}, [handleCreateTask]);

	const renderListHeader = () =>
		isUsingFallback || createTaskError ? (
			<View className="mb-4 gap-2">
				{isUsingFallback ? (
					<View className="flex-row items-start gap-2 rounded-md bg-white/8 px-3 py-2.5">
						<Icon as={AlertTriangle} className="mt-0.5 size-4 text-amber-400" />
						<View className="min-w-0 flex-1">
							<Text className="text-[13px] font-medium text-amber-300">
								Live task sync unavailable
							</Text>
							<Text className="mt-0.5 text-[13px] leading-5 text-[#8b8b96]">
								Showing an API snapshot while Electric catches up.
							</Text>
						</View>
					</View>
				) : null}
				{createTaskError ? (
					<View className="flex-row items-start gap-2 rounded-md bg-red-500/10 px-3 py-2.5">
						<Icon as={AlertTriangle} className="mt-0.5 size-4 text-red-400" />
						<View className="min-w-0 flex-1">
							<Text className="text-[13px] font-medium text-red-300">
								Task could not be created
							</Text>
							<Text className="mt-0.5 text-[13px] leading-5 text-[#a8a8b3]">
								{createTaskError}
							</Text>
						</View>
					</View>
				) : null}
			</View>
		) : null;

	const renderEmptyList = () => {
		if (hasTasks) return null;

		if (fallbackStatus === "error") {
			return (
				<View className="gap-3 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-4">
					<View className="flex-row items-start gap-2">
						<Icon as={AlertTriangle} className="mt-0.5 size-4 text-red-400" />
						<View className="min-w-0 flex-1">
							<Text className="text-[14px] font-medium text-red-300">
								Tasks could not load
							</Text>
							<Text className="mt-1 text-[13px] leading-5 text-[#a8a8b3]">
								{fallbackError}
							</Text>
						</View>
					</View>
					<Pressable
						onPress={loadFallbackTasks}
						className="flex-row items-center gap-1.5 self-start rounded-full bg-white/10 px-3 py-1.5 active:bg-white/15"
					>
						<Icon as={RefreshCw} className="size-3.5 text-[#d9d9df]" />
						<Text className="text-[13px] font-medium text-[#d9d9df]">
							Retry
						</Text>
					</Pressable>
				</View>
			);
		}

		if (!isReady) return <TaskListSkeleton />;
		return <TaskEmptyState />;
	};

	const renderTaskEntry = (item: TaskListEntry) => {
		if (item.type === "status") {
			return (
				<View className="h-8 flex-row items-center gap-2">
					<View
						className="size-2 rounded-full"
						style={{ backgroundColor: item.color ?? "#94a3b8" }}
					/>
					<Text
						className="text-[14px] font-medium text-[#d9d9df]"
						numberOfLines={1}
					>
						{item.name}
					</Text>
					<Text className="text-[12px] tabular-nums text-[#8b8b96]">
						{item.count}
					</Text>
				</View>
			);
		}

		return <TaskRow task={item.task} onPress={handlePressTask} />;
	};

	return (
		<View className="flex-1 bg-[#050507]">
			<View
				className="bg-[#050507] px-5 pb-3"
				style={{ paddingTop: insets.top + 12 }}
			>
				<View className="h-16 flex-row items-center justify-between">
					<View className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10">
						<Icon as={CheckSquare} className="size-6 text-[#f2f2f4]" />
					</View>
					<Text className="text-[21px] font-semibold text-[#f2f2f4]">任务</Text>
					<View className="h-12 flex-row items-center rounded-full border border-white/10 bg-white/10 px-1">
						<Pressable
							onPress={showCreateTaskPrompt}
							disabled={creatingTask}
							accessibilityRole="button"
							accessibilityLabel="Create task"
							className="size-10 items-center justify-center rounded-full active:bg-white/12 disabled:opacity-45"
						>
							{creatingTask ? (
								<ActivityIndicator size="small" />
							) : (
								<Icon as={Plus} className="size-5 text-[#f2f2f4]" />
							)}
						</Pressable>
						<View className="h-5 w-px bg-white/10" />
						<Pressable
							onPress={() => {
								void onRefresh();
							}}
							disabled={refreshing || fallbackStatus === "loading"}
							accessibilityRole="button"
							accessibilityLabel="Refresh tasks"
							className="size-10 items-center justify-center rounded-full active:bg-white/12 disabled:opacity-45"
						>
							{refreshing || fallbackStatus === "loading" ? (
								<ActivityIndicator size="small" />
							) : (
								<Icon as={RefreshCw} className="size-5 text-[#f2f2f4]" />
							)}
						</Pressable>
					</View>
				</View>
			</View>

			<ScrollView
				className="flex-1 bg-[#050507]"
				contentInsetAdjustmentBehavior="automatic"
				contentInset={{ bottom: bottomOverlayPadding }}
				keyboardShouldPersistTaps="handled"
				scrollEnabled
				style={{ flex: 1 }}
				contentContainerStyle={{
					paddingBottom: bottomOverlayPadding,
				}}
				scrollIndicatorInsets={{ bottom: bottomOverlayPadding }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="gap-0 px-5 py-5">
					{renderListHeader()}
					{hasTasks
						? taskListEntries.map((item) => (
								<View key={item.id}>{renderTaskEntry(item)}</View>
							))
						: renderEmptyList()}
					<View style={{ height: bottomOverlayFooterHeight }} />
				</View>
			</ScrollView>
		</View>
	);
}
