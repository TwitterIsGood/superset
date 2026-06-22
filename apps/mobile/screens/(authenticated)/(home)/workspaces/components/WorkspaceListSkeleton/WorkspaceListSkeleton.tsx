import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceListSkeleton() {
	return (
		<View className="gap-5">
			{[0, 1].map((group) => (
				<View key={group} className="gap-3">
					<View className="flex-row items-center gap-2 px-1">
						<Skeleton className="size-5 rounded-md bg-[#161920]" />
						<View className="flex-1 gap-2">
							<Skeleton className="h-3 w-36 bg-[#161920]" />
							<Skeleton className="h-2.5 w-52 bg-[#161920]" />
						</View>
					</View>
					{[0, 1].map((row) => (
						<View
							key={row}
							className="rounded-md border border-[#23262d] bg-[#101216] px-3 py-2"
						>
							<View className="flex-row gap-2.5">
								<Skeleton className="size-5 rounded-md bg-[#161920]" />
								<View className="flex-1 gap-2">
									<Skeleton className="h-3.5 w-40 bg-[#161920]" />
									<Skeleton className="h-2.5 w-56 bg-[#161920]" />
								</View>
							</View>
						</View>
					))}
				</View>
			))}
		</View>
	);
}
