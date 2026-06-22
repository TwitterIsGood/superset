import { useRouter } from "expo-router";
import { Bell, ChevronLeft, Palette, UserRound } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const settingsRows = [
	{
		title: "Account",
		subtitle: "Signed-in Superset session",
		icon: UserRound,
	},
	{
		title: "Appearance",
		subtitle: "System display",
		icon: Palette,
	},
	{
		title: "Notifications",
		subtitle: "Host and task alerts",
		icon: Bell,
	},
];

export function SettingsScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();

	return (
		<ScrollView
			className="flex-1 bg-[#090a0c]"
			contentContainerStyle={{ paddingTop: insets.top }}
		>
			<View className="gap-4 p-3">
				<View className="flex-row items-center gap-2">
					<Pressable
						onPress={() => router.back()}
						className="size-8 items-center justify-center rounded-md active:bg-[#171a20]"
					>
						<Icon as={ChevronLeft} className="size-5 text-[#f8fafc]" />
					</Pressable>
					<Text className="text-base font-semibold text-[#f8fafc]">
						Settings
					</Text>
				</View>

				<View className="gap-1">
					{settingsRows.map((row) => (
						<View
							key={row.title}
							className="flex-row items-center gap-3 rounded-md border border-[#23262d] bg-[#101216] px-3 py-2.5"
						>
							<Icon as={row.icon} className="size-4 text-[#8b949e]" />
							<View className="min-w-0 flex-1">
								<Text className="text-sm font-semibold text-[#f8fafc]">
									{row.title}
								</Text>
								<Text className="text-xs text-[#8b949e]" numberOfLines={1}>
									{row.subtitle}
								</Text>
							</View>
						</View>
					))}
				</View>
			</View>
		</ScrollView>
	);
}
