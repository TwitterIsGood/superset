import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import {
	authClient,
	ensureFreshJwt,
	setAuthToken,
	setJwt,
} from "renderer/lib/auth-client";
import { isStoredAuthTokenCurrent } from "renderer/lib/auth-session-state";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";
import { getJwtExpiresAt, looksLikeJwt } from "./utils/authJwt";

const JWT_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

async function refreshAuthJwt(logContext: string): Promise<string | null> {
	try {
		return await ensureFreshJwt();
	} catch (err) {
		console.warn(`[AuthProvider] JWT refresh failed ${logContext}`, err);
	}
	return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const syncCliAuthConfigWithTokenMutation =
		electronTrpc.auth.syncCliAuthConfigWithToken.useMutation();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	const syncSessionJwtForHostRuntime = useEffectEvent(
		async (
			logContext: string,
			organizationId?: string | null,
		): Promise<boolean> => {
			const token = await refreshAuthJwt(logContext);
			if (!token) return false;

			const expiresAt = getJwtExpiresAt(token);
			try {
				await syncCliAuthConfigWithTokenMutation.mutateAsync({
					token,
					expiresAt,
					organizationId:
						organizationId ?? session?.session?.activeOrganizationId ?? null,
				});
				setJwt(token);
				return true;
			} catch (error) {
				console.warn("[AuthProvider] CLI auth config sync failed", error);
				return false;
			}
		},
	);

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				if (isStoredAuthTokenCurrent(storedToken.expiresAt)) {
					if (looksLikeJwt(storedToken.token)) {
						setAuthToken(null);
						setJwt(storedToken.token);
					} else {
						setAuthToken(storedToken.token);
					}
					try {
						await refetchSession();
					} catch (err) {
						console.warn(
							"[AuthProvider] session refetch failed during hydration",
							err,
						);
					}
					if (!looksLikeJwt(storedToken.token)) {
						await syncSessionJwtForHostRuntime("during hydration");
					}
				}
			} else {
				await syncSessionJwtForHostRuntime(
					"from existing desktop session",
				).catch((error) => {
					console.warn(
						"[AuthProvider] session JWT fallback persistence failed",
						error,
					);
					return false;
				});
			}
			if (!cancelled) {
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated, refetchSession]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				if (looksLikeJwt(data.token)) {
					setAuthToken(null);
					setJwt(data.token);
					try {
						await refetchSession();
					} catch (err) {
						console.warn(
							"[AuthProvider] session refetch failed after JWT token persistence",
							err,
						);
					}
					setIsHydrated(true);
					return;
				}

				setAuthToken(data.token);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				await syncSessionJwtForHostRuntime("after token change");
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token cleared",
						err,
					);
				}
			}
		},
	});

	useEffect(() => {
		if (!isHydrated) return;

		void syncSessionJwtForHostRuntime("on interval start");
		const interval = setInterval(
			() => void syncSessionJwtForHostRuntime("on interval"),
			JWT_REFRESH_INTERVAL_MS,
		);
		const refreshOnResume = () => void refreshAuthJwt("on resume");
		window.addEventListener("focus", refreshOnResume);
		window.addEventListener("online", refreshOnResume);
		document.addEventListener("visibilitychange", refreshOnResume);
		return () => {
			clearInterval(interval);
			window.removeEventListener("focus", refreshOnResume);
			window.removeEventListener("online", refreshOnResume);
			document.removeEventListener("visibilitychange", refreshOnResume);
		};
	}, [isHydrated]);

	useEffect(() => {
		if (!isHydrated || !session?.user) return;

		void syncSessionJwtForHostRuntime(
			"after session organization change",
			session?.session?.activeOrganizationId ?? null,
		).catch((error) => {
			console.warn("[AuthProvider] CLI auth config sync failed", error);
		});
	}, [isHydrated, session?.session?.activeOrganizationId, session?.user]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<SupersetLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
