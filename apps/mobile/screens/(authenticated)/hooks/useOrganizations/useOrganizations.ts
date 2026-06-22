import { useLiveQuery } from "@tanstack/react-db";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

type OrganizationRow = Awaited<
	ReturnType<typeof apiClient.user.myOrganizations.query>
>[number];

export function useOrganizations() {
	const collections = useCollections();
	const [fallbackOrganizations, setFallbackOrganizations] = useState<
		OrganizationRow[]
	>([]);

	const session = authClient.useSession();
	const sessionActiveOrganizationId =
		session.data?.session?.activeOrganizationId ?? null;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	useEffect(() => {
		let cancelled = false;
		apiClient.user.myOrganizations
			.query()
			.then((rows) => {
				if (!cancelled) setFallbackOrganizations(rows);
			})
			.catch(() => {
				if (!cancelled) setFallbackOrganizations([]);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const effectiveOrganizations =
		fallbackOrganizations.length > 0
			? fallbackOrganizations
			: (organizations ?? []);
	const activeOrganizationId =
		(sessionActiveOrganizationId &&
		effectiveOrganizations.some((org) => org.id === sessionActiveOrganizationId)
			? sessionActiveOrganizationId
			: effectiveOrganizations[0]?.id) ?? null;

	const activeOrganization = effectiveOrganizations.find(
		(org) => org.id === activeOrganizationId,
	);

	const switchOrganization = async (organizationId: string) => {
		if (organizationId === sessionActiveOrganizationId) return;
		try {
			await authClient.organization.setActive({ organizationId });
			router.replace("/(authenticated)/(home)");
		} catch (error) {
			console.error(
				"[organization/switch] Failed to switch organization:",
				error,
			);
		}
	};

	return {
		organizations: effectiveOrganizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	};
}
