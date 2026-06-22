import {
	AlertTriangle,
	CalendarClock,
	ChevronRight,
	FolderGit2,
	GitBranch,
	Link2,
	Wifi,
	WifiOff,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "../../utils/buildTaskRows";

interface TaskRowProps {
	task: TaskListItem;
	onPress: (taskId: string) => void;
}

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

function formatShortDate(date: Date): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(date);
}

function hostStatusClassName(isHostOnline: boolean | null): string {
	if (isHostOnline === true) return "text-emerald-400";
	if (isHostOnline === false) return "text-[#8b949e]";
	return "text-amber-400";
}

function hostStatusLabel(isHostOnline: boolean | null): string {
	if (isHostOnline === true) return "在线";
	if (isHostOnline === false) return "离线";
	return "未知";
}

function renderHostIcon(isHostOnline: boolean | null) {
	if (isHostOnline === false) {
		return <Icon as={WifiOff} className="size-3.5 text-[#8b949e]" />;
	}
	return (
		<Icon
			as={Wifi}
			className={cn("size-3.5", hostStatusClassName(isHostOnline))}
		/>
	);
}

export function TaskRow({ task, onPress }: TaskRowProps) {
	return (
		<Pressable
			onPress={() => onPress(task.id)}
			className="rounded-md py-2.5 active:bg-white/8"
		>
			<View className="gap-0.5">
				<View className="flex-row items-center gap-2.5">
					<View
						className="size-2 rounded-full"
						style={{ backgroundColor: task.statusColor ?? "#94a3b8" }}
					/>
					<View className="min-w-0 flex-1">
						<Text
							className="text-[15px] font-normal text-[#d9d9df]"
							numberOfLines={1}
						>
							{task.title}
						</Text>
					</View>
					<Icon as={ChevronRight} className="size-3.5 text-[#8b8b96]" />
				</View>

				<View className="h-5 flex-row items-center gap-1.5 pl-4">
					<Text
						className="max-w-[90px] text-[12px] font-medium text-[#8b8b96]"
						numberOfLines={1}
					>
						{task.slug}
					</Text>
					<Text className="text-[13px] font-medium text-[#8b8b96]">
						{task.statusName}
					</Text>
					<Text className="text-[13px] text-[#6f6f79]">·</Text>
					<Text
						className={cn(
							"text-[13px] font-medium",
							priorityClassName(task.priority),
						)}
					>
						{priorityLabels[task.priority]}
					</Text>
					{task.projectName ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							<Icon as={FolderGit2} className="size-3 text-[#8b8b96]" />
							<Text
								className="max-w-[132px] text-[13px] text-[#8b8b96]"
								numberOfLines={1}
							>
								{task.projectName}
							</Text>
						</View>
					) : null}
					{task.workspaceName ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							<Icon as={Link2} className="size-3 text-[#8b8b96]" />
							<Text
								className="max-w-[132px] text-[13px] text-[#8b8b96]"
								numberOfLines={1}
							>
								{task.workspaceName}
							</Text>
						</View>
					) : task.branch ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							<Icon as={GitBranch} className="size-3 text-[#8b8b96]" />
							<Text
								className="max-w-[132px] text-[13px] text-[#8b8b96]"
								numberOfLines={1}
							>
								{task.branch}
							</Text>
						</View>
					) : null}
					{task.workspaceName ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							{renderHostIcon(task.isHostOnline)}
							<Text
								className={cn(
									"text-[13px] font-medium",
									hostStatusClassName(task.isHostOnline),
								)}
							>
								{hostStatusLabel(task.isHostOnline)}
							</Text>
						</View>
					) : null}
					{task.dueDate ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							<Icon as={CalendarClock} className="size-3 text-[#8b8b96]" />
							<Text className="text-[13px] text-[#8b8b96]">
								Due {formatShortDate(task.dueDate)}
							</Text>
						</View>
					) : null}
					{task.syncError ? (
						<View className="flex-row items-center gap-1">
							<Text className="text-[13px] text-[#6f6f79]">·</Text>
							<Icon as={AlertTriangle} className="size-3 text-red-400" />
							<Text className="text-[13px] font-medium text-red-400">
								Sync error
							</Text>
						</View>
					) : null}
					{task.externalKey ? (
						<View className="rounded bg-[#1d1d24] px-1 py-0.5">
							<Text className="text-[10px] text-[#a8a8b3]" numberOfLines={1}>
								{task.externalKey}
							</Text>
						</View>
					) : null}
				</View>
			</View>
		</Pressable>
	);
}
