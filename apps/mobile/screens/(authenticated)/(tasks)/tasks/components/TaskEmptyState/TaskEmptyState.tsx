import { ClipboardList } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function TaskEmptyState() {
	return (
		<View className="items-center justify-center gap-3 px-6 py-14">
			<View className="size-10 items-center justify-center rounded-full bg-white/10">
				<Icon as={ClipboardList} className="size-5 text-[#8b8b96]" />
			</View>
			<View className="gap-1">
				<Text className="text-center text-[15px] font-semibold text-[#f2f2f4]">
					暂无同步任务
				</Text>
				<Text className="text-center text-[13px] text-[#8b8b96]">
					当前组织还没有同步到手机端的任务。
				</Text>
			</View>
		</View>
	);
}
