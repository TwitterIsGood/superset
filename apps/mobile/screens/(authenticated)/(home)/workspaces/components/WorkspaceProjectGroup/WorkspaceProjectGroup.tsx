import { ChevronDown, Folder, SquarePen } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { WorkspaceProjectGroup as WorkspaceProjectGroupModel } from "@/screens/(authenticated)/(home)/workspaces/utils/buildWorkspaceGroups";
import { WorkspaceRow } from "../WorkspaceRow";

interface WorkspaceProjectGroupProps {
	group: WorkspaceProjectGroupModel;
	onPressWorkspace: (workspaceId: string) => void;
}

export function WorkspaceProjectGroup({
	group,
	onPressWorkspace,
}: WorkspaceProjectGroupProps) {
	const firstWorkspaceId = group.workspaces[0]?.id ?? null;
	return (
		<View className="gap-1.5">
			<View className="h-10 flex-row items-center gap-3">
				<Icon as={Folder} className="size-6 text-[#f2f2f4]" />
				<View className="min-w-0 flex-1">
					<Text
						className="text-[19px] font-semibold text-[#f2f2f4]"
						numberOfLines={1}
					>
						{group.name}
					</Text>
				</View>
				<Icon as={ChevronDown} className="size-4 text-[#8b8b96]" />
				<Pressable
					onPress={() => {
						if (firstWorkspaceId) onPressWorkspace(firstWorkspaceId);
					}}
					disabled={!firstWorkspaceId}
					accessibilityRole="button"
					accessibilityLabel={`Open latest session in ${group.name}`}
					className="ml-auto size-8 items-center justify-center rounded-full active:bg-white/10 disabled:opacity-40"
				>
					<Icon as={SquarePen} className="size-5 text-[#a8a8b3]" />
				</Pressable>
			</View>

			<View className="gap-1">
				{group.workspaces.length > 0 ? (
					group.workspaces.map((workspace) => (
						<WorkspaceRow
							key={workspace.id}
							workspace={workspace}
							onPress={onPressWorkspace}
						/>
					))
				) : (
					<View className="py-2 pl-9">
						<Text className="text-[13px] text-[#7f7f89]">
							No workspaces in this project
						</Text>
					</View>
				)}
			</View>
		</View>
	);
}
