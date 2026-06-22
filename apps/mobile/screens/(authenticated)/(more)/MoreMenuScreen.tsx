import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import {
	ArrowLeftRight,
	ChevronRight,
	LogOut,
	Settings,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function MoreMenuScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { signOut } = useSignOut();
	const collections = useCollections();
	const [switching, setSwitching] = useState(false);

	const session = authClient.useSession();
	const activeOrgId = session.data?.session?.activeOrganizationId;

	const { data: orgs } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrg = orgs?.find((org) => org.id === activeOrgId);
	const orgInitial = activeOrg?.name?.charAt(0).toUpperCase() ?? "?";
	const otherOrgs = orgs?.filter((org) => org.id !== activeOrgId) ?? [];

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrgId) return;
		setSwitching(true);
		try {
			await authClient.organization.setActive({ organizationId: orgId });
			router.replace("/(authenticated)/(home)");
		} catch (error) {
			console.error("[org/switch] Failed to switch organization:", error);
		} finally {
			setSwitching(false);
		}
	};

	return (
		<ScrollView
			className="flex-1 bg-[#090a0c]"
			contentContainerStyle={{ paddingTop: insets.top + 16 }}
		>
			<View className="gap-5 px-2.5">
				{/* Org section */}
				<View className="gap-1">
					<Text className="px-1.5 text-[11px] font-medium uppercase text-[#8b949e]">
						Organization
					</Text>
					<View className="rounded-md border border-[#23262d] bg-[#101216]">
						<View className="flex-row items-center gap-3 px-3 py-2.5">
							<Avatar
								alt={activeOrg?.name ?? "Organization"}
								className="size-9"
							>
								<AvatarFallback>
									<Text className="text-sm font-semibold">{orgInitial}</Text>
								</AvatarFallback>
							</Avatar>
							<Text
								className="flex-1 text-sm font-semibold text-[#f8fafc]"
								numberOfLines={1}
							>
								{activeOrg?.name ?? "Select Organization"}
							</Text>
						</View>
						{otherOrgs.length > 0 && (
							<>
								<Separator />
								{otherOrgs.map((org) => (
									<Pressable
										key={org.id}
										onPress={() => handleSwitchOrg(org.id)}
										disabled={switching}
										className="flex-row items-center gap-3 px-3 py-2.5"
									>
										<Icon
											as={ArrowLeftRight}
											className="size-4 text-[#8b949e]"
										/>
										<Text
											className="flex-1 text-sm text-[#f8fafc]"
											numberOfLines={1}
										>
											Switch to {org.name}
										</Text>
									</Pressable>
								))}
							</>
						)}
					</View>
				</View>

				{/* Menu items */}
				<View className="gap-1">
					<Text className="px-1.5 text-[11px] font-medium uppercase text-[#8b949e]">
						General
					</Text>
					<View className="rounded-md border border-[#23262d] bg-[#101216]">
						<Pressable
							onPress={() => router.push("/(authenticated)/(more)/settings")}
							className="flex-row items-center gap-3 px-3 py-2.5"
						>
							<Icon as={Settings} className="size-4 text-[#f8fafc]" />
							<Text className="flex-1 text-sm text-[#f8fafc]">Settings</Text>
							<Icon as={ChevronRight} className="size-4 text-[#8b949e]" />
						</Pressable>
					</View>
				</View>

				{/* Sign out */}
				<View className="gap-1">
					<View className="rounded-md border border-[#23262d] bg-[#101216]">
						<Pressable
							onPress={signOut}
							className="flex-row items-center gap-3 px-3 py-2.5"
						>
							<Icon as={LogOut} className="size-4 text-red-400" />
							<Text className="text-sm text-red-400">Log out</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</ScrollView>
	);
}
