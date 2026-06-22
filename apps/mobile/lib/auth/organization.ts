import { apiClient } from "../trpc/client";
import { authClient, refreshJwt } from "./client";

type EnsureActiveOrganizationInput = {
	activeOrganizationId?: string | null;
	refetchSession?: () => Promise<unknown>;
};

export async function ensureActiveOrganization({
	activeOrganizationId,
	refetchSession,
}: EnsureActiveOrganizationInput) {
	const organizations = await apiClient.user.myOrganizations.query();
	const hasActiveOrganization =
		!!activeOrganizationId &&
		organizations.some(
			(organization) => organization.id === activeOrganizationId,
		);
	const nextOrganizationId = hasActiveOrganization
		? activeOrganizationId
		: organizations[0]?.id;

	if (!nextOrganizationId) {
		return { activeOrganizationId: null, changed: false };
	}

	if (nextOrganizationId !== activeOrganizationId) {
		await authClient.organization.setActive({
			organizationId: nextOrganizationId,
		});
	}

	await refreshJwt();
	await refetchSession?.();

	return {
		activeOrganizationId: nextOrganizationId,
		changed: nextOrganizationId !== activeOrganizationId,
	};
}
