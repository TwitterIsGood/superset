import { usePathname, useSegments } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import {
	AuthenticatedChromeProvider,
	useAuthenticatedChrome,
} from "@/screens/(authenticated)/components/AuthenticatedChromeContext";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

function routeOwnsHiddenNativeTabs({
	pathname,
	segments,
}: {
	pathname: string;
	segments: string[];
}): boolean {
	return segments.includes("workspaces") || pathname.includes("/workspaces/");
}

function AuthenticatedNativeTabs() {
	const { isTabBarHidden } = useAuthenticatedChrome();
	const pathname = usePathname();
	const segments = useSegments().map(String);
	const hideNativeTabs =
		isTabBarHidden && routeOwnsHiddenNativeTabs({ pathname, segments });

	return (
		<NativeTabs
			hidden={hideNativeTabs}
			minimizeBehavior="onScrollDown"
			blurEffect="systemChromeMaterialDark"
			backgroundColor="#050507"
			iconColor={{ default: "#8b8b96", selected: "#f2f2f4" }}
			labelStyle={{
				default: { color: "#8b8b96", fontSize: 11, fontWeight: "500" },
				selected: { color: "#f2f2f4", fontSize: 11, fontWeight: "600" },
			}}
			disableTransparentOnScrollEdge
		>
			<NativeTabs.Trigger name="(home)">
				<NativeTabs.Trigger.Icon
					md="folder"
					sf={{ default: "folder", selected: "folder.fill" }}
				/>
				<NativeTabs.Trigger.Label>项目</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="(tasks)">
				<NativeTabs.Trigger.Icon
					md="checklist"
					sf={{ default: "checklist", selected: "checklist.checked" }}
				/>
				<NativeTabs.Trigger.Label>任务</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="(more)">
				<NativeTabs.Trigger.Icon
					md="settings"
					sf={{ default: "gearshape", selected: "gearshape.fill" }}
				/>
				<NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<AuthenticatedChromeProvider>
				<AuthenticatedNativeTabs />
			</AuthenticatedChromeProvider>
		</CollectionsProvider>
	);
}
