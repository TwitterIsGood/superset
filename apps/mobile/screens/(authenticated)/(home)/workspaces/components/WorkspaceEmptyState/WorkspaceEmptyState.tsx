import { FolderGit2 } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function WorkspaceEmptyState() {
	return (
		<View className="flex-row items-center gap-3 py-2">
			<View className="size-9 items-center justify-center rounded-full bg-white/8">
				<Icon as={FolderGit2} className="size-4 text-[#8b8b96]" />
			</View>
			<View className="min-w-0 flex-1">
				<Text className="text-[17px] font-medium text-[#d9d9df]">
					暂无 Workspace
				</Text>
				<Text className="mt-0.5 text-[13px] leading-5 text-[#8b8b96]">
					桌面端创建或同步后，这里会显示可控制的 Worktree。
				</Text>
			</View>
		</View>
	);
}
