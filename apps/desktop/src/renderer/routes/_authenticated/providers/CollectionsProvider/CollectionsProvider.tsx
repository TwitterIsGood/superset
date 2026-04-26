import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { authClient, getJwt } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import {
	getCollections,
	getTasksDataMode,
	preloadCollections,
} from "./collections";

type CollectionsContextType = ReturnType<typeof getCollections> & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function preloadActiveOrganizationCollections(
	activeOrganizationId: string | null | undefined,
): void {
	const jwt = getJwt();
	const mode = getTasksDataMode({ activeOrganizationId, jwt });
	const organizationId =
		mode === "cloud" && activeOrganizationId
			? activeOrganizationId
			: MOCK_ORG_ID;
	void preloadCollections(organizationId, mode).catch((error) => {
		console.error(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const [isSwitching, setIsSwitching] = useState(false);
	const cloudOrganizationId = session?.session?.activeOrganizationId ?? null;
	const tasksMode = getTasksDataMode({
		activeOrganizationId: cloudOrganizationId,
		jwt: getJwt(),
	});
	const activeOrganizationId =
		tasksMode === "cloud" && cloudOrganizationId
			? cloudOrganizationId
			: MOCK_ORG_ID;

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				await preloadCollections(organizationId, "cloud");
				await refetchSession();
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, refetchSession],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	const collections = activeOrganizationId
		? getCollections(activeOrganizationId, tasksMode)
		: null;

	if (!collections || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={{ ...collections, switchOrganization }}>
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
