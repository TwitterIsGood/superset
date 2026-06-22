import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { TaskStatusGroup as TaskStatusGroupModel } from "../../utils/buildTaskRows";
import { TaskRow } from "../TaskRow";

interface TaskStatusGroupProps {
	group: TaskStatusGroupModel;
	onPressTask: (taskId: string) => void;
}

export function TaskStatusGroup({ group, onPressTask }: TaskStatusGroupProps) {
	return (
		<View className="gap-0.5">
			<View className="h-8 flex-row items-center gap-2">
				<View
					className="size-2 rounded-full"
					style={{ backgroundColor: group.color ?? "#94a3b8" }}
				/>
				<Text
					className="text-[14px] font-medium text-[#d9d9df]"
					numberOfLines={1}
				>
					{group.name}
				</Text>
				<Text className="text-[12px] tabular-nums text-[#8b8b96]">
					{group.tasks.length}
				</Text>
			</View>
			<View className="gap-0.5">
				{group.tasks.map((task) => (
					<TaskRow key={task.id} task={task} onPress={onPressTask} />
				))}
			</View>
		</View>
	);
}
