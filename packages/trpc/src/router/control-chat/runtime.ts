import { randomUUID } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import type { ControlChatMessageContent } from "@superset/db/schema";
import {
	controlChatRuns,
	controlChatToolCalls,
	modelProviderModels,
	modelProviders,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { decryptSecret } from "../project/secrets/utils/crypto";
import { getControlChatIntentFlags } from "./intent";
import {
	ControlChatRunAbortedError,
	type ControlChatTurnResult,
	isControlChatRunAbortedStatus,
	resolveControlChatTurnStatus,
} from "./runtime-status";
import {
	type ControlChatRendererContext,
	type ControlChatToolName,
	controlChatToolSchemas,
} from "./schema";
import {
	type ControlChatToolContext,
	type ControlChatToolResult,
	executeControlChatTool,
	findNamedAutomation,
	findNamedCapability,
} from "./tools";

type PlannedToolCall = {
	name: ControlChatToolName;
	input: Record<string, unknown>;
	targetHostId?: string | null;
	targetWorkspaceId?: string | null;
};

export interface ControlChatRunInput {
	organizationId: string;
	userId: string;
	sessionId: string;
	runId: string;
	message: string;
	rendererContext: ControlChatRendererContext;
	modelProviderId?: string | null;
	modelId?: string | null;
}

type ControlChatModelSelection = {
	providerId: string;
	protocol: "anthropic" | "openai-chat" | "openai-responses";
	baseUrl: string;
	secret: string;
	modelId: string;
};

type ModelControlPlan = {
	assistantMessage?: string;
	calls: PlannedToolCall[];
};

const CONTROL_CHAT_MODEL_TIMEOUT_MS = 45_000;

async function throwIfRunAborted(input: ControlChatRunInput) {
	const [run] = await db
		.select({ status: controlChatRuns.status })
		.from(controlChatRuns)
		.where(
			and(
				eq(controlChatRuns.id, input.runId),
				eq(controlChatRuns.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (isControlChatRunAbortedStatus(run?.status)) {
		throw new ControlChatRunAbortedError();
	}
}

async function listAccessibleHosts(args: {
	organizationId: string;
	userId: string;
}) {
	return db
		.select({
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
			role: v2UsersHosts.role,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2Hosts.organizationId, args.organizationId),
				eq(v2UsersHosts.userId, args.userId),
			),
		);
}

async function resolveControlChatModel(args: {
	organizationId: string;
	modelProviderId?: string | null;
	modelId?: string | null;
}): Promise<ControlChatModelSelection | null> {
	const rows = await db
		.select({
			providerId: modelProviders.id,
			protocol: modelProviders.protocol,
			baseUrl: modelProviders.baseUrl,
			secretEncrypted: modelProviders.secretEncrypted,
			modelId: modelProviderModels.modelId,
		})
		.from(modelProviders)
		.innerJoin(
			modelProviderModels,
			eq(modelProviderModels.providerId, modelProviders.id),
		)
		.where(
			and(
				eq(modelProviders.organizationId, args.organizationId),
				eq(modelProviders.enabled, true),
				eq(modelProviderModels.enabled, true),
				isNotNull(modelProviders.secretEncrypted),
				args.modelProviderId
					? eq(modelProviders.id, args.modelProviderId)
					: undefined,
				args.modelId
					? eq(modelProviderModels.modelId, args.modelId)
					: undefined,
			),
		)
		.orderBy(
			asc(modelProviders.createdAt),
			asc(modelProviderModels.displayOrder),
			asc(modelProviderModels.modelId),
		);

	for (const row of rows) {
		if (!row.secretEncrypted) continue;
		try {
			return {
				providerId: row.providerId,
				protocol: row.protocol,
				baseUrl: row.baseUrl,
				secret: decryptSecret(row.secretEncrypted),
				modelId: row.modelId,
			};
		} catch {}
	}

	return null;
}

function appendProviderPath(baseUrl: string, endpoint: string): string {
	const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
	const normalizedEndpoint = endpoint.startsWith("/")
		? endpoint
		: `/${endpoint}`;
	if (
		/\/v1$/i.test(normalizedBaseUrl) &&
		normalizedEndpoint.toLowerCase().startsWith("/v1/")
	) {
		return `${normalizedBaseUrl}${normalizedEndpoint.slice("/v1".length)}`;
	}
	return `${normalizedBaseUrl}${normalizedEndpoint}`;
}

function controlChatModelEndpoint(
	protocol: ControlChatModelSelection["protocol"],
): string {
	if (protocol === "anthropic") return "/v1/messages";
	if (protocol === "openai-responses") return "/v1/responses";
	return "/v1/chat/completions";
}

function controlChatModelHeaders(model: ControlChatModelSelection): Headers {
	const headers = new Headers({
		accept: "application/json",
		"content-type": "application/json",
	});
	if (model.protocol === "anthropic") {
		headers.set("x-api-key", model.secret);
		headers.set("anthropic-version", "2023-06-01");
		return headers;
	}
	headers.set("authorization", `Bearer ${model.secret}`);
	return headers;
}

function controlChatModelBody(args: {
	model: ControlChatModelSelection;
	system: string;
	user: string;
}) {
	if (args.model.protocol === "anthropic") {
		return {
			model: args.model.modelId,
			max_tokens: 1600,
			temperature: 0,
			system: args.system,
			messages: [{ role: "user", content: args.user }],
		};
	}
	if (args.model.protocol === "openai-responses") {
		return {
			model: args.model.modelId,
			input: args.user,
			instructions: args.system,
			max_output_tokens: 1600,
			temperature: 0,
			stream: false,
		};
	}
	return {
		model: args.model.modelId,
		messages: [
			{ role: "system", content: args.system },
			{ role: "user", content: args.user },
		],
		max_tokens: 1600,
		temperature: 0,
		stream: false,
	};
}

function extractModelText(
	protocol: ControlChatModelSelection["protocol"],
	body: unknown,
): string {
	if (typeof body === "string") return body;
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return "";
	}
	const record = body as Record<string, unknown>;
	if (protocol === "anthropic" && Array.isArray(record.content)) {
		return record.content
			.map((item) => {
				if (typeof item !== "object" || item === null || Array.isArray(item)) {
					return "";
				}
				const content = item as Record<string, unknown>;
				return typeof content.text === "string" ? content.text : "";
			})
			.filter(Boolean)
			.join("\n");
	}
	if (protocol === "openai-responses") {
		if (typeof record.output_text === "string") return record.output_text;
		if (!Array.isArray(record.output)) return "";
		return record.output
			.map((item) => {
				if (typeof item !== "object" || item === null || Array.isArray(item)) {
					return "";
				}
				const output = item as Record<string, unknown>;
				if (!Array.isArray(output.content)) return "";
				return output.content
					.map((contentItem) => {
						if (
							typeof contentItem !== "object" ||
							contentItem === null ||
							Array.isArray(contentItem)
						) {
							return "";
						}
						const content = contentItem as Record<string, unknown>;
						return typeof content.text === "string" ? content.text : "";
					})
					.filter(Boolean)
					.join("\n");
			})
			.filter(Boolean)
			.join("\n");
	}
	const firstChoice = Array.isArray(record.choices)
		? record.choices.find(
				(choice): choice is Record<string, unknown> =>
					typeof choice === "object" &&
					choice !== null &&
					!Array.isArray(choice),
			)
		: null;
	const message =
		firstChoice &&
		typeof firstChoice.message === "object" &&
		firstChoice.message !== null &&
		!Array.isArray(firstChoice.message)
			? (firstChoice.message as Record<string, unknown>)
			: null;
	return typeof message?.content === "string" ? message.content : "";
}

function extractJsonObjectText(text: string): string | null {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		const candidate = fenced[1].trim();
		if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
	}
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return null;
}

function extractQuotedName(message: string): string | null {
	return message.match(/["“”']([^"“”']{2,120})["“”']/)?.[1]?.trim() ?? null;
}

function extractUrl(message: string): string | undefined {
	return message.match(/https?:\/\/[^\s"'“”]+/)?.[0];
}

function inferGeneratedName(message: string, fallback: string): string {
	const quoted = extractQuotedName(message);
	if (quoted) return quoted;
	const url = extractUrl(message);
	if (url) {
		try {
			return new URL(url).hostname.replace(/^www\./, "");
		} catch {}
	}
	return fallback;
}

function buildControlChatModelPrompt(args: {
	message: string;
	rendererContext: ControlChatRendererContext;
	hosts: Awaited<ReturnType<typeof listAccessibleHosts>>;
}) {
	const tools = [
		"automation.list",
		"automation.get",
		"automation.create",
		"automation.update",
		"automation.pause",
		"automation.resume",
		"automation.run",
		"automation.logs",
		"automation.versions.list",
		"automation.versions.restore",
		"capability.list",
		"capability.get",
		"capability.importPackage",
		"capability.setStatus",
		"capability.delete",
		"capability.versions.list",
		"capability.versions.restore",
		"capability.generateSkillPackage",
		"capability.generateCliPackage",
	];
	const system = `You are Superset Control Chat, an organization-level assistant that manages Superset Automations and Tools & Skills through typed internal tools.
Return only one JSON object. Do not include Markdown.
Shape:
{
  "assistantMessage": "short message to show before/without tool calls",
  "toolCalls": [
    { "name": "tool.name", "input": { "field": "value" } }
  ]
}
Use toolCalls when the user asks to inspect or change Superset configuration. Use no toolCalls only for ordinary conversation or when required details are missing.
Default execution permission mode is bypassPermissions, but authorization and host access are still enforced by Superset.
Available tools: ${tools.join(", ")}.
Important input hints:
- automation.create requires name, prompt, agent, rrule, timezone. Use agent "codex" if unspecified.
- capability.generateSkillPackage requires name and instruction.
- capability.generateCliPackage requires name and instruction; include sourceUrl when the user provides a URL.
- capability.setStatus status is "active" or "disabled".
- For named pause/resume/run/delete requests, list first if the user did not provide an id.`;
	const user = JSON.stringify(
		{
			message: args.message,
			rendererContext: args.rendererContext,
			hosts: args.hosts.map((host) => ({
				machineId: host.machineId,
				name: host.name,
				isOnline: host.isOnline,
				role: host.role,
			})),
		},
		null,
		2,
	);
	return { system, user };
}

async function fetchModelPlan(args: {
	model: ControlChatModelSelection;
	system: string;
	user: string;
}): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		CONTROL_CHAT_MODEL_TIMEOUT_MS,
	);
	try {
		const response = await fetch(
			appendProviderPath(
				args.model.baseUrl,
				controlChatModelEndpoint(args.model.protocol),
			),
			{
				method: "POST",
				headers: controlChatModelHeaders(args.model),
				body: JSON.stringify(
					controlChatModelBody({
						model: args.model,
						system: args.system,
						user: args.user,
					}),
				),
				signal: controller.signal,
			},
		);
		if (!response.ok) return null;
		return (await response.json()) as unknown;
	} finally {
		clearTimeout(timeout);
	}
}

function parseModelPlan(text: string): ModelControlPlan | null {
	const jsonText = extractJsonObjectText(text);
	if (!jsonText) return null;
	const parsed = JSON.parse(jsonText) as unknown;
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return null;
	}
	const record = parsed as Record<string, unknown>;
	const assistantMessage =
		typeof record.assistantMessage === "string" &&
		record.assistantMessage.trim()
			? record.assistantMessage.trim()
			: undefined;
	const rawCalls = Array.isArray(record.toolCalls) ? record.toolCalls : [];
	const calls: PlannedToolCall[] = [];
	for (const rawCall of rawCalls) {
		if (
			typeof rawCall !== "object" ||
			rawCall === null ||
			Array.isArray(rawCall)
		) {
			continue;
		}
		const call = rawCall as Record<string, unknown>;
		if (
			typeof call.name !== "string" ||
			!(call.name in controlChatToolSchemas)
		) {
			continue;
		}
		const name = call.name as ControlChatToolName;
		const inputResult = controlChatToolSchemas[name].safeParse(
			call.input ?? {},
		);
		if (!inputResult.success) continue;
		calls.push({
			name,
			input: inputResult.data as Record<string, unknown>,
			targetHostId:
				typeof call.targetHostId === "string" ? call.targetHostId : null,
			targetWorkspaceId:
				typeof call.targetWorkspaceId === "string"
					? call.targetWorkspaceId
					: null,
		});
	}
	return { assistantMessage, calls };
}

async function planToolCallsWithModel(args: {
	message: string;
	organizationId: string;
	userId: string;
	rendererContext: ControlChatRendererContext;
	hosts: Awaited<ReturnType<typeof listAccessibleHosts>>;
	modelProviderId?: string | null;
	modelId?: string | null;
}): Promise<ModelControlPlan | null> {
	const model = await resolveControlChatModel({
		organizationId: args.organizationId,
		modelProviderId: args.modelProviderId,
		modelId: args.modelId,
	});
	if (!model) return null;
	const prompt = buildControlChatModelPrompt({
		message: args.message,
		rendererContext: args.rendererContext,
		hosts: args.hosts,
	});
	try {
		const body = await fetchModelPlan({ model, ...prompt });
		if (!body) return null;
		return parseModelPlan(extractModelText(model.protocol, body));
	} catch (error) {
		console.warn("[control-chat] model planning failed", {
			providerId: model.providerId,
			modelId: model.modelId,
			error,
		});
		return null;
	}
}

async function planToolCalls(args: {
	message: string;
	organizationId: string;
	userId: string;
}): Promise<PlannedToolCall[]> {
	const message = args.message.trim();
	const lower = message.toLowerCase();
	const { asksAutomation, asksCapability } = getControlChatIntentFlags(message);

	if (
		(lower.includes("create") ||
			lower.includes("generate") ||
			lower.includes("build") ||
			message.includes("创建") ||
			message.includes("生成") ||
			message.includes("做成")) &&
		(lower.includes("cli") ||
			message.includes("网站") ||
			message.includes("命令行") ||
			message.includes("爬下来"))
	) {
		const url = extractUrl(message);
		return [
			{
				name: "capability.generateCliPackage",
				input: {
					name: inferGeneratedName(message, "Generated CLI"),
					description: "Generated from a Control Chat instruction.",
					instruction: message,
					sourceUrl: url,
					sourceRef: url,
				},
			},
		];
	}

	if (
		(lower.includes("create") ||
			lower.includes("generate") ||
			lower.includes("build") ||
			message.includes("创建") ||
			message.includes("生成")) &&
		(lower.includes("skill") || message.includes("技能"))
	) {
		return [
			{
				name: "capability.generateSkillPackage",
				input: {
					name: inferGeneratedName(message, "Generated Skill"),
					description: "Generated from a Control Chat instruction.",
					instruction: message,
				},
			},
		];
	}

	if (
		asksAutomation &&
		(lower.includes("list") ||
			lower.includes("show") ||
			message.includes("列出") ||
			message.includes("有哪些"))
	) {
		return [{ name: "automation.list", input: {} }];
	}

	if (
		asksCapability &&
		(lower.includes("list") ||
			lower.includes("show") ||
			message.includes("列出") ||
			message.includes("有哪些"))
	) {
		return [{ name: "capability.list", input: {} }];
	}

	if (
		asksAutomation &&
		(lower.includes("pause") ||
			lower.includes("disable") ||
			message.includes("暂停") ||
			message.includes("停用"))
	) {
		const list = await executeControlChatTool(
			"automation.list",
			{},
			{
				organizationId: args.organizationId,
				userId: args.userId,
				sessionId: "00000000-0000-0000-0000-000000000000",
				runId: "00000000-0000-0000-0000-000000000000",
				sourceInstruction: message,
			},
		);
		const automations =
			(list.output.automations as { id: string; name: string }[]) ?? [];
		const target = findNamedAutomation(automations, message);
		if (target) return [{ name: "automation.pause", input: { id: target.id } }];
	}

	if (
		asksAutomation &&
		(lower.includes("resume") ||
			lower.includes("enable") ||
			message.includes("恢复") ||
			message.includes("启用"))
	) {
		const list = await executeControlChatTool(
			"automation.list",
			{},
			{
				organizationId: args.organizationId,
				userId: args.userId,
				sessionId: "00000000-0000-0000-0000-000000000000",
				runId: "00000000-0000-0000-0000-000000000000",
				sourceInstruction: message,
			},
		);
		const automations =
			(list.output.automations as { id: string; name: string }[]) ?? [];
		const target = findNamedAutomation(automations, message);
		if (target)
			return [{ name: "automation.resume", input: { id: target.id } }];
	}

	if (
		asksAutomation &&
		(lower.includes("run") ||
			lower.includes("trigger") ||
			message.includes("运行") ||
			message.includes("执行"))
	) {
		const list = await executeControlChatTool(
			"automation.list",
			{},
			{
				organizationId: args.organizationId,
				userId: args.userId,
				sessionId: "00000000-0000-0000-0000-000000000000",
				runId: "00000000-0000-0000-0000-000000000000",
				sourceInstruction: message,
			},
		);
		const automations =
			(list.output.automations as { id: string; name: string }[]) ?? [];
		const target = findNamedAutomation(automations, message);
		if (target) return [{ name: "automation.run", input: { id: target.id } }];
	}

	if (
		asksCapability &&
		(lower.includes("disable") ||
			lower.includes("pause") ||
			message.includes("禁用") ||
			message.includes("停用"))
	) {
		const list = await executeControlChatTool(
			"capability.list",
			{},
			{
				organizationId: args.organizationId,
				userId: args.userId,
				sessionId: "00000000-0000-0000-0000-000000000000",
				runId: "00000000-0000-0000-0000-000000000000",
				sourceInstruction: message,
			},
		);
		const capabilities =
			(list.output.capabilities as {
				id: string;
				name: string;
				slug: string;
			}[]) ?? [];
		const target = findNamedCapability(capabilities, message);
		if (target) {
			return [
				{
					name: "capability.setStatus",
					input: { id: target.id, status: "disabled" },
				},
			];
		}
	}

	if (
		asksCapability &&
		(lower.includes("enable") ||
			lower.includes("resume") ||
			message.includes("启用") ||
			message.includes("恢复"))
	) {
		const list = await executeControlChatTool(
			"capability.list",
			{},
			{
				organizationId: args.organizationId,
				userId: args.userId,
				sessionId: "00000000-0000-0000-0000-000000000000",
				runId: "00000000-0000-0000-0000-000000000000",
				sourceInstruction: message,
			},
		);
		const capabilities =
			(list.output.capabilities as {
				id: string;
				name: string;
				slug: string;
			}[]) ?? [];
		const target = findNamedCapability(capabilities, message);
		if (target) {
			return [
				{
					name: "capability.setStatus",
					input: { id: target.id, status: "active" },
				},
			];
		}
	}

	return [];
}

async function persistToolCall(args: {
	run: ControlChatRunInput;
	call: PlannedToolCall;
}) {
	const id = randomUUID();
	await dbWs.insert(controlChatToolCalls).values({
		id,
		runId: args.run.runId,
		sessionId: args.run.sessionId,
		organizationId: args.run.organizationId,
		toolName: args.call.name,
		targetKind: args.call.targetWorkspaceId
			? "workspace"
			: args.call.targetHostId
				? "host"
				: "cloud",
		targetHostId: args.call.targetHostId ?? null,
		targetWorkspaceId: args.call.targetWorkspaceId ?? null,
		input: args.call.input,
		status: "running",
		startedAt: new Date(),
	});
	return id;
}

async function runPersistedTool(args: {
	run: ControlChatRunInput;
	call: PlannedToolCall;
}): Promise<{ toolCallId: string; result: ControlChatToolResult }> {
	await throwIfRunAborted(args.run);
	const toolCallId = await persistToolCall(args);
	const toolContext: ControlChatToolContext = {
		organizationId: args.run.organizationId,
		userId: args.run.userId,
		sessionId: args.run.sessionId,
		runId: args.run.runId,
		sourceInstruction: args.run.message,
	};
	try {
		await throwIfRunAborted(args.run);
		const result = await executeControlChatTool(
			args.call.name,
			args.call.input,
			toolContext,
		);
		await throwIfRunAborted(args.run);
		await dbWs
			.update(controlChatToolCalls)
			.set({
				status: "completed",
				output: result.output,
				completedAt: new Date(),
			})
			.where(eq(controlChatToolCalls.id, toolCallId));
		return { toolCallId, result };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Control Chat tool failed";
		await dbWs
			.update(controlChatToolCalls)
			.set({
				status: "failed",
				error: message,
				output: { error: message },
				completedAt: new Date(),
			})
			.where(eq(controlChatToolCalls.id, toolCallId));
		throw error;
	}
}

function fallbackAssistantContent(args: {
	hosts: Awaited<ReturnType<typeof listAccessibleHosts>>;
	rendererContext: ControlChatRendererContext;
}): ControlChatMessageContent[] {
	const hostText =
		args.hosts.length === 0
			? "No accessible hosts are registered."
			: `${args.hosts.length} accessible host${args.hosts.length === 1 ? "" : "s"} (${args.hosts.filter((host) => host.isOnline).length} online).`;
	const routeText = args.rendererContext.routePath
		? `Current page: ${args.rendererContext.routePath}.`
		: "No page context was provided.";
	return [
		{
			type: "text",
			text: [
				"I can manage Superset Automations and Tools & Skills from here.",
				"Try asking me to list automations, pause or run a named automation, list capabilities, enable/disable a tool, create a Skill, or turn a URL into a CLI.",
				"",
				`${routeText} ${hostText}`,
			].join("\n"),
		},
		{
			type: "context_summary",
			title: "Injected control context",
			items: [
				routeText,
				hostText,
				"Permission mode: bypassPermissions.",
				"Persistent safety: version history, rollback, and scoped server-side tools.",
			],
		},
	];
}

export async function runControlChatTurn(
	input: ControlChatRunInput,
): Promise<ControlChatTurnResult> {
	await throwIfRunAborted(input);
	const hosts = await listAccessibleHosts({
		organizationId: input.organizationId,
		userId: input.userId,
	});
	await throwIfRunAborted(input);
	const modelPlan = await planToolCallsWithModel({
		message: input.message,
		organizationId: input.organizationId,
		userId: input.userId,
		rendererContext: input.rendererContext,
		hosts,
		modelProviderId: input.modelProviderId,
		modelId: input.modelId,
	});
	await throwIfRunAborted(input);
	const fallbackPlannedCalls = modelPlan?.calls.length
		? null
		: await planToolCalls({
				message: input.message,
				organizationId: input.organizationId,
				userId: input.userId,
			});
	await throwIfRunAborted(input);
	const plannedCalls = modelPlan?.calls.length
		? modelPlan.calls
		: (fallbackPlannedCalls ?? []);

	if (plannedCalls.length === 0) {
		const content = modelPlan?.assistantMessage
			? [{ type: "text" as const, text: modelPlan.assistantMessage }]
			: fallbackAssistantContent({
					hosts,
					rendererContext: input.rendererContext,
				});
		if (modelPlan?.assistantMessage) {
			return { content, status: "completed", error: null };
		}
		return { content, status: "completed", error: null };
	}

	const content: ControlChatMessageContent[] = [];
	let hasToolFailure = false;
	let firstToolError: string | null = null;
	if (modelPlan?.assistantMessage) {
		content.push({ type: "text", text: modelPlan.assistantMessage });
	}
	for (const call of plannedCalls) {
		await throwIfRunAborted(input);
		try {
			const { toolCallId, result } = await runPersistedTool({
				run: input,
				call,
			});
			content.push({
				type: "tool_summary",
				toolCallId,
				toolName: call.name,
				status: "completed",
				summary: result.summary,
			});
			await throwIfRunAborted(input);
		} catch (error) {
			if (error instanceof ControlChatRunAbortedError) {
				throw error;
			}
			hasToolFailure = true;
			if (error instanceof TRPCError) {
				firstToolError ??= error.message;
				content.push({ type: "error", text: error.message });
			} else {
				const text =
					error instanceof Error ? error.message : "Control Chat tool failed.";
				firstToolError ??= text;
				content.push({
					type: "error",
					text,
				});
			}
		}
	}

	const allToolSummaries = content.every(
		(part) => part.type === "tool_summary",
	);
	if (allToolSummaries) {
		(content as ControlChatMessageContent[]).unshift({
			type: "text",
			text: "Done. I used Superset management tools and recorded the change in this Control Chat session.",
		});
	}

	return {
		content,
		...resolveControlChatTurnStatus({ hasToolFailure, firstToolError }),
	};
}
