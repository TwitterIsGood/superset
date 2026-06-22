import { Stack } from "expo-router";

export default function HomeLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerStyle: { backgroundColor: "#090a0c" },
				headerShadowVisible: false,
				headerTintColor: "#f8fafc",
				headerTitleStyle: { color: "#f8fafc" },
			}}
		>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen
				name="workspaces/[id]/index"
				options={{
					headerShown: false,
					gestureDirection: "horizontal",
					gestureEnabled: true,
					fullScreenGestureEnabled: true,
				}}
			/>
		</Stack>
	);
}
