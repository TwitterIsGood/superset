import { Stack } from "expo-router";

export default function MoreLayout() {
	return (
		<Stack
			screenOptions={{
				headerStyle: { backgroundColor: "#090a0c" },
				headerShadowVisible: false,
				headerTintColor: "#f8fafc",
				headerTitleStyle: { color: "#f8fafc" },
			}}
		>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="settings" options={{ title: "Settings" }} />
		</Stack>
	);
}
