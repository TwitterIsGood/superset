import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { getContent } from "./procedures/get-content";

export const pullRequestsRouter = router({
	getByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (input.workspaceIds.length > 0) {
				ctx.runtime.ensurePullRequestRuntimeStarted();
			}
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
					input.workspaceIds,
				);
			return { workspaces };
		}),
	refreshByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.workspaceIds.length > 0) {
				ctx.runtime.ensurePullRequestRuntimeStarted();
			}
			await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
				input.workspaceIds,
			);
			return { ok: true };
		}),
	getContent,
});
