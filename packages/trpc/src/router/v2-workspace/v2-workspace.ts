import { Buffer } from "node:buffer";
import { mintUserJwt } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import { v2WorkspaceTypeValues } from "@superset/db/enums";
import type { ChatMessageContent } from "@superset/db/schema";
import {
	chatSessions,
	modelProviderModels,
	modelProviders,
	tasks,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import { jwtProcedure, protectedProcedure } from "../../trpc";
import {
	RelayDispatchError,
	relayMutation,
	relayQuery,
} from "../automation/relay-client";
import { decryptSecret } from "../project/secrets/utils/crypto";
import { requireActiveOrgId } from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";
import { filterMobileAcpChatModels } from "./mobile-chat-models";

const MAIN_WORKSPACE_DELETE_MESSAGE =
	"Main workspaces cannot be deleted through workspace delete. Remove them from the sidebar or remove the project from this host instead.";
const WORKSPACE_CONTROL_JWT_TTL_SECONDS = 300;

type WorkspaceAgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

type WorkspaceChatRuntimeMessage = {
	id?: string;
	role: "user" | "signal" | "assistant";
	content: ChatMessageContent[];
	stopReason?: "end_turn" | "error" | "aborted" | null;
	errorMessage?: string | null;
	createdAt?: Date | string;
};

type WorkspaceChatSnapshot = {
	displayState: {
		isRunning?: boolean;
		currentMessage?: WorkspaceChatRuntimeMessage | null;
		errorMessage?: string | null;
		pendingApproval?: unknown;
		pendingQuestion?: unknown;
		pendingPlanApproval?: unknown;
	};
	messages: WorkspaceChatRuntimeMessage[];
};

type WorkspaceChatSendResult = {
	ok: true;
};

type WorkspaceChatControlResult = {
	ok: true;
};

type WorkspaceChatModel = {
	id: string;
	name: string;
	provider: string;
	providerId: string;
	protocol: string;
	modelId: string;
};

type WorkspaceAgentOption = {
	id: string;
	label: string;
	kind: "chat" | "terminal";
	presetId?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
};

type WorkspaceTerminalPresetOption = {
	id: string;
	presetId: string;
	label: string;
	description: string;
	command: string;
	commands: string[];
	agentId?: string;
	order: number;
};

type HostAgentConfigSummary = {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	env: Record<string, string>;
};

type HostTerminalPresetSummary = WorkspaceTerminalPresetOption;

type WorkspaceModelProviderSyncPayload = {
	id: string;
	name: string;
	protocol: "anthropic" | "openai-chat" | "openai-responses";
	baseUrl: string;
	enabled: boolean;
	secret: string | null;
	models: Array<{
		modelId: string;
		displayName?: string;
		enabled?: boolean;
		capabilities?: Record<string, unknown>;
	}>;
};

type WorkspaceTerminalCreateResult = {
	terminalId: string;
	status: "active";
};

type WorkspaceTerminalSnapshot = {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
	outputTail: string;
	bufferBytes: number;
};

type WorkspaceTerminalSessionSummary = Omit<
	WorkspaceTerminalSnapshot,
	"outputTail" | "bufferBytes"
>;

type WorkspaceTerminalListResult = {
	sessions: WorkspaceTerminalSessionSummary[];
};

type WorkspaceTerminalAttachDescriptor = {
	mode: "terminal-websocket";
	terminalId: string;
	workspaceId: string;
	hostId: string;
	relayUrl: string;
	webSocketUrl: string;
	expiresAt: Date;
	replay: boolean;
};

type WorkspaceTerminalInputResult = {
	success: true;
};

type WorkspaceTerminalResizeResult = {
	success: true;
};

type WorkspaceTerminalDeleteResult = {
	terminalId: string;
	status: "disposed";
};

type RuntimeWebSocketEvent = {
	data: unknown;
};

type RuntimeWebSocketCloseEvent = {
	code?: number;
	reason?: string;
};

type RuntimeWebSocket = {
	binaryType: "arraybuffer";
	onopen: (() => void) | null;
	onmessage: ((event: RuntimeWebSocketEvent) => void) | null;
	onerror: ((event: unknown) => void) | null;
	onclose: ((event: RuntimeWebSocketCloseEvent) => void) | null;
	close: (code?: number, reason?: string) => void;
};

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

const workspaceChatMetadataSchema = z
	.object({
		model: z.string().trim().min(1).optional(),
		thinkingLevel: z.enum(["off", "low", "medium", "high", "xhigh"]).optional(),
	})
	.optional();

const workspaceChatSessionInputSchema = z.object({
	workspaceId: z.string().uuid(),
	sessionId: z.string().uuid(),
});

const workspaceChatApprovalDecisionSchema = z.enum([
	"approve",
	"decline",
	"always_allow_category",
]);

async function getScopedProject(organizationId: string, projectId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			code: "BAD_REQUEST",
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

async function getScopedHost(organizationId: string, hostId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Hosts.findFirst({
				columns: {
					machineId: true,
					organizationId: true,
				},
				where: and(
					eq(v2Hosts.organizationId, organizationId),
					eq(v2Hosts.machineId, hostId),
				),
			}),
		{
			code: "BAD_REQUEST",
			message: "Host not found in this organization",
			organizationId,
		},
	);
}

async function _getScopedWorkspace(
	organizationId: string,
	workspaceId: string,
) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Workspaces.id, workspaceId),
			}),
		{
			message: "Workspace not found in this organization",
			organizationId,
		},
	);
}

async function getWorkspaceAccess(
	userId: string,
	workspaceId: string,
	options?: {
		access?: "admin" | "member";
		organizationId?: string;
	},
) {
	return requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Workspaces.id, workspaceId),
			}),
		{
			access: options?.access,
			message: "Workspace not found",
			organizationId: options?.organizationId,
		},
	);
}

async function getWorkspaceHostControlAccess(
	userId: string,
	workspaceId: string,
	organizationId: string,
) {
	const workspace = await requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
					hostId: true,
					projectId: true,
					name: true,
					branch: true,
					type: true,
					createdByUserId: true,
					taskId: true,
					createdAt: true,
					updatedAt: true,
				},
				where: eq(v2Workspaces.id, workspaceId),
			}),
		{
			message: "Workspace not found",
			organizationId,
		},
	);

	const host = await dbWs.query.v2Hosts.findFirst({
		columns: {
			machineId: true,
			organizationId: true,
			isOnline: true,
		},
		where: and(
			eq(v2Hosts.organizationId, workspace.organizationId),
			eq(v2Hosts.machineId, workspace.hostId),
		),
	});

	if (!host) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace host not found",
		});
	}

	const hostAccess = await dbWs.query.v2UsersHosts.findFirst({
		columns: { hostId: true },
		where: and(
			eq(v2UsersHosts.organizationId, workspace.organizationId),
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, workspace.hostId),
		),
	});

	if (!hostAccess) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this workspace host",
		});
	}

	return { workspace, host };
}

async function getOwnedWorkspaceChatSession(args: {
	sessionId: string;
	workspaceId: string;
	organizationId: string;
	userId: string;
}) {
	const session = await dbWs.query.chatSessions.findFirst({
		columns: {
			id: true,
			organizationId: true,
			createdBy: true,
			v2WorkspaceId: true,
		},
		where: and(
			eq(chatSessions.id, args.sessionId),
			eq(chatSessions.organizationId, args.organizationId),
			eq(chatSessions.createdBy, args.userId),
		),
	});

	if (!session || session.v2WorkspaceId !== args.workspaceId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Chat session not found",
		});
	}

	return session;
}

async function mintWorkspaceControlJwt(args: {
	userId: string;
	email?: string | null;
	organizationId: string;
}) {
	return mintUserJwt({
		userId: args.userId,
		email: args.email ?? undefined,
		organizationId: args.organizationId,
		organizationIds: [args.organizationId],
		scope: "mobile-workspace-control",
		ttlSeconds: WORKSPACE_CONTROL_JWT_TTL_SECONDS,
	});
}

function decryptProviderSecret(
	provider: typeof modelProviders.$inferSelect,
): string | null {
	if (!provider.secretEncrypted) return null;
	try {
		return decryptSecret(provider.secretEncrypted);
	} catch {
		return null;
	}
}

async function listModelProviderSyncPayload(
	organizationId: string,
): Promise<WorkspaceModelProviderSyncPayload[]> {
	const providerRows = await db
		.select()
		.from(modelProviders)
		.where(eq(modelProviders.organizationId, organizationId));

	if (providerRows.length === 0) return [];

	const modelRows = await db
		.select()
		.from(modelProviderModels)
		.where(
			inArray(
				modelProviderModels.providerId,
				providerRows.map((provider) => provider.id),
			),
		);

	const modelsByProvider = new Map<
		string,
		Array<typeof modelProviderModels.$inferSelect>
	>();
	for (const model of modelRows) {
		const bucket = modelsByProvider.get(model.providerId) ?? [];
		bucket.push(model);
		modelsByProvider.set(model.providerId, bucket);
	}

	return providerRows.map((provider) => ({
		id: provider.id,
		name: provider.name,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		enabled: provider.enabled,
		secret: decryptProviderSecret(provider),
		models: (modelsByProvider.get(provider.id) ?? []).map((model) => ({
			modelId: model.modelId,
			displayName: model.displayName?.trim() || model.modelId,
			enabled: model.enabled,
			capabilities: model.capabilities ?? {},
		})),
	}));
}

function relayErrorMessage(error: RelayDispatchError): string | null {
	try {
		const payload = JSON.parse(error.body) as {
			error?: { json?: { message?: unknown } };
		};
		const message = payload.error?.json?.message;
		return typeof message === "string" ? message : null;
	} catch {
		return null;
	}
}

function relayErrorSearchText(error: RelayDispatchError): string {
	return [
		error.message,
		error.body,
		relayErrorMessage(error),
		error.status.toString(),
	]
		.filter((text): text is string => typeof text === "string")
		.join("\n")
		.toLowerCase();
}

function isRelayTransportError(error: Error): boolean {
	const message = error.message.toLowerCase();
	return (
		message.includes("fetch failed") ||
		message.includes("econnrefused") ||
		message.includes("enotfound") ||
		message.includes("network error")
	);
}

function isHostCloudAuthenticationError(error: RelayDispatchError): boolean {
	const haystack = relayErrorSearchText(error);
	return (
		haystack.includes(
			"not authenticated. provide a bearer jwt, x-api-key, or session",
		) || haystack.includes("not authenticated. please sign in")
	);
}

function toRelayError(error: unknown, context: string): TRPCError {
	if (error instanceof TRPCError) return error;
	if (error instanceof RelayDispatchError) {
		if (isHostCloudAuthenticationError(error)) {
			return new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `${context}: Host service is not authenticated with Superset. Open the desktop app and sign in again.`,
			});
		}
		const relayMessage = relayErrorMessage(error);
		const message = relayMessage ?? error.message;
		const code =
			error.status === 400
				? "BAD_REQUEST"
				: error.status === 403
					? "FORBIDDEN"
					: error.status === 404
						? "NOT_FOUND"
						: error.status === 412 || error.status === 503
							? "PRECONDITION_FAILED"
							: "INTERNAL_SERVER_ERROR";
		return new TRPCError({
			code,
			message: `${context}: ${message}`,
		});
	}
	if (error instanceof Error) {
		if (isRelayTransportError(error)) {
			return new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `${context}: Relay is unavailable`,
			});
		}
		return new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `${context}: ${error.message}`,
		});
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `${context}: unknown error`,
	});
}

type EnsureHostLocalWorkspaceResult = {
	ok: true;
	workspaceId: string;
	adopted: false | "adopted" | "repaired";
	worktreePath: string | null;
};

type WorkspaceRecoveryTarget = {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isHostWorkspaceMissingError(
	error: unknown,
	workspaceId: string,
): boolean {
	if (!(error instanceof RelayDispatchError)) return false;
	const haystack = relayErrorSearchText(error);
	return (
		(haystack.includes("workspace not found") ||
			haystack.includes("worktree not found")) &&
		(haystack.includes(workspaceId.toLowerCase()) ||
			haystack.includes('"workspace not found"'))
	);
}

function isRelayMissingProcedure(error: unknown, procedure: string): boolean {
	if (!(error instanceof RelayDispatchError)) return false;
	const haystack = `${error.message}\n${error.body}`;
	return (
		haystack.includes("No procedure found") && haystack.includes(procedure)
	);
}

function getRuntimeWebSocket(): RuntimeWebSocketConstructor {
	const runtime = globalThis as typeof globalThis & {
		WebSocket?: RuntimeWebSocketConstructor;
	};
	if (!runtime.WebSocket) {
		throw new Error("WebSocket runtime is not available");
	}
	return runtime.WebSocket;
}

function isBlobLike(value: unknown): value is {
	arrayBuffer: () => Promise<ArrayBuffer>;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		typeof value.arrayBuffer === "function"
	);
}

function terminalWebSocketUrl(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	terminalId: string;
	workspaceId: string;
}): string {
	const url = new URL(
		`/hosts/${args.hostId}/terminal/${args.terminalId}`,
		args.relayUrl,
	);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("workspaceId", args.workspaceId);
	url.searchParams.set("token", args.jwt);
	return url.toString();
}

function trimTerminalOutputTail(output: Buffer, maxBytes: number): Buffer {
	return output.byteLength > maxBytes
		? output.subarray(output.byteLength - maxBytes)
		: output;
}

async function dataToBuffer(data: unknown): Promise<Buffer | null> {
	if (data instanceof ArrayBuffer) {
		return Buffer.from(data);
	}
	if (ArrayBuffer.isView(data)) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}
	if (isBlobLike(data)) {
		return Buffer.from(await data.arrayBuffer());
	}
	return null;
}

async function readTerminalOutputTailViaWebSocket(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	terminalId: string;
	workspaceId: string;
	maxBytes: number;
}): Promise<Buffer> {
	const WebSocketCtor = getRuntimeWebSocket();
	const url = terminalWebSocketUrl(args);

	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let attached = false;
		let settled = false;
		let quietTimer: ReturnType<typeof setTimeout> | null = null;
		const settle = () => {
			if (settled) return;
			settled = true;
			clearTimeout(hardTimer);
			if (quietTimer) clearTimeout(quietTimer);
			try {
				socket.close(1000, "snapshot complete");
			} catch {
				// best-effort
			}
			resolve(trimTerminalOutputTail(Buffer.concat(chunks), args.maxBytes));
		};
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(hardTimer);
			if (quietTimer) clearTimeout(quietTimer);
			try {
				socket.close(1011, "snapshot failed");
			} catch {
				// best-effort
			}
			reject(error);
		};
		const scheduleQuietSettle = (delayMs: number) => {
			if (quietTimer) clearTimeout(quietTimer);
			quietTimer = setTimeout(settle, delayMs);
		};
		const hardTimer = setTimeout(() => {
			if (chunks.length > 0 || attached) {
				settle();
				return;
			}
			fail(new Error("Timed out waiting for terminal WebSocket replay"));
		}, 3000);
		const socket = new WebSocketCtor(url);
		socket.binaryType = "arraybuffer";

		socket.onopen = () => {
			scheduleQuietSettle(1200);
		};
		socket.onmessage = (event) => {
			void (async () => {
				const buffer = await dataToBuffer(event.data);
				if (buffer) {
					chunks.push(buffer);
					scheduleQuietSettle(250);
					return;
				}
				if (typeof event.data !== "string") return;
				try {
					const message = JSON.parse(event.data) as {
						type?: string;
						message?: string;
					};
					if (message.type === "attached") {
						attached = true;
						scheduleQuietSettle(1200);
						return;
					}
					if (message.type === "error") {
						fail(new Error(message.message ?? "Terminal attach failed"));
					}
				} catch {
					// Ignore unknown control frames; terminal bytes arrive as binary.
				}
			})().catch((error) => {
				fail(error instanceof Error ? error : new Error(String(error)));
			});
		};
		socket.onerror = () => {
			fail(new Error("Terminal WebSocket snapshot failed"));
		};
		socket.onclose = (event) => {
			if (settled) return;
			if (chunks.length > 0 || attached) {
				settle();
				return;
			}
			fail(
				new Error(
					`Terminal WebSocket closed before replay (code=${event.code ?? "unknown"})`,
				),
			);
		};
	});
}

async function getTerminalSnapshotViaWebSocketFallback(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	terminalId: string;
	maxBytes: number;
}): Promise<WorkspaceTerminalSnapshot> {
	const listResult = await relayQuery<
		{ workspaceId: string },
		WorkspaceTerminalListResult
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			timeoutMs: 10_000,
		},
		"terminal.listSessions",
		{ workspaceId: args.workspaceId },
	);
	const session = listResult.sessions.find(
		(item) => item.terminalId === args.terminalId,
	);
	if (!session) {
		throw new Error("Terminal session not found");
	}

	const outputTail = await readTerminalOutputTailViaWebSocket(args);
	return {
		...session,
		outputTail: outputTail.toString("utf8"),
		bufferBytes: outputTail.byteLength,
	};
}

function isLegacyAdoptMaterializationMiss(error: unknown): boolean {
	if (!(error instanceof RelayDispatchError)) return false;
	const haystack = relayErrorSearchText(error);
	return (
		haystack.includes("project is not set up on this host") ||
		haystack.includes("no existing worktree") ||
		haystack.includes("failed to clone repository")
	);
}

async function ensureHostLocalWorkspace(args: {
	hostId: string;
	jwt: string;
	workspace: WorkspaceRecoveryTarget;
}) {
	const relayOptions = {
		relayUrl: env.RELAY_URL,
		hostId: args.hostId,
		jwt: args.jwt,
		timeoutMs: 120_000,
	};
	try {
		return await relayMutation<
			{
				workspaceId: string;
				verifiedCloudWorkspace: WorkspaceRecoveryTarget;
			},
			EnsureHostLocalWorkspaceResult
		>(relayOptions, "workspaceCreation.ensureLocal", {
			workspaceId: args.workspace.id,
			verifiedCloudWorkspace: args.workspace,
		});
	} catch (error) {
		if (!isRelayMissingProcedure(error, "workspaceCreation.ensureLocal")) {
			throw error;
		}
		try {
			await relayMutation<
				{
					projectId: string;
					workspaceName: string;
					branch: string;
					existingWorkspaceId: string;
				},
				unknown
			>(relayOptions, "workspaceCreation.adopt", {
				projectId: args.workspace.projectId,
				workspaceName: args.workspace.name,
				branch: args.workspace.branch,
				existingWorkspaceId: args.workspace.id,
			});
		} catch (adoptError) {
			if (!isLegacyAdoptMaterializationMiss(adoptError)) {
				throw adoptError;
			}
			await relayMutation<
				{
					projectId: string;
					name: string;
					branch: string;
					id: string;
				},
				unknown
			>(relayOptions, "workspaces.create", {
				projectId: args.workspace.projectId,
				name: args.workspace.name,
				branch: args.workspace.branch,
				id: args.workspace.id,
			});
		}
		return {
			ok: true as const,
			workspaceId: args.workspace.id,
			adopted: "adopted" as const,
			worktreePath: null,
		};
	}
}

async function withHostWorkspaceRecovery<T>(args: {
	hostId: string;
	jwt: string;
	workspace: WorkspaceRecoveryTarget;
	operation: () => Promise<T>;
}): Promise<T> {
	try {
		return await args.operation();
	} catch (error) {
		if (!isHostWorkspaceMissingError(error, args.workspace.id)) {
			throw error;
		}
		try {
			await ensureHostLocalWorkspace({
				hostId: args.hostId,
				jwt: args.jwt,
				workspace: args.workspace,
			});
		} catch (recoveryError) {
			if (recoveryError instanceof RelayDispatchError) {
				throw new RelayDispatchError(
					`Workspace is not available on the host and automatic recovery failed: ${recoveryError.message}`,
					recoveryError.status,
					recoveryError.body,
				);
			}
			throw new Error(
				`Workspace is not available on the host and automatic recovery failed: ${errorMessage(recoveryError)}`,
			);
		}
		return args.operation();
	}
}

export const v2WorkspaceRouter = {
	list: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				hostId: z.string().min(1).optional(),
				projectId: z.string().uuid().optional(),
				projectName: z.string().min(1).optional(),
				search: z.string().min(1).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const escapeLike = (value: string) =>
				value.replace(/[\\%_]/g, (char) => `\\${char}`);
			const searchPattern = input.search
				? `%${escapeLike(input.search)}%`
				: null;
			const searchMatch = searchPattern
				? or(
						ilike(v2Workspaces.name, searchPattern),
						ilike(v2Workspaces.branch, searchPattern),
					)
				: undefined;

			const rows = await db
				.select({
					id: v2Workspaces.id,
					name: v2Workspaces.name,
					branch: v2Workspaces.branch,
					projectId: v2Workspaces.projectId,
					projectName: v2Projects.name,
					hostId: v2Workspaces.hostId,
					type: v2Workspaces.type,
					createdAt: v2Workspaces.createdAt,
				})
				.from(v2Workspaces)
				.innerJoin(
					v2UsersHosts,
					and(
						eq(v2UsersHosts.organizationId, v2Workspaces.organizationId),
						eq(v2UsersHosts.hostId, v2Workspaces.hostId),
					),
				)
				.leftJoin(v2Projects, eq(v2Projects.id, v2Workspaces.projectId))
				.where(
					and(
						eq(v2Workspaces.organizationId, input.organizationId),
						eq(v2UsersHosts.userId, ctx.userId),
						input.hostId ? eq(v2Workspaces.hostId, input.hostId) : undefined,
						input.projectId
							? eq(v2Workspaces.projectId, input.projectId)
							: undefined,
						input.projectName
							? sql`lower(${v2Projects.name}) = lower(${input.projectName})`
							: undefined,
						searchMatch,
					),
				);

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				branch: row.branch,
				projectId: row.projectId,
				projectName: row.projectName ?? "",
				hostId: row.hostId,
				type: row.type,
				createdAt: row.createdAt,
			}));
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				hostId: z.string().min(1),
				type: z.enum(v2WorkspaceTypeValues).default("worktree"),
				taskId: z.string().uuid().optional(),
				id: z.string().uuid().optional(),
				clientMachineId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const project = await getScopedProject(
				input.organizationId,
				input.projectId,
			);
			const host = await getScopedHost(input.organizationId, input.hostId);

			if (input.taskId) {
				const found = await dbWs.query.tasks.findFirst({
					columns: { id: true, organizationId: true },
					where: eq(tasks.id, input.taskId),
				});
				if (!found) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "taskId not found",
					});
				}
				if (found.organizationId !== input.organizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "taskId must belong to the workspace's organization",
					});
				}
			}

			// Relies on the partial unique index (project_id, host_id) WHERE
			// type='main' for main-workspace idempotency.
			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(v2Workspaces)
					.values({
						...(input.id ? { id: input.id } : {}),
						organizationId: project.organizationId,
						projectId: project.id,
						name: input.name,
						branch: input.branch,
						hostId: host.machineId,
						type: input.type,
						createdByUserId: ctx.userId,
						taskId: input.taskId ?? null,
					})
					.onConflictDoNothing()
					.returning();

				if (inserted) {
					posthog.capture({
						distinctId: ctx.userId,
						event: "workspace_created",
						properties: {
							workspace_id: inserted.id,
							project_id: inserted.projectId,
							organization_id: inserted.organizationId,
							host_id: inserted.hostId,
							branch: inserted.branch,
							type: inserted.type,
							host_kind:
								input.clientMachineId &&
								input.clientMachineId === inserted.hostId
									? "local"
									: "remote",
							client_machine_id: input.clientMachineId ?? null,
						},
					});
					const txid = await getCurrentTxid(tx);
					return { workspace: inserted, txid };
				}

				if (input.id) {
					const existing = await tx.query.v2Workspaces.findFirst({
						where: and(
							eq(v2Workspaces.id, input.id),
							eq(v2Workspaces.organizationId, project.organizationId),
						),
					});
					if (existing) return { workspace: existing, txid: null };
					const collision = await tx.query.v2Workspaces.findFirst({
						columns: { id: true },
						where: eq(v2Workspaces.id, input.id),
					});
					if (collision) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Workspace id already in use",
						});
					}
				}

				if (input.type === "main") {
					const existing = await tx.query.v2Workspaces.findFirst({
						where: and(
							eq(v2Workspaces.projectId, project.id),
							eq(v2Workspaces.hostId, host.machineId),
							eq(v2Workspaces.type, "main"),
						),
					});
					if (existing) {
						const patch: {
							branch?: string;
							name?: string;
						} = {};
						if (existing.branch !== input.branch) {
							patch.branch = input.branch;
							if (existing.name === existing.branch) {
								patch.name = input.name;
							}
						}
						if (Object.keys(patch).length > 0) {
							const [updated] = await tx
								.update(v2Workspaces)
								.set(patch)
								.where(eq(v2Workspaces.id, existing.id))
								.returning();
							if (updated) {
								const txid = await getCurrentTxid(tx);
								return { workspace: updated, txid };
							}
							return { workspace: existing, txid: null };
						}
						return { workspace: existing, txid: null };
					}
				}

				return { workspace: null, txid: null };
			});

			if (result.workspace) {
				return { ...result.workspace, txid: result.txid };
			}

			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Workspace insert returned no row (type=${input.type}, projectId=${project.id}, hostId=${host.machineId})`,
			});
		}),

	setTask: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				taskId: z.string().uuid().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const workspace = await getWorkspaceAccess(
				ctx.session.user.id,
				input.workspaceId,
				{ organizationId },
			);
			if (input.taskId) {
				const task = await dbWs.query.tasks.findFirst({
					columns: { id: true, organizationId: true },
					where: eq(tasks.id, input.taskId),
				});
				if (!task) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Task not found",
					});
				}
				if (task.organizationId !== workspace.organizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Task does not belong to the workspace's organization",
					});
				}
			}
			const txid = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Workspaces)
					.set({ taskId: input.taskId })
					.where(eq(v2Workspaces.id, input.workspaceId))
					.returning({ id: v2Workspaces.id });
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Workspace not found",
					});
				}
				return getCurrentTxid(tx);
			});
			return { success: true as const, txid };
		}),

	runAgent: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				sessionId: z.string().uuid().optional(),
				prompt: z.string().trim().min(1),
				agent: z.string().trim().min(1).default("superset"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			if (input.sessionId) {
				await getOwnedWorkspaceChatSession({
					sessionId: input.sessionId,
					workspaceId: workspace.id,
					organizationId: workspace.organizationId,
					userId: ctx.session.user.id,
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								agent: string;
								prompt: string;
								sessionId?: string;
							},
							WorkspaceAgentRunResult
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 120_000 },
							"agents.run",
							{
								workspaceId: workspace.id,
								agent: input.agent,
								prompt: input.prompt,
								sessionId: input.sessionId,
							},
						),
				});
			} catch (error) {
				throw toRelayError(error, "Failed to start workspace agent");
			}
		}),

	listAgents: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				const hostAgents = await relayQuery<
					undefined,
					HostAgentConfigSummary[]
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"settings.agentConfigs.list",
					undefined,
				);
				const terminalAgents = hostAgents.map((agent) => ({
					id: agent.id,
					label: agent.label,
					kind: "terminal" as const,
					presetId: agent.presetId,
					command: agent.command,
					args: agent.args,
					env: agent.env,
				}));
				return [
					{
						id: "superset",
						label: "Claude Code",
						kind: "chat" as const,
						presetId: "superset",
					},
					...terminalAgents,
				] satisfies WorkspaceAgentOption[];
			} catch (error) {
				throw toRelayError(error, "Failed to load workspace agents");
			}
		}),

	listTerminalPresets: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayQuery<undefined, HostTerminalPresetSummary[]>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"settings.terminalPresets.list",
					undefined,
				);
			} catch (error) {
				throw toRelayError(error, "Failed to load terminal presets");
			}
		}),

	sendChatMessage: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				sessionId: z.string().uuid(),
				content: z.string().trim().min(1),
				files: z
					.array(
						z.object({
							data: z.string().min(1),
							mediaType: z.string().min(1),
							filename: z.string().optional(),
						}),
					)
					.optional(),
				metadata: workspaceChatMetadataSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								sessionId: string;
								payload: {
									content: string;
									files?: Array<{
										data: string;
										mediaType: string;
										filename?: string;
									}>;
								};
								metadata?: {
									model?: string;
									thinkingLevel?: "off" | "low" | "medium" | "high" | "xhigh";
								};
							},
							unknown
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 120_000 },
							"chat.sendMessage",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
								payload: { content: input.content, files: input.files },
								metadata: input.metadata,
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatSendResult;
			} catch (error) {
				throw toRelayError(error, "Failed to send workspace chat message");
			}
		}),

	getChatSnapshot: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				sessionId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayQuery<
							{ sessionId: string; workspaceId: string },
							WorkspaceChatSnapshot
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.getSnapshot",
							{
								sessionId: input.sessionId,
								workspaceId: workspace.id,
							},
						),
				});
			} catch (error) {
				throw toRelayError(error, "Failed to load workspace chat");
			}
		}),

	stopChatSession: protectedProcedure
		.input(workspaceChatSessionInputSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<{ workspaceId: string; sessionId: string }, unknown>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.stop",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatControlResult;
			} catch (error) {
				throw toRelayError(error, "Failed to stop workspace chat");
			}
		}),

	endChatSession: protectedProcedure
		.input(workspaceChatSessionInputSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<{ workspaceId: string; sessionId: string }, unknown>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.endSession",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatControlResult;
			} catch (error) {
				throw toRelayError(error, "Failed to end workspace chat");
			}
		}),

	respondToChatApproval: protectedProcedure
		.input(
			workspaceChatSessionInputSchema.extend({
				decision: workspaceChatApprovalDecisionSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								sessionId: string;
								payload: {
									decision: "approve" | "decline" | "always_allow_category";
								};
							},
							unknown
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.respondToApproval",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
								payload: { decision: input.decision },
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatControlResult;
			} catch (error) {
				throw toRelayError(error, "Failed to respond to workspace approval");
			}
		}),

	respondToChatQuestion: protectedProcedure
		.input(
			workspaceChatSessionInputSchema.extend({
				questionId: z.string().trim().min(1),
				answer: z.string().trim().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								sessionId: string;
								payload: { questionId: string; answer: string };
							},
							unknown
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.respondToQuestion",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
								payload: {
									questionId: input.questionId,
									answer: input.answer,
								},
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatControlResult;
			} catch (error) {
				throw toRelayError(error, "Failed to answer workspace question");
			}
		}),

	respondToChatPlan: protectedProcedure
		.input(
			workspaceChatSessionInputSchema.extend({
				planId: z.string().trim().min(1),
				action: z.enum(["approved", "rejected"]),
				feedback: z.string().trim().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			await getOwnedWorkspaceChatSession({
				sessionId: input.sessionId,
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				userId: ctx.session.user.id,
			});

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								sessionId: string;
								payload: {
									planId: string;
									response: {
										action: "approved" | "rejected";
										feedback?: string;
									};
								};
							},
							unknown
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"chat.respondToPlan",
							{
								workspaceId: workspace.id,
								sessionId: input.sessionId,
								payload: {
									planId: input.planId,
									response: {
										action: input.action,
										feedback: input.feedback,
									},
								},
							},
						),
				});
				return { ok: true } satisfies WorkspaceChatControlResult;
			} catch (error) {
				throw toRelayError(error, "Failed to respond to workspace plan");
			}
		}),

	listChatModels: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);
			const relayOptions = {
				relayUrl: env.RELAY_URL,
				hostId,
				jwt,
				timeoutMs: 30_000,
			};

			try {
				const providers = await listModelProviderSyncPayload(
					workspace.organizationId,
				);
				if (providers.length > 0) {
					await relayMutation<
						{ providers: WorkspaceModelProviderSyncPayload[] },
						unknown
					>(relayOptions, "modelProviders.syncFromCloud", { providers });
				}
				const models = await relayQuery<undefined, WorkspaceChatModel[]>(
					relayOptions,
					"modelProviders.listChatModels",
					undefined,
				);
				const mobileModels = filterMobileAcpChatModels(models);
				return mobileModels;
			} catch (error) {
				throw toRelayError(error, "Failed to load workspace chat models");
			}
		}),

	createTerminal: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				command: z.string().trim().min(1).optional(),
				cwd: z.string().trim().min(1).optional(),
				cols: z.number().int().positive().optional(),
				rows: z.number().int().positive().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await withHostWorkspaceRecovery({
					hostId,
					jwt,
					workspace,
					operation: () =>
						relayMutation<
							{
								workspaceId: string;
								initialCommand?: string;
								cwd?: string;
								cols?: number;
								rows?: number;
							},
							WorkspaceTerminalCreateResult
						>(
							{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
							"terminal.createSession",
							{
								workspaceId: workspace.id,
								initialCommand: input.command,
								cwd: input.cwd,
								cols: input.cols,
								rows: input.rows,
							},
						),
				});
			} catch (error) {
				throw toRelayError(error, "Failed to create workspace terminal");
			}
		}),

	listTerminals: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayQuery<
					{ workspaceId: string },
					WorkspaceTerminalListResult
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.listSessions",
					{ workspaceId: workspace.id },
				);
			} catch (error) {
				throw toRelayError(error, "Failed to list workspace terminals");
			}
		}),

	getTerminalAttachDescriptor: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().trim().min(1),
				replay: z.boolean().default(true),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				const listResult = await relayQuery<
					{ workspaceId: string },
					WorkspaceTerminalListResult
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.listSessions",
					{ workspaceId: workspace.id },
				);
				const session = listResult.sessions.find(
					(item) => item.terminalId === input.terminalId,
				);
				if (!session) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Terminal session not found",
					});
				}

				const url = new URL(
					terminalWebSocketUrl({
						relayUrl: env.RELAY_URL,
						hostId,
						jwt,
						terminalId: input.terminalId,
						workspaceId: workspace.id,
					}),
				);
				if (!input.replay) {
					url.searchParams.set("replay", "0");
				}

				return {
					mode: "terminal-websocket",
					terminalId: input.terminalId,
					workspaceId: workspace.id,
					hostId,
					relayUrl: env.RELAY_URL,
					webSocketUrl: url.toString(),
					expiresAt: new Date(
						Date.now() + WORKSPACE_CONTROL_JWT_TTL_SECONDS * 1000,
					),
					replay: input.replay,
				} satisfies WorkspaceTerminalAttachDescriptor;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw toRelayError(error, "Failed to create terminal attach URL");
			}
		}),

	getTerminalSnapshot: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().trim().min(1),
				maxBytes: z
					.number()
					.int()
					.positive()
					.max(64 * 1024)
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayQuery<
					{ workspaceId: string; terminalId: string; maxBytes?: number },
					WorkspaceTerminalSnapshot
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.getSnapshot",
					{
						workspaceId: workspace.id,
						terminalId: input.terminalId,
						maxBytes: input.maxBytes,
					},
				);
			} catch (error) {
				if (isRelayMissingProcedure(error, "terminal.getSnapshot")) {
					try {
						return await getTerminalSnapshotViaWebSocketFallback({
							relayUrl: env.RELAY_URL,
							hostId,
							jwt,
							workspaceId: workspace.id,
							terminalId: input.terminalId,
							maxBytes: input.maxBytes ?? 16 * 1024,
						});
					} catch (fallbackError) {
						throw toRelayError(
							fallbackError,
							"Failed to load workspace terminal output",
						);
					}
				}
				throw toRelayError(error, "Failed to load workspace terminal output");
			}
		}),

	writeTerminalInput: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().trim().min(1),
				data: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayMutation<
					{ workspaceId: string; terminalId: string; data: string },
					WorkspaceTerminalInputResult
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.writeInput",
					{
						workspaceId: workspace.id,
						terminalId: input.terminalId,
						data: input.data,
					},
				);
			} catch (error) {
				throw toRelayError(error, "Failed to write workspace terminal input");
			}
		}),

	resizeTerminal: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().trim().min(1),
				cols: z.number().int().positive(),
				rows: z.number().int().positive(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayMutation<
					{
						workspaceId: string;
						terminalId: string;
						cols: number;
						rows: number;
					},
					WorkspaceTerminalResizeResult
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.resize",
					{
						workspaceId: workspace.id,
						terminalId: input.terminalId,
						cols: input.cols,
						rows: input.rows,
					},
				);
			} catch (error) {
				throw toRelayError(error, "Failed to resize workspace terminal");
			}
		}),

	deleteTerminal: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().trim().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const { workspace, host } = await getWorkspaceHostControlAccess(
				ctx.session.user.id,
				input.workspaceId,
				organizationId,
			);

			if (!host.isOnline) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace host is offline",
				});
			}

			const jwt = await mintWorkspaceControlJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email,
				organizationId: workspace.organizationId,
			});
			const hostId = buildHostRoutingKey(
				workspace.organizationId,
				workspace.hostId,
			);

			try {
				return await relayMutation<
					{
						workspaceId: string;
						terminalId: string;
					},
					WorkspaceTerminalDeleteResult
				>(
					{ relayUrl: env.RELAY_URL, hostId, jwt, timeoutMs: 30_000 },
					"terminal.killSession",
					{
						workspaceId: workspace.id,
						terminalId: input.terminalId,
					},
				);
			} catch (error) {
				throw toRelayError(error, "Failed to delete workspace terminal");
			}
		}),

	getFromHost: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			return (
				(await dbWs.query.v2Workspaces.findFirst({
					where: and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, input.organizationId),
					),
				})) ?? null
			);
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().min(1).optional(),
				hostId: z.string().min(1).optional(),
				taskId: z.string().uuid().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const workspace = await getWorkspaceAccess(
				ctx.session.user.id,
				input.id,
				{
					organizationId,
				},
			);

			if (input.hostId !== undefined) {
				await getScopedHost(workspace.organizationId, input.hostId);
			}

			if (input.taskId) {
				const found = await dbWs.query.tasks.findFirst({
					columns: { id: true, organizationId: true },
					where: eq(tasks.id, input.taskId),
				});
				if (!found) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "taskId not found",
					});
				}
				if (found.organizationId !== workspace.organizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "taskId must belong to the workspace's organization",
					});
				}
			}

			const data = {
				branch: input.branch,
				hostId: input.hostId,
				name: input.name,
				taskId: input.taskId,
			};
			if (
				Object.keys(data).every(
					(k) => data[k as keyof typeof data] === undefined,
				)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update",
				});
			}
			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Workspaces)
					.set(data)
					.where(eq(v2Workspaces.id, workspace.id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { updated, txid };
			});
			const { updated, txid } = result;
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			return { ...updated, txid };
		}),

	// JWT-authed so host-service can apply AI-generated workspace names
	// after create without an end-user session. Optional `expectedCurrentName`
	// is folded into the UPDATE's WHERE so a concurrent user edit can't be
	// clobbered between check and write. `branch` is optional so the same
	// entry point covers the AI rename (name + branch together) and any
	// future name-only or branch-only updates.
	updateNameFromHost: jwtProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					name: z.string().min(1).optional(),
					branch: z.string().min(1).optional(),
					expectedCurrentName: z.string().optional(),
				})
				.refine((v) => v.name !== undefined || v.branch !== undefined, {
					message: "At least one of name or branch must be provided",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const conditions = [
				eq(v2Workspaces.id, input.id),
				inArray(v2Workspaces.organizationId, ctx.organizationIds),
			];
			if (input.expectedCurrentName !== undefined) {
				conditions.push(eq(v2Workspaces.name, input.expectedCurrentName));
			}
			const patch: { name?: string; branch?: string } = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.branch !== undefined) patch.branch = input.branch;
			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Workspaces)
					.set(patch)
					.where(and(...conditions))
					.returning();
				if (!updated) return { updated, txid: null };
				const txid = await getCurrentTxid(tx);
				return { updated, txid };
			});
			if (result.updated) return { ...result.updated, txid: result.txid };

			// Nothing updated — disambiguate for a useful error. Happy path
			// already returned above, so this fetch only runs when id/org/name
			// failed to match.
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			// Expected-name mismatch: a user edit landed first. Return the
			// current row so host-service can observe the skip.
			return workspace;
		}),

	// JWT-authed so host-service can orchestrate the full delete saga
	// (terminals → teardown → worktree → branch → cloud → host sqlite) via
	// its own JWT auth provider. The session-backed protectedProcedure
	// would reject host-service callers with 401.
	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
					type: true,
					projectId: true,
					hostId: true,
					branch: true,
				},
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				// Already gone in the cloud; idempotent success.
				return { success: true, alreadyGone: true as const };
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			if (workspace.type === "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: MAIN_WORKSPACE_DELETE_MESSAGE,
				});
			}
			const txid = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.delete(v2Workspaces)
					.where(eq(v2Workspaces.id, workspace.id))
					.returning({ id: v2Workspaces.id });
				if (!deleted) return null;
				return getCurrentTxid(tx);
			});
			if (txid === null) {
				return { success: true, alreadyGone: true as const, txid };
			}

			posthog.capture({
				distinctId: ctx.userId,
				event: "workspace_deleted",
				properties: {
					workspace_id: workspace.id,
					project_id: workspace.projectId,
					organization_id: workspace.organizationId,
					host_id: workspace.hostId,
					branch: workspace.branch,
					type: workspace.type,
				},
			});

			return { success: true, alreadyGone: false as const, txid };
		}),

	// Main workspaces are not normal delete targets. This endpoint is reserved
	// for host project removal, where the repo-root workspace must be detached
	// from this host before the local project row disappears.
	deleteMainForHost: jwtProcedure
		.input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
					projectId: true,
					type: true,
				},
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				return { success: true, alreadyGone: true as const };
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			if (workspace.projectId !== input.projectId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace does not belong to this project",
				});
			}
			if (workspace.type !== "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace is not a main workspace",
				});
			}
			const txid = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.delete(v2Workspaces)
					.where(eq(v2Workspaces.id, workspace.id))
					.returning({ id: v2Workspaces.id });
				if (!deleted) return null;
				return getCurrentTxid(tx);
			});
			if (txid === null) {
				return { success: true, alreadyGone: true as const, txid };
			}
			return { success: true, alreadyGone: false as const, txid };
		}),
} satisfies TRPCRouterRecord;
