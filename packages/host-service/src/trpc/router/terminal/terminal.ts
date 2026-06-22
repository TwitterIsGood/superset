import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSupervisor, waitForDaemonReady } from "../../../daemon";
import { terminalSessions, workspaces } from "../../../db/schema";
import { listTerminalResourceSessions } from "../../../terminal/resource-sessions";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
	getTerminalSessionSnapshot,
	listTerminalSessions,
	parseThemeType,
	resizeTerminalSession,
	type TerminalSessionSummary,
	writeInputToSession,
} from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const createSessionInputSchema = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

async function createTerminalSessionFromInput({
	ctx,
	input,
}: {
	ctx: HostServiceContext;
	input: z.infer<typeof createSessionInputSchema>;
}) {
	const terminalId = input.terminalId ?? crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		themeType: parseThemeType(input.themeType),
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: input.initialCommand,
		cwd: input.cwd,
		cols: input.cols,
		rows: input.rows,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		terminalId: result.terminalId,
		status: "active" as const,
	};
}

async function listWorkspaceTerminalSessions({
	ctx,
	workspaceId,
}: {
	ctx: HostServiceContext;
	workspaceId: string;
}): Promise<TerminalSessionSummary[]> {
	const memorySessions = listTerminalSessions({
		workspaceId,
		includeExited: false,
	});
	const sessionById = new Map(
		memorySessions.map((session) => [session.terminalId, session]),
	);

	try {
		const daemonSessions = await getSupervisor().listSessions(
			ctx.organizationId,
		);
		if (!daemonSessions) return memorySessions;

		for (const resourceSession of listTerminalResourceSessions(
			ctx.db,
			daemonSessions,
		)) {
			if (resourceSession.workspaceId !== workspaceId) continue;
			if (sessionById.has(resourceSession.terminalId)) continue;

			sessionById.set(resourceSession.terminalId, {
				terminalId: resourceSession.terminalId,
				workspaceId: resourceSession.workspaceId,
				createdAt: resourceSession.createdAt,
				exited: false,
				exitCode: 0,
				attached: false,
				title: resourceSession.title,
			});
		}
	} catch (error) {
		console.warn(
			"[terminal] Failed to merge daemon-backed terminal sessions",
			error,
		);
	}

	return Array.from(sessionById.values());
}

async function countWorkspaceBackgroundTerminalSessions({
	ctx,
	workspaceId,
	attachedTerminalIds,
}: {
	ctx: HostServiceContext;
	workspaceId: string;
	attachedTerminalIds: string[];
}): Promise<number> {
	const attached = new Set(attachedTerminalIds);
	const sessions = await listWorkspaceTerminalSessions({ ctx, workspaceId });
	return sessions.filter((session) => !attached.has(session.terminalId)).length;
}

async function ensureTerminalSessionForControl({
	ctx,
	workspaceId,
	terminalId,
	replayOnAdoption,
}: {
	ctx: HostServiceContext;
	workspaceId: string;
	terminalId: string;
	replayOnAdoption: boolean;
}): Promise<{ success: true } | { error: string }> {
	const current = getTerminalSessionSnapshot({
		workspaceId,
		terminalId,
		maxBytes: 1,
	});
	if (!("error" in current)) return { success: true };

	const adopted = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		adoptOnly: true,
		replayOnAdoption,
	});
	if ("error" in adopted) return { error: adopted.error };
	return { success: true };
}

function throwTerminalControlError(error: string): never {
	throw new TRPCError({
		code: "NOT_FOUND",
		message: error,
	});
}

// Daemon control surface — sibling to the per-workspace terminal ops above.
// Org-scoped (one daemon per host-service); org id comes from request ctx
// rather than env so this module can be imported in tests where env vars
// aren't set.
// Supervisor lives in this same process so calls go through the in-process
// singleton, not over the wire.
const daemonRouter = router({
	getUpdateStatus: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getUpdateStatus(ctx.organizationId),
	),

	listSessions: protectedProcedure.query(async ({ ctx }) => {
		// Wait for the bootstrap so the supervisor has a socket path.
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().listSessions(ctx.organizationId);
	}),

	restart: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().restart(ctx.organizationId);
	}),

	/**
	 * Phase 2: hand off live PTYs to a successor daemon binary.
	 *
	 * Sessions survive on success — the kernel master fds are inherited by
	 * the new daemon process via stdio. The renderer surfaces this as the
	 * "Update" path (vs `restart` which kills sessions). On failure, the
	 * UI offers force-restart as a fallback.
	 */
	update: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().update(ctx.organizationId);
	}),
});

export const terminalRouter = router({
	createSession: protectedProcedure
		.input(createSessionInputSchema)
		.mutation(createTerminalSessionFromInput),

	launchSession: protectedProcedure
		.input(
			createSessionInputSchema.extend({
				initialCommand: z.string().trim().min(1),
			}),
		)
		.mutation(createTerminalSessionFromInput),

	listSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => ({
			sessions: await listWorkspaceTerminalSessions({
				ctx,
				workspaceId: input.workspaceId,
			}),
		})),

	countBackgroundSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				attachedTerminalIds: z.array(z.string()).default([]),
			}),
		)
		.query(async ({ ctx, input }) => ({
			count: await countWorkspaceBackgroundTerminalSessions({
				ctx,
				workspaceId: input.workspaceId,
				attachedTerminalIds: input.attachedTerminalIds,
			}),
		})),

	getSnapshot: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				maxBytes: z
					.number()
					.int()
					.positive()
					.max(64 * 1024)
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const ensured = await ensureTerminalSessionForControl({
				ctx,
				workspaceId: input.workspaceId,
				terminalId: input.terminalId,
				replayOnAdoption: true,
			});
			if ("error" in ensured) throwTerminalControlError(ensured.error);

			const result = getTerminalSessionSnapshot(input);
			if ("error" in result) {
				throwTerminalControlError(result.error);
			}
			return result;
		}),

	writeInput: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				data: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const ensured = await ensureTerminalSessionForControl({
				ctx,
				workspaceId: input.workspaceId,
				terminalId: input.terminalId,
				replayOnAdoption: false,
			});
			if ("error" in ensured) throwTerminalControlError(ensured.error);

			const result = writeInputToSession(input);
			if ("error" in result) {
				throwTerminalControlError(result.error);
			}
			return { success: true as const };
		}),

	resize: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				cols: z.number().int().positive(),
				rows: z.number().int().positive(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const ensured = await ensureTerminalSessionForControl({
				ctx,
				workspaceId: input.workspaceId,
				terminalId: input.terminalId,
				replayOnAdoption: false,
			});
			if ("error" in ensured) throwTerminalControlError(ensured.error);

			const result = resizeTerminalSession(input);
			if ("error" in result) {
				throwTerminalControlError(result.error);
			}
			return { success: true as const };
		}),

	killSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const session = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Terminal session not found",
				});
			}

			if (session.originWorkspaceId !== input.workspaceId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Terminal session does not belong to this workspace",
				});
			}

			await disposeSessionAndWait(input.terminalId, ctx.db);
			ctx.terminalAgentStore.markTerminalExited(input.terminalId);
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),

	daemon: daemonRouter,
});
