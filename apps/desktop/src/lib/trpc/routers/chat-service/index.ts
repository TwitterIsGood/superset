import { join } from "node:path";
import type { ChatService } from "@superset/chat/server/desktop/chat-service";
import { createChatServiceRouter as buildRouter } from "@superset/chat/server/desktop/router";
import { MASTRACODE_RUNTIME_PACK_ID } from "lib/pack-system/pack-ids";
import { MASTRACODE_RUNTIME_ENTRY } from "lib/pack-system/runtime-pack-entries";
import { getPackManager } from "main/lib/pack-system";

let chatServicePromise: Promise<ChatService> | null = null;

function getChatService(): Promise<ChatService> {
	chatServicePromise ??= import(
		"@superset/chat/server/desktop/chat-service"
	).then(
		({ ChatService }) =>
			new ChatService({
				resolveMastracodeImportPath: async () => {
					const resolution = await getPackManager().resolvePack(
						MASTRACODE_RUNTIME_PACK_ID,
					);
					if (!resolution.ok) {
						if (
							process.env.NODE_ENV === "development" &&
							resolution.status.status === "not_configured"
						) {
							return null;
						}
						throw new Error(
							`MastraCode auth runtime pack is unavailable: ${resolution.error}`,
						);
					}
					return join(resolution.path, MASTRACODE_RUNTIME_ENTRY);
				},
			}),
	);
	return chatServicePromise;
}

export const chatService = new Proxy({} as ChatService, {
	get(target, propertyKey, receiver) {
		if (propertyKey === "then") return undefined;
		if (typeof propertyKey !== "string") {
			return Reflect.get(target, propertyKey, receiver);
		}
		return (...args: unknown[]) =>
			getChatService().then((service) => {
				const member = service[propertyKey as keyof ChatService];
				if (typeof member !== "function") return member;
				return (member as (...callArgs: unknown[]) => unknown).apply(
					service,
					args,
				);
			});
	},
});

export const createChatServiceRouter = () => buildRouter(chatService);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
