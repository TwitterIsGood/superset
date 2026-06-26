import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { env } from "./env";

export function createApiClient(token: string) {
	const apiUrl = env.RELAY_INTERNAL_API_URL ?? env.NEXT_PUBLIC_API_URL;
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${apiUrl}/api/trpc`,
				transformer: SuperJSON,
				headers: () => ({ Authorization: `Bearer ${token}` }),
			}),
		],
	});
}
