import type { ReactNode } from "react";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { refreshJwt, signOut, useSession } from "@/lib/auth/client";
import { ensureActiveOrganization } from "@/lib/auth/organization";
import { getCollections } from "@/lib/collections/collections";

type Collections = ReturnType<typeof getCollections>;
const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const sessionId = session?.session?.id ?? null;
	const organizationValidationScope = sessionId
		? `${sessionId}:${activeOrganizationId ?? "none"}`
		: null;
	const validatedOrganizationScopesRef = useRef(new Set<string>());
	const [jwtReadyOrganizationId, setJwtReadyOrganizationId] = useState<
		string | null
	>(null);

	useEffect(() => {
		if (
			!session ||
			!organizationValidationScope ||
			validatedOrganizationScopesRef.current.has(organizationValidationScope)
		) {
			return;
		}

		let cancelled = false;
		validatedOrganizationScopesRef.current.add(organizationValidationScope);
		ensureActiveOrganization({
			activeOrganizationId,
			refetchSession,
		}).catch((error) => {
			if (!cancelled) {
				validatedOrganizationScopesRef.current.delete(
					organizationValidationScope,
				);
				console.log(
					"[collections] Failed to resolve active organization",
					error,
				);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		activeOrganizationId,
		organizationValidationScope,
		refetchSession,
		session,
	]);

	useEffect(() => {
		if (!activeOrganizationId) {
			setJwtReadyOrganizationId(null);
			return;
		}

		let cancelled = false;
		setJwtReadyOrganizationId(null);
		refreshJwt()
			.then(() => {
				if (!cancelled) {
					setJwtReadyOrganizationId(activeOrganizationId);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setJwtReadyOrganizationId(null);
					void signOut().catch((signOutError) => {
						console.log(
							"[collections] Failed to clear invalid auth session",
							signOutError,
						);
					});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [activeOrganizationId]);

	const collections = useMemo(() => {
		if (
			!activeOrganizationId ||
			jwtReadyOrganizationId !== activeOrganizationId
		) {
			return null;
		}
		return getCollections(activeOrganizationId);
	}, [activeOrganizationId, jwtReadyOrganizationId]);

	if (
		!activeOrganizationId ||
		jwtReadyOrganizationId !== activeOrganizationId
	) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): Collections {
	const context = useContext(CollectionsContext);
	if (context === undefined) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	if (!context) {
		throw new Error(
			"Collections not available - user must be signed in with an active organization",
		);
	}
	return context;
}
