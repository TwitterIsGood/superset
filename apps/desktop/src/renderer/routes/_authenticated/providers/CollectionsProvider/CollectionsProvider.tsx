import { useLocation } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type CollectionPreloadProfile,
	getCollections,
	preloadCollections,
} from "./collections";

type CollectionsContextType = ReturnType<typeof getCollections> & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function preloadActiveOrganizationCollections(
	activeOrganizationId: string | null | undefined,
	profile?: CollectionPreloadProfile,
): void {
	if (!activeOrganizationId) return;
	void preloadCollections(activeOrganizationId, profile).catch((error) => {
		console.error(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const location = useLocation();
	const [isSwitching, setIsSwitching] = useState(false);
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				await preloadCollections(organizationId, {
					pathname: location.pathname,
				});
				await refetchSession();
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, location.pathname, refetchSession],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId, {
			pathname: location.pathname,
		});
	}, [activeOrganizationId, location.pathname]);

	const collections = useMemo(
		() => (activeOrganizationId ? getCollections(activeOrganizationId) : null),
		[activeOrganizationId],
	);

	const contextValue = useMemo<CollectionsContextType | null>(
		() => (collections ? { ...collections, switchOrganization } : null),
		[collections, switchOrganization],
	);

	useEffect(() => {
		if (env.NODE_ENV !== "development" || typeof window === "undefined") return;

		const getActiveOrganizationId = () => activeOrganizationId ?? null;
		const switchActiveOrganization = async (organizationId: string) => {
			await switchOrganization(organizationId);
			window.localStorage.setItem("active_organization_id", organizationId);
			return {
				requestedOrganizationId: organizationId,
				activeOrganizationId: organizationId,
			};
		};
		window.__supersetCollectionsDebug = {
			...window.__supersetCollectionsDebug,
			getActiveOrganizationId,
			switchActiveOrganization,
		};

		return () => {
			if (
				window.__supersetCollectionsDebug?.getActiveOrganizationId ===
				getActiveOrganizationId
			) {
				delete window.__supersetCollectionsDebug.getActiveOrganizationId;
			}
			if (
				window.__supersetCollectionsDebug?.switchActiveOrganization ===
				switchActiveOrganization
			) {
				delete window.__supersetCollectionsDebug.switchActiveOrganization;
			}
		};
	}, [activeOrganizationId, switchOrganization]);

	if (!contextValue || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={contextValue}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): CollectionsContextType {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
