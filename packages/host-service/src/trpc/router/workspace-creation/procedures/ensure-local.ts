import { existsSync } from "node:fs";
import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import { ensureMainWorkspaceStrict } from "../../project/utils/ensure-main-workspace";
import { adoptExistingWorktree } from "../shared/adopt-existing-worktree";
import { listWorktreeBranches } from "../shared/branch-search";
import { ensureLocalProject } from "../shared/local-project";

const verifiedCloudWorkspaceSchema = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	projectId: z.string().uuid(),
	hostId: z.string().min(1),
	name: z.string().min(1),
	branch: z.string().min(1),
	type: z.enum(["main", "worktree"]),
	createdByUserId: z.string().uuid().nullable(),
	taskId: z.string().uuid().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const ensureLocal = protectedProcedure
	.input(
		z.object({
			workspaceId: z.string().uuid(),
			verifiedCloudWorkspace: verifiedCloudWorkspaceSchema.optional(),
		}),
	)
	.mutation(async ({ ctx, input }) => {
		const existing = ctx.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, input.workspaceId) })
			.sync();
		if (existing && existsSync(existing.worktreePath)) {
			return {
				ok: true as const,
				workspaceId: existing.id,
				adopted: false as const,
				worktreePath: existing.worktreePath,
			};
		}

		const cloud =
			input.verifiedCloudWorkspace?.id === input.workspaceId
				? input.verifiedCloudWorkspace
				: await ctx.api.v2Workspace.getFromHost.query({
						organizationId: ctx.organizationId,
						id: input.workspaceId,
					});
		if (!cloud) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Cloud workspace not found: ${input.workspaceId}`,
			});
		}

		if (cloud.organizationId !== ctx.organizationId) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Cloud workspace belongs to a different organization",
			});
		}

		const currentHostId = getHostId();
		if (cloud.hostId !== currentHostId) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `Workspace belongs to host ${cloud.hostId}, not this host ${currentHostId}`,
			});
		}

		const localProject = await ensureLocalProject(ctx, cloud.projectId);
		if (!localProject.repoPath || !existsSync(localProject.repoPath)) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `Project is not set up on this host: ${cloud.projectId}`,
			});
		}

		if (cloud.type === "main") {
			const ensured = await ensureMainWorkspaceStrict(
				ctx,
				cloud.projectId,
				localProject.repoPath,
			);
			if (ensured.id !== cloud.id) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Recovered main workspace ${ensured.id}, not requested workspace ${cloud.id}`,
				});
			}
			return {
				ok: true as const,
				workspaceId: ensured.id,
				adopted: existing ? "repaired" : ("adopted" as const),
				worktreePath: localProject.repoPath,
			};
		}

		const git = await ctx.git(localProject.repoPath);
		const { worktreeMap } = await listWorktreeBranches(git);
		const worktreePath = worktreeMap.get(cloud.branch);
		if (!worktreePath) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `No existing worktree for branch "${cloud.branch}"`,
			});
		}

		const { workspace } = await adoptExistingWorktree({
			ctx,
			git,
			projectId: cloud.projectId,
			branch: cloud.branch,
			worktreePath,
			workspaceName: cloud.name,
			existingWorkspaceId: cloud.id,
			verifiedExistingWorkspace: cloud,
			hostPromise: Promise.resolve({ machineId: currentHostId }),
		});

		const recovered = ctx.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspace.id) })
			.sync();
		return {
			ok: true as const,
			workspaceId: workspace.id,
			adopted: existing ? "repaired" : ("adopted" as const),
			worktreePath: recovered?.worktreePath ?? null,
		};
	});
