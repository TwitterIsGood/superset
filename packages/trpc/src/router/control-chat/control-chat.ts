import { randomUUID } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	controlChatMessages,
	controlChatRuns,
	controlChatSessions,
	controlChatToolCalls,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { runControlChatTurn } from "./runtime";
import {
	ControlChatRunAbortedError,
	type ControlChatTurnResult,
} from "./runtime-status";
import {
	controlChatCreateSessionSchema,
	controlChatRendererContextSchema,
	controlChatSendSchema,
	controlChatToolSchemas,
} from "./schema";
import { titleFromMessage } from "./tools";

async function getOwnedSession(args: {
	sessionId: string;
	organizationId: string;
	userId: string;
}) {
	const [session] = await db
		.select()
		.from(controlChatSessions)
		.where(
			and(
				eq(controlChatSessions.id, args.sessionId),
				eq(controlChatSessions.organizationId, args.organizationId),
				eq(controlChatSessions.ownerUserId, args.userId),
			),
		)
		.limit(1);

	if (!session) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Control Chat session not found",
		});
	}

	return session;
}

async function getSessionData(args: {
	sessionId: string;
	organizationId: string;
	userId: string;
}) {
	const session = await getOwnedSession(args);
	const [messages, runs, toolCalls] = await Promise.all([
		db
			.select()
			.from(controlChatMessages)
			.where(eq(controlChatMessages.sessionId, args.sessionId))
			.orderBy(asc(controlChatMessages.createdAt), asc(controlChatMessages.id)),
		db
			.select()
			.from(controlChatRuns)
			.where(eq(controlChatRuns.sessionId, args.sessionId))
			.orderBy(desc(controlChatRuns.startedAt)),
		db
			.select()
			.from(controlChatToolCalls)
			.where(eq(controlChatToolCalls.sessionId, args.sessionId))
			.orderBy(asc(controlChatToolCalls.startedAt)),
	]);

	return { session, messages, runs, toolCalls };
}

export const controlChatRouter = {
	listSessions: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(controlChatSessions)
			.where(
				and(
					eq(controlChatSessions.organizationId, organizationId),
					eq(controlChatSessions.ownerUserId, ctx.session.user.id),
				),
			)
			.orderBy(desc(controlChatSessions.lastActiveAt));
	}),

	createSession: protectedProcedure
		.input(controlChatCreateSessionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rendererContext =
				input?.rendererContext ?? controlChatRendererContextSchema.parse({});
			const [session] = await dbWs
				.insert(controlChatSessions)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					title: input?.title ?? "Control Chat",
					metadata: { rendererContext },
				})
				.returning();

			if (!session) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create Control Chat session",
				});
			}

			return session;
		}),

	getSession: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getSessionData({
				sessionId: input.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});
		}),

	send: protectedProcedure
		.input(controlChatSendSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rendererContext =
				input.rendererContext ?? controlChatRendererContextSchema.parse({});
			const now = new Date();

			const prepared = await dbWs.transaction(async (tx) => {
				const session =
					input.sessionId == null
						? (
								await tx
									.insert(controlChatSessions)
									.values({
										organizationId,
										ownerUserId: ctx.session.user.id,
										title: titleFromMessage(input.message),
										status: "running",
										metadata: { rendererContext },
										lastActiveAt: now,
									})
									.returning()
							)[0]
						: (
								await tx
									.select()
									.from(controlChatSessions)
									.where(
										and(
											eq(controlChatSessions.id, input.sessionId),
											eq(controlChatSessions.organizationId, organizationId),
											eq(controlChatSessions.ownerUserId, ctx.session.user.id),
										),
									)
									.limit(1)
							)[0];

				if (!session) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Control Chat session not found",
					});
				}
				if (session.activeRunId) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "This Control Chat session already has an active run.",
					});
				}

				const [run] = await tx
					.insert(controlChatRuns)
					.values({
						sessionId: session.id,
						organizationId,
						startedByUserId: ctx.session.user.id,
						status: "running",
						originHostId: rendererContext.localMachineId ?? null,
						executionHostId: rendererContext.localMachineId ?? null,
						permissionMode: "bypassPermissions",
						modelProviderId: input.modelProviderId ?? null,
						modelId: input.modelId ?? null,
						context: { rendererContext },
						startedAt: now,
					})
					.returning();

				if (!run) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to start Control Chat run",
					});
				}

				await tx.insert(controlChatMessages).values({
					id: randomUUID(),
					sessionId: session.id,
					organizationId,
					createdByUserId: ctx.session.user.id,
					role: "user",
					content: [{ type: "text", text: input.message }],
					metadata: { rendererContext },
					createdAt: now,
				});

				await tx
					.update(controlChatSessions)
					.set({
						activeRunId: run.id,
						status: "running",
						lastActiveAt: now,
						updatedAt: now,
					})
					.where(eq(controlChatSessions.id, session.id));

				return { sessionId: session.id, runId: run.id };
			});

			let turnResult: ControlChatTurnResult;
			try {
				turnResult = await runControlChatTurn({
					organizationId,
					userId: ctx.session.user.id,
					sessionId: prepared.sessionId,
					runId: prepared.runId,
					message: input.message,
					rendererContext,
					modelProviderId: input.modelProviderId,
					modelId: input.modelId,
				});
			} catch (caught) {
				if (caught instanceof ControlChatRunAbortedError) {
					return getSessionData({
						sessionId: prepared.sessionId,
						organizationId,
						userId: ctx.session.user.id,
					});
				}
				const error =
					caught instanceof Error ? caught.message : "Control Chat run failed";
				turnResult = {
					content: [{ type: "error" as const, text: error }],
					status: "failed",
					error,
				};
			}

			const finalization = await dbWs.transaction(async (tx) => {
				const completedAt = new Date();
				const [run] = await tx
					.select({ status: controlChatRuns.status })
					.from(controlChatRuns)
					.where(eq(controlChatRuns.id, prepared.runId))
					.limit(1);

				if (run?.status === "aborted") {
					return { aborted: true };
				}

				await tx
					.update(controlChatRuns)
					.set({
						status: turnResult.status,
						error: turnResult.error,
						completedAt,
					})
					.where(eq(controlChatRuns.id, prepared.runId));
				await tx.insert(controlChatMessages).values({
					id: randomUUID(),
					sessionId: prepared.sessionId,
					organizationId,
					createdByUserId: ctx.session.user.id,
					role: "assistant",
					content: turnResult.content,
					metadata: {
						runId: prepared.runId,
						permissionMode: "bypassPermissions",
					},
					createdAt: completedAt,
				});
				await tx
					.update(controlChatSessions)
					.set({
						activeRunId: null,
						status: "idle",
						lastActiveAt: completedAt,
						updatedAt: completedAt,
					})
					.where(eq(controlChatSessions.id, prepared.sessionId));

				return { aborted: false };
			});

			if (finalization.aborted) {
				return getSessionData({
					sessionId: prepared.sessionId,
					organizationId,
					userId: ctx.session.user.id,
				});
			}

			return getSessionData({
				sessionId: prepared.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});
		}),

	stop: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const session = await getOwnedSession({
				sessionId: input.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});
			if (!session.activeRunId) return { stopped: false };

			const now = new Date();
			const activeRunId = session.activeRunId;
			await dbWs.transaction(async (tx) => {
				await tx
					.update(controlChatRuns)
					.set({
						status: "aborted",
						error: "Stopped by user",
						completedAt: now,
					})
					.where(eq(controlChatRuns.id, activeRunId));
				await tx
					.update(controlChatSessions)
					.set({
						activeRunId: null,
						status: "idle",
						updatedAt: now,
						lastActiveAt: now,
					})
					.where(eq(controlChatSessions.id, session.id));
			});

			return { stopped: true };
		}),

	toolInventory: protectedProcedure.query(() => {
		return {
			defaultPermissionMode: "bypassPermissions",
			tools: Object.keys(controlChatToolSchemas),
		};
	}),
} satisfies TRPCRouterRecord;
