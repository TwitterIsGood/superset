import { useLiveQuery } from "@tanstack/react-db";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
	AlertTriangle,
	CalendarClock,
	ChevronLeft,
	FolderGit2,
	GitBranch,
	Link2,
	type LucideIcon,
	RefreshCw,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
	getBottomOverlayListFooterHeight,
	getBottomOverlayScrollPadding,
} from "@/lib/layout";
import { apiClient } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import {
	buildTaskRows,
	flattenTaskGroups,
	type TaskListItem,
} from "../../(tasks)/tasks/utils/buildTaskRows";

type TaskSnapshot = Awaited<
	ReturnType<typeof apiClient.task.byIdOrSlug.query>
> | null;
type TaskStatusListRow = Awaited<
	ReturnType<typeof apiClient.task.statuses.list.query>
>[number];
type FallbackTaskStatus = TaskStatusListRow & {
	progressPercent: number | null;
};
type FallbackStatus = "idle" | "loading" | "loaded" | "error";

const priorityLabels: Record<TaskListItem["priority"], string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
	none: "No priority",
};

function priorityClassName(priority: TaskListItem["priority"]): string {
	if (priority === "urgent") return "text-red-400";
	if (priority === "high") return "text-orange-400";
	if (priority === "medium") return "text-amber-400";
	if (priority === "low") return "text-sky-400";
	return "text-[#8b949e]";
}

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function fallbackErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return "Could not load this task from the API.";
}

function DetailRow({
	icon,
	label,
	value,
	valueClassName,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<View className="min-h-11 flex-row items-center gap-2.5 border-white/8 border-b py-2">
			<Icon as={icon} className="size-3.5 text-[#8b8b96]" />
			<View className="min-w-0 flex-1">
				<Text className="text-[11px] text-[#8b8b96]">{label}</Text>
				<Text
					className={cn(
						"text-[14px] font-medium text-[#f2f2f4]",
						valueClassName,
					)}
					numberOfLines={1}
				>
					{value}
				</Text>
			</View>
		</View>
	);
}

function CompactPill({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<View className="rounded-full bg-white/10 px-2.5 py-1">
			<Text className={cn("text-[12px] font-medium text-[#d9d9df]", className)}>
				{children}
			</Text>
		</View>
	);
}

export function TaskDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const bottomOverlayPadding = getBottomOverlayScrollPadding(insets.bottom);
	const bottomOverlayFooterHeight = getBottomOverlayListFooterHeight(
		insets.bottom,
	);
	const collections = useCollections();
	const taskLookup = id ?? "";
	const [fallbackTask, setFallbackTask] = useState<TaskSnapshot>(null);
	const [fallbackStatuses, setFallbackStatuses] = useState<
		FallbackTaskStatus[]
	>([]);
	const [fallbackStatus, setFallbackStatus] = useState<FallbackStatus>("idle");
	const [fallbackError, setFallbackError] = useState<string | null>(null);

	const loadFallbackTask = useCallback(async () => {
		if (!taskLookup) return;
		setFallbackStatus("loading");
		setFallbackError(null);
		try {
			const [taskSnapshot, statusRows] = await Promise.all([
				apiClient.task.byIdOrSlug.query(taskLookup),
				apiClient.task.statuses.list.query(),
			]);
			setFallbackTask(taskSnapshot);
			setFallbackStatuses(
				statusRows.map((status) => ({
					...status,
					progressPercent: null,
				})),
			);
			setFallbackStatus("loaded");
		} catch (error) {
			setFallbackTask(null);
			setFallbackStatuses([]);
			setFallbackError(fallbackErrorMessage(error));
			setFallbackStatus("error");
		}
	}, [taskLookup]);

	const { data: tasks = [], isReady: tasksReady } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);
	const { data: statuses = [] } = useLiveQuery(
		(q) => q.from({ statuses: collections.taskStatuses }),
		[collections],
	);
	const { data: projects = [] } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);
	const { data: workspaces = [] } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: hosts = [] } = useLiveQuery(
		(q) => q.from({ hosts: collections.v2Hosts }),
		[collections],
	);

	useEffect(() => {
		if (!taskLookup) {
			setFallbackTask(null);
			setFallbackStatuses([]);
			setFallbackStatus("idle");
			setFallbackError(null);
			return;
		}
		if (tasks.some((row) => row.id === taskLookup || row.slug === taskLookup)) {
			setFallbackTask(null);
			setFallbackStatuses([]);
			setFallbackStatus("idle");
			setFallbackError(null);
			return;
		}
		void loadFallbackTask();
	}, [loadFallbackTask, taskLookup, tasks]);

	const effectiveTasks =
		tasks.length > 0 ? tasks : fallbackTask ? [fallbackTask] : [];
	const effectiveStatuses = statuses.length > 0 ? statuses : fallbackStatuses;

	const task = useMemo(() => {
		const taskRows = flattenTaskGroups(
			buildTaskRows({
				tasks: effectiveTasks,
				statuses: effectiveStatuses,
				projects,
				workspaces,
				hosts,
			}),
		);
		return (
			taskRows.find(
				(row) => row.id === taskLookup || row.slug === taskLookup,
			) ?? null
		);
	}, [
		effectiveStatuses,
		effectiveTasks,
		hosts,
		projects,
		taskLookup,
		workspaces,
	]);
	const fallbackFinished =
		fallbackStatus === "loaded" || fallbackStatus === "error";

	const handleOpenWorkspace = () => {
		if (!task?.workspaceId) return;
		router.push({
			pathname: "/workspaces/[id]",
			params: { id: task.workspaceId },
		});
	};

	return (
		<View className="flex-1 bg-[#050507]">
			<View
				className="bg-[#050507] px-5 pb-3"
				style={{ paddingTop: insets.top + 12 }}
			>
				<View className="h-14 flex-row items-center gap-3">
					<Pressable
						onPress={() => router.back()}
						accessibilityRole="button"
						accessibilityLabel="Back"
						className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15"
					>
						<Icon as={ChevronLeft} className="size-8 text-[#f2f2f4]" />
					</Pressable>
					<View className="min-w-0 flex-1">
						<Text
							className="min-w-0 text-[19px] font-semibold text-[#f2f2f4]"
							numberOfLines={1}
						>
							{task?.title ?? "Task"}
						</Text>
						<Text
							className="mt-0.5 text-[15px] text-[#8b8b96]"
							numberOfLines={1}
						>
							{task ? `${task.statusName} · ${task.slug}` : "任务详情"}
						</Text>
					</View>
					<Pressable
						onPress={handleOpenWorkspace}
						disabled={!task?.workspaceId}
						accessibilityRole="button"
						accessibilityLabel="Open linked workspace"
						className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15 disabled:opacity-45"
					>
						<Icon as={Link2} className="size-5 text-[#f2f2f4]" />
					</Pressable>
				</View>
			</View>

			<ScrollView
				className="flex-1 bg-[#050507]"
				contentInsetAdjustmentBehavior="automatic"
				contentInset={{ bottom: bottomOverlayPadding }}
				style={{ flex: 1 }}
				contentContainerStyle={{
					paddingTop: 14,
					paddingBottom: bottomOverlayPadding,
				}}
				scrollIndicatorInsets={{ bottom: bottomOverlayPadding }}
			>
				<View className="gap-5 px-5 pb-3">
					{!task && !tasksReady && !fallbackFinished ? (
						<View className="gap-4">
							<Skeleton className="h-5 w-40 bg-white/10" />
							<Skeleton className="h-20 rounded-md bg-white/8" />
							<Skeleton className="h-40 rounded-md bg-white/8" />
						</View>
					) : !task && fallbackStatus === "error" ? (
						<View className="gap-3 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-4">
							<View className="flex-row items-start gap-2">
								<Icon
									as={AlertTriangle}
									className="mt-0.5 size-4 text-red-400"
								/>
								<View className="min-w-0 flex-1">
									<Text className="text-[14px] font-medium text-red-300">
										Task could not load
									</Text>
									<Text className="mt-1 text-[13px] leading-5 text-[#a8a8b3]">
										{fallbackError}
									</Text>
								</View>
							</View>
							<Pressable
								onPress={loadFallbackTask}
								className="flex-row items-center gap-1.5 self-start rounded-full bg-white/10 px-3 py-1.5 active:bg-white/15"
							>
								<Icon as={RefreshCw} className="size-3.5 text-[#d9d9df]" />
								<Text className="text-[13px] font-medium text-[#d9d9df]">
									Retry
								</Text>
							</Pressable>
						</View>
					) : !task ? (
						<View className="px-1 py-3">
							<Text className="text-[15px] font-semibold text-[#d9d9df]">
								Task not found
							</Text>
							<Text className="mt-1 text-[13px] text-[#8b8b96]">
								This task is not available in the current organization.
							</Text>
						</View>
					) : (
						<>
							<View className="flex-row flex-wrap gap-2">
								<CompactPill>{task.slug}</CompactPill>
								<CompactPill>{task.statusName}</CompactPill>
								<CompactPill className={priorityClassName(task.priority)}>
									{priorityLabels[task.priority]}
								</CompactPill>
							</View>

							<View className="gap-2">
								<Text className="px-1 text-[11px] font-medium uppercase text-[#8b8b96]">
									Summary
								</Text>
								<View className="px-1">
									<Text className="text-[15px] leading-6 text-[#d9d9df]">
										{task.description?.trim() || "No description yet."}
									</Text>
									{task.syncError ? (
										<View className="mt-2 flex-row items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2">
											<Icon
												as={AlertTriangle}
												className="mt-0.5 size-4 text-red-400"
											/>
											<Text className="min-w-0 flex-1 text-sm text-red-300">
												{task.syncError}
											</Text>
										</View>
									) : null}
								</View>
							</View>

							<View className="gap-1">
								<Text className="px-1 text-[11px] font-medium uppercase text-[#8b8b96]">
									Properties
								</Text>
								<View className="gap-1">
									<DetailRow
										icon={FolderGit2}
										label="Project"
										value={task.projectName ?? "No project linked"}
									/>
									<DetailRow
										icon={Link2}
										label="Workspace"
										value={task.workspaceName ?? "No workspace linked"}
									/>
									<DetailRow
										icon={GitBranch}
										label="Branch"
										value={task.workspaceBranch ?? task.branch ?? "No branch"}
									/>
									{task.dueDate ? (
										<DetailRow
											icon={CalendarClock}
											label="Due date"
											value={formatDate(task.dueDate)}
										/>
									) : null}
									<DetailRow
										icon={CalendarClock}
										label="Updated"
										value={formatDate(task.updatedAt)}
									/>
									{task.externalProvider ? (
										<DetailRow
											icon={Link2}
											label="External sync"
											value={
												task.externalKey
													? `${task.externalProvider} ${task.externalKey}`
													: task.externalProvider
											}
										/>
									) : null}
								</View>
							</View>

							{task.workspaceId ? (
								<Pressable
									onPress={handleOpenWorkspace}
									className="flex-row items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-4 py-3 active:bg-[#d0d0d6]"
								>
									<Icon as={Link2} className="size-4 text-[#090a0c]" />
									<Text className="text-sm font-semibold text-[#090a0c]">
										Open workspace
									</Text>
								</Pressable>
							) : null}
						</>
					)}
					<View style={{ height: bottomOverlayFooterHeight }} />
				</View>
			</ScrollView>
		</View>
	);
}
