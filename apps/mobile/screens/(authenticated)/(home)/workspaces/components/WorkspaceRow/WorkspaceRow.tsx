import {
	ArrowUpRight,
	FolderGit2,
	GitBranch,
	Link2,
	LockKeyhole,
	Monitor,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { WorkspaceListItem } from "@/screens/(authenticated)/(home)/workspaces/utils/buildWorkspaceGroups";

interface WorkspaceRowProps {
	workspace: WorkspaceListItem;
	onPress: (workspaceId: string) => void;
}

function hostDotColor(
	reachability: WorkspaceListItem["hostReachability"],
): string {
	switch (reachability) {
		case "online":
			return "#22c55e";
		case "stale":
		case "no-access":
			return "#f59e0b";
		case "offline":
			return "#6b7280";
		case "unknown":
			return "#f59e0b";
		default:
			return "#f59e0b";
	}
}

export function WorkspaceRow({ workspace, onPress }: WorkspaceRowProps) {
	const hostName = workspace.hostName ?? `Host ${workspace.hostId.slice(0, 8)}`;
	const isMain = workspace.type === "main";

	return (
		<Pressable
			onPress={() => onPress(workspace.id)}
			className="rounded-md py-2 active:bg-white/8"
		>
			<View className="flex-row items-center gap-3 pl-8">
				<View className="relative size-5 shrink-0 items-center justify-center">
					<Icon
						as={isMain ? Monitor : FolderGit2}
						className="size-4 text-[#a0a0aa]"
					/>
					<View
						className="absolute bottom-0 right-0 size-2 rounded-full border border-[#111116]"
						style={{
							backgroundColor: hostDotColor(workspace.hostReachability),
						}}
					/>
				</View>
				<View className="min-w-0 flex-1">
					<Text
						className="min-w-0 flex-1 text-[18px] font-normal text-[#f2f2f4]"
						numberOfLines={1}
					>
						{workspace.displayName}
					</Text>

					<View className="mt-0.5 h-5 flex-row items-center gap-1.5">
						<View className="flex-row items-center gap-1">
							<Icon as={GitBranch} className="size-3 text-[#8b8b96]" />
							<Text
								className="max-w-[104px] text-[12px] text-[#8b8b96]"
								numberOfLines={1}
							>
								{workspace.branch}
							</Text>
						</View>
						<Text className="text-[12px] text-[#6f6f79]">·</Text>
						<View className="flex-row items-center gap-1">
							<Text
								className="max-w-[154px] text-[12px] text-[#8b8b96]"
								numberOfLines={1}
							>
								{hostName}
							</Text>
						</View>
						{workspace.taskId ? (
							<View className="flex-row items-center gap-1">
								<Text className="text-[12px] text-[#6f6f79]">·</Text>
								<Icon as={Link2} className="size-3 text-[#8b8b96]" />
								<Text className="text-[12px] text-[#8b8b96]">Task</Text>
							</View>
						) : null}
						{workspace.canControlHost === false ? (
							<View className="flex-row items-center gap-1">
								<Text className="text-[12px] text-[#6f6f79]">·</Text>
								<Icon as={LockKeyhole} className="size-3 text-amber-400" />
								<Text className="text-[12px] text-amber-400">无主机权限</Text>
							</View>
						) : null}
					</View>
				</View>
				<Icon as={ArrowUpRight} className="mr-0.5 size-5 text-[#8b8b96]" />
			</View>
		</Pressable>
	);
}
