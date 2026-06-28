import { observable } from "@trpc/server/observable";
import {
	getPackManager,
	packResolutionSchema,
	packStatusSchema,
} from "main/lib/pack-system";
import type { PackStatus } from "main/lib/pack-system/types";
import { z } from "zod";
import { publicProcedure, router } from "..";

const packIdInputSchema = z.object({
	packId: z.string().min(1),
});

const subscribeInputSchema = packIdInputSchema.optional();

export const createPackSystemRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(packIdInputSchema)
			.output(packStatusSchema)
			.query(async ({ input }) => {
				return getPackManager().getStatus(input.packId);
			}),

		resolve: publicProcedure
			.input(packIdInputSchema)
			.output(packResolutionSchema)
			.mutation(async ({ input }) => {
				return getPackManager().resolvePack(input.packId);
			}),

		subscribe: publicProcedure
			.input(subscribeInputSchema)
			.subscription(({ input }) => {
				return observable<PackStatus>((emit) => {
					const manager = getPackManager();
					const shouldEmit = (packId: string) => {
						return !input?.packId || input.packId === packId;
					};
					const unsubscribe = manager.onStatusChange((status) => {
						if (shouldEmit(status.packId)) {
							emit.next(status);
						}
					});

					if (input?.packId) {
						void manager
							.getStatus(input.packId)
							.then((status) => emit.next(status))
							.catch((error) => emit.error(error));
					}

					return unsubscribe;
				});
			}),
	});
};
