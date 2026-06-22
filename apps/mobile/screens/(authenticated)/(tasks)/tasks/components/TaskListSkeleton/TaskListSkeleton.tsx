import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

const skeletonGroups = ["backlog", "active", "done"] as const;

export function TaskListSkeleton() {
	return (
		<View className="gap-5">
			{skeletonGroups.map((group) => (
				<View key={group} className="gap-3">
					<View className="flex-row items-center gap-2 px-1">
						<Skeleton className="size-2.5 rounded-full bg-white/10" />
						<Skeleton className="h-3 w-32 bg-white/10" />
						<Skeleton className="h-3 w-8 bg-white/10" />
					</View>
					<View className="gap-1">
						<Skeleton className="h-14 rounded-md bg-white/8" />
						<Skeleton className="h-14 rounded-md bg-white/8" />
					</View>
				</View>
			))}
		</View>
	);
}
