import { db, dbWs } from "@superset/db/client";
import {
	automationConfigVersions,
	automationPromptVersions,
	automations,
	users,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { restoreAutomationConfigVersion } from "./config-versions";
import { getAutomationForUser, recordPromptVersion } from "./helpers";

const DEFAULT_VERSION_LIMIT = 100;
const MAX_VERSION_LIMIT = 200;

export const automationVersionsRouter = {
	listConfig: protectedProcedure
		.input(
			z.object({
				automationId: z.string().uuid(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(MAX_VERSION_LIMIT)
					.default(DEFAULT_VERSION_LIMIT),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.automationId,
			);

			return db
				.select({
					id: automationConfigVersions.id,
					automationId: automationConfigVersions.automationId,
					authorUserId: automationConfigVersions.authorUserId,
					authorName: users.name,
					authorImage: users.image,
					source: automationConfigVersions.source,
					snapshotHash: automationConfigVersions.snapshotHash,
					summary: automationConfigVersions.summary,
					previousVersionId: automationConfigVersions.previousVersionId,
					restoredFromVersionId: automationConfigVersions.restoredFromVersionId,
					controlChatSessionId: automationConfigVersions.controlChatSessionId,
					controlChatRunId: automationConfigVersions.controlChatRunId,
					sourceInstruction: automationConfigVersions.sourceInstruction,
					createdAt: automationConfigVersions.createdAt,
				})
				.from(automationConfigVersions)
				.leftJoin(users, eq(users.id, automationConfigVersions.authorUserId))
				.where(eq(automationConfigVersions.automationId, input.automationId))
				.orderBy(desc(automationConfigVersions.createdAt))
				.limit(input.limit);
		}),

	getConfig: protectedProcedure
		.input(z.object({ versionId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [row] = await db
				.select({
					id: automationConfigVersions.id,
					automationId: automationConfigVersions.automationId,
					snapshot: automationConfigVersions.snapshot,
					summary: automationConfigVersions.summary,
					source: automationConfigVersions.source,
					sourceInstruction: automationConfigVersions.sourceInstruction,
					createdAt: automationConfigVersions.createdAt,
				})
				.from(automationConfigVersions)
				.innerJoin(
					automations,
					eq(automations.id, automationConfigVersions.automationId),
				)
				.where(
					and(
						eq(automationConfigVersions.id, input.versionId),
						eq(automations.organizationId, organizationId),
						eq(automations.ownerUserId, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Configuration version not found",
				});
			}

			return row;
		}),

	restoreConfig: protectedProcedure
		.input(z.object({ versionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction((tx) =>
				restoreAutomationConfigVersion(tx, {
					versionId: input.versionId,
					organizationId,
					userId: ctx.session.user.id,
				}),
			);
		}),

	list: protectedProcedure
		.input(
			z.object({
				automationId: z.string().uuid(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(MAX_VERSION_LIMIT)
					.default(DEFAULT_VERSION_LIMIT),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.automationId,
			);

			const rows = await db
				.select({
					id: automationPromptVersions.id,
					automationId: automationPromptVersions.automationId,
					authorUserId: automationPromptVersions.authorUserId,
					authorName: users.name,
					authorImage: users.image,
					source: automationPromptVersions.source,
					contentHash: automationPromptVersions.contentHash,
					restoredFromVersionId: automationPromptVersions.restoredFromVersionId,
					startedAt: automationPromptVersions.startedAt,
					updatedAt: automationPromptVersions.updatedAt,
				})
				.from(automationPromptVersions)
				.leftJoin(users, eq(users.id, automationPromptVersions.authorUserId))
				.where(eq(automationPromptVersions.automationId, input.automationId))
				.orderBy(desc(automationPromptVersions.updatedAt))
				.limit(input.limit);

			return rows;
		}),

	getContent: protectedProcedure
		.input(z.object({ versionId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [row] = await db
				.select({
					id: automationPromptVersions.id,
					automationId: automationPromptVersions.automationId,
					content: automationPromptVersions.content,
				})
				.from(automationPromptVersions)
				.innerJoin(
					automations,
					eq(automations.id, automationPromptVersions.automationId),
				)
				.where(
					and(
						eq(automationPromptVersions.id, input.versionId),
						eq(automations.organizationId, organizationId),
						eq(automations.ownerUserId, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Version not found",
				});
			}

			return row;
		}),

	restore: protectedProcedure
		.input(z.object({ versionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [version] = await db
				.select({
					id: automationPromptVersions.id,
					automationId: automationPromptVersions.automationId,
					content: automationPromptVersions.content,
				})
				.from(automationPromptVersions)
				.innerJoin(
					automations,
					eq(automations.id, automationPromptVersions.automationId),
				)
				.where(
					and(
						eq(automationPromptVersions.id, input.versionId),
						eq(automations.organizationId, organizationId),
						eq(automations.ownerUserId, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!version) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Version not found",
				});
			}

			const restored = await dbWs.transaction(async (tx) => {
				await tx
					.update(automations)
					.set({ prompt: version.content })
					.where(
						and(
							eq(automations.id, version.automationId),
							eq(automations.organizationId, organizationId),
						),
					);

				return recordPromptVersion(tx, {
					automationId: version.automationId,
					authorUserId: ctx.session.user.id,
					content: version.content,
					source: "restore",
					restoredFromVersionId: version.id,
				});
			});

			return restored;
		}),
} satisfies TRPCRouterRecord;
