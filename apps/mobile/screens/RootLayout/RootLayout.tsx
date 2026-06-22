import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { useSession } from "@/lib/auth/client";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

type DevMenuPreferencesModule = {
	setPreferencesAsync?: (settings: {
		showFloatingActionButton?: boolean;
	}) => Promise<void>;
};

function useHideDevMenuFloatingActionButton() {
	useEffect(() => {
		if (!__DEV__) return;
		const devMenuPreferences =
			requireOptionalNativeModule<DevMenuPreferencesModule>(
				"DevMenuPreferences",
			);
		void devMenuPreferences
			?.setPreferencesAsync?.({ showFloatingActionButton: false })
			.catch(() => {
				// The module is absent outside Expo dev-client builds.
			});
	}, []);
}

export function RootLayout() {
	useHideDevMenuFloatingActionButton();
	const { data: session, isPending } = useSession();

	if (isPending) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<PostHogProvider>
					<ThemeProvider value={NAV_THEME.dark}>
						<Stack screenOptions={{ headerShown: false }}>
							<Stack.Protected guard={!!session}>
								<Stack.Screen name="(authenticated)" />
							</Stack.Protected>
							<Stack.Protected guard={!session}>
								<Stack.Screen name="(auth)" />
							</Stack.Protected>
						</Stack>
						<PostHogUserIdentifier />
						<PortalHost />
					</ThemeProvider>
				</PostHogProvider>
			</QueryClientProvider>
		</GestureHandlerRootView>
	);
}
