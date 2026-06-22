import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { authClient, getJwt, refreshJwt } from "../auth/client";
import { env } from "../env";

async function getAuthorizationHeader(): Promise<string | null> {
	const token = getJwt() ?? (await refreshJwt().catch(() => null));
	return token ? `Bearer ${token}` : null;
}

const noStoreFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const headers = new Headers(init?.headers);
	headers.set("Cache-Control", "no-store, no-cache, max-age=0");
	headers.set("Pragma", "no-cache");

	if (!headers.has("Authorization")) {
		const authorization = await getAuthorizationHeader();
		if (authorization) {
			headers.set("Authorization", authorization);
		}
	}

	return fetch(input instanceof URL ? input.toString() : input, {
		...init,
		cache: "no-store",
		headers,
	});
};

export const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.EXPO_PUBLIC_API_URL}/api/trpc`,
			fetch: noStoreFetch,
			methodOverride: "POST",
			headers() {
				const cookies = authClient.getCookie();
				const jwt = getJwt();
				return {
					...(cookies ? { Cookie: cookies } : {}),
					...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
				};
			},
			transformer: superjson,
		}),
	],
});
