import { execSync } from "node:child_process";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type {
	FetchProviderModelsInput,
	ModelProviderModel,
	ModelProviderProtocol,
	ModelProxyStatus,
} from "shared/model-proxy";
import { ProxyAgent } from "undici";
import { aggregateModels, ModelRoundRobinRouter } from "./aggregation";
import { listProvidersForProxy, type StoredModelProvider } from "./storage";

type ProviderWithSecret = StoredModelProvider & { secret?: string };

const HOST = "127.0.0.1";
const PROXY_PORT = 39127;
const LOCAL_PROXY_API_KEY = "superset-local-model-proxy";

function jsonResponse(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});
}

function appendPath(baseUrl: string, endpoint: string): string {
	return `${baseUrl.replace(/\/+$/, "")}${endpoint}`;
}

type FetchOptionsWithDispatcher = RequestInit & { dispatcher?: unknown };

export function createProviderFetchOptions(params: {
	proxyUrl?: string;
	init: RequestInit;
}): FetchOptionsWithDispatcher {
	const proxyUrl = params.proxyUrl?.trim();
	if (!proxyUrl) return params.init;
	let parsed: URL;
	try {
		parsed = new URL(proxyUrl);
	} catch (error) {
		throw new Error(
			`Invalid proxy URL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("Unsupported proxy URL scheme. Use http:// or https://.");
	}
	return {
		...params.init,
		dispatcher: new ProxyAgent(parsed.href),
	};
}

function getHeaderValue(
	headers: IncomingMessage["headers"],
	name: string,
): string {
	const value = headers[name.toLowerCase()];
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function extractBearer(value: string): string {
	return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function killPortHolder(port: number): void {
	try {
		const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		})
			.split("\n")
			.map((pid) => Number.parseInt(pid.trim(), 10))
			.filter(Number.isFinite);
		for (const pid of pids) {
			process.kill(pid, "SIGKILL");
		}
	} catch {
		// lsof returns non-zero if nothing found — port is free
	}
}

export class ModelProxyService {
	private server: ReturnType<typeof createServer> | null = null;
	private port: number | null = null;
	private token = LOCAL_PROXY_API_KEY;
	private lastError: string | undefined;
	private router = new ModelRoundRobinRouter();

	async start(): Promise<ModelProxyStatus> {
		if (this.server?.listening && this.port) return this.status();
		killPortHolder(PROXY_PORT);
		this.server = createServer((request, response) => {
			void this.handleRequest(request, response).catch((error) => {
				this.lastError = error instanceof Error ? error.message : String(error);
				jsonResponse(response, 500, { error: { message: this.lastError } });
			});
		});
		await new Promise<void>((resolve, reject) => {
			this.server?.once("error", reject);
			this.server?.listen(PROXY_PORT, HOST, () => resolve());
		});
		this.port = PROXY_PORT;
		return this.status();
	}

	async restart(): Promise<ModelProxyStatus> {
		await this.stop();
		return this.start();
	}

	async stop(): Promise<void> {
		const server = this.server;
		this.server = null;
		this.port = null;
		if (!server) return;
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}

	getToken(): string {
		return this.token;
	}

	getBaseUrl(): string | null {
		return this.port ? `http://${HOST}:${this.port}` : null;
	}

	async status(): Promise<ModelProxyStatus> {
		const providers = await listProvidersForProxy();
		const summaries = providers.map((provider) => ({
			...provider,
			hasSecret: !!provider.secret,
		}));
		return {
			running: !!this.server?.listening,
			baseUrl: this.getBaseUrl(),
			port: this.port,
			tokenConfigured: this.token.length > 0,
			enabledProviderCount: providers.filter((provider) => provider.enabled)
				.length,
			aggregatedModelCount: aggregateModels(summaries).length,
			lastError: this.lastError,
		};
	}

	private isAuthorized(request: IncomingMessage): boolean {
		const auth = extractBearer(
			getHeaderValue(request.headers, "authorization"),
		);
		const anthropicKey = getHeaderValue(request.headers, "x-api-key");
		return auth === this.token || anthropicKey === this.token;
	}

	private async handleRequest(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		if (!this.isAuthorized(request)) {
			jsonResponse(response, 401, { error: { message: "Unauthorized" } });
			return;
		}
		const url = new URL(
			request.url ?? "/",
			this.getBaseUrl() ?? `http://${HOST}`,
		);
		if (request.method === "GET" && url.pathname === "/v1/models") {
			const providers = (await listProvidersForProxy()).map((provider) => ({
				...provider,
				hasSecret: !!provider.secret,
			}));
			jsonResponse(response, 200, {
				data: aggregateModels(providers).map((model) => ({
					id: model.id,
					type: "model",
					display_name: model.displayName ?? model.id,
				})),
			});
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/messages") {
			await this.handleMessages(request, response);
			return;
		}
		jsonResponse(response, 404, { error: { message: "Not found" } });
	}

	private async handleMessages(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const bodyText = await readBody(request);
		const body = JSON.parse(bodyText) as unknown;
		if (!isRecord(body) || typeof body.model !== "string") {
			jsonResponse(response, 400, { error: { message: "Missing model" } });
			return;
		}
		const providers = await listProvidersForProxy();
		const providerId = this.router.routeForModel(providers, body.model);
		const provider = providers.find((item) => item.id === providerId);
		if (!provider || !provider.secret) {
			jsonResponse(response, 404, {
				error: { message: `No enabled provider for model ${body.model}` },
			});
			return;
		}
		if (provider.protocol === "anthropic") {
			await this.forwardAnthropic(provider, bodyText, response);
			return;
		}
		await this.forwardOpenAI(provider, body, response);
	}

	private async forwardAnthropic(
		provider: ProviderWithSecret,
		bodyText: string,
		response: ServerResponse,
	): Promise<void> {
		if (!provider.secret) throw new Error("Provider API key is required");
		const upstream = await fetch(
			appendPath(provider.baseUrl, "/v1/messages"),
			createProviderFetchOptions({
				proxyUrl: provider.proxyUrl,
				init: {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-api-key": provider.secret,
						"anthropic-version": "2023-06-01",
					},
					body: bodyText,
				},
			}),
		);
		response.writeHead(upstream.status, {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		});
		response.end(await upstream.text());
	}

	private async forwardOpenAI(
		provider: ProviderWithSecret,
		anthropicBody: Record<string, unknown>,
		response: ServerResponse,
	): Promise<void> {
		if (!provider.secret) throw new Error("Provider API key is required");
		const openAiBody = {
			model: anthropicBody.model,
			messages: normalizeOpenAIMessages(anthropicBody),
			max_tokens: anthropicBody.max_tokens,
			temperature: anthropicBody.temperature,
			top_p: anthropicBody.top_p,
			stop: anthropicBody.stop_sequences,
			stream: false,
		};
		const upstream = await fetch(
			appendPath(provider.baseUrl, "/v1/chat/completions"),
			createProviderFetchOptions({
				proxyUrl: provider.proxyUrl,
				init: {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${provider.secret}`,
					},
					body: JSON.stringify(openAiBody),
				},
			}),
		);
		const text = await upstream.text();
		if (!upstream.ok) {
			response.writeHead(upstream.status, {
				"content-type": "application/json",
			});
			response.end(text);
			return;
		}
		const parsed = JSON.parse(text) as unknown;
		const content = extractOpenAIContent(parsed);
		jsonResponse(response, 200, {
			id:
				isRecord(parsed) && typeof parsed.id === "string"
					? parsed.id
					: "msg_proxy",
			type: "message",
			role: "assistant",
			model: anthropicBody.model,
			content: [{ type: "text", text: content }],
			stop_reason: "end_turn",
			stop_sequence: null,
			usage: { input_tokens: 0, output_tokens: 0 },
		});
	}
}

function normalizeContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (isRecord(item) && typeof item.text === "string") return item.text;
				return "";
			})
			.join("\n");
	}
	return "";
}

function normalizeOpenAIMessages(body: Record<string, unknown>): Array<{
	role: string;
	content: string;
}> {
	const messages: Array<{ role: string; content: string }> = [];
	if (typeof body.system === "string") {
		messages.push({ role: "system", content: body.system });
	}
	if (Array.isArray(body.messages)) {
		for (const message of body.messages) {
			if (!isRecord(message) || typeof message.role !== "string") continue;
			messages.push({
				role: message.role === "assistant" ? "assistant" : "user",
				content: normalizeContent(message.content),
			});
		}
	}
	return messages;
}

function extractOpenAIContent(value: unknown): string {
	if (!isRecord(value) || !Array.isArray(value.choices)) return "";
	const first = value.choices[0];
	if (!isRecord(first) || !isRecord(first.message)) return "";
	return normalizeContent(first.message.content);
}

export const modelProxyService = new ModelProxyService();

export async function fetchProviderModels(
	providerId: string,
): Promise<ModelProviderModel[]> {
	const provider = (await listProvidersForProxy()).find(
		(item) => item.id === providerId,
	);
	if (!provider) throw new Error(`Provider ${providerId} not found`);
	if (!provider.secret) throw new Error("Provider API key is required");
	return fetchProviderModelsFromConnection({
		providerId: provider.id,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		proxyUrl: provider.proxyUrl,
		secret: provider.secret,
	});
}

async function fetchProviderModelsFromConnection(params: {
	providerId: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	proxyUrl?: string;
	secret: string;
}): Promise<ModelProviderModel[]> {
	const endpoint = params.protocol === "openai" ? "/v1/models" : "/v1/models";
	const response = await fetch(
		appendPath(params.baseUrl, endpoint),
		createProviderFetchOptions({
			proxyUrl: params.proxyUrl,
			init: {
				headers:
					params.protocol === "openai"
						? { authorization: `Bearer ${params.secret}` }
						: {
								"x-api-key": params.secret,
								"anthropic-version": "2023-06-01",
							},
			},
		}),
	);
	if (!response.ok) throw new Error(`Fetch models failed: ${response.status}`);
	const parsed = (await response.json()) as unknown;
	const data =
		isRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : [];
	const now = new Date().toISOString();
	return data
		.map((item): string | null => {
			if (typeof item === "string") return item;
			if (isRecord(item) && typeof item.id === "string") return item.id;
			return null;
		})
		.filter((id): id is string => !!id)
		.map((id) => ({ id, providerId: params.providerId, lastFetchedAt: now }));
}

/**
 * Resolve the connection details for a draft fetch.
 * If the draft secret is blank and an id is provided, fall back to the saved provider's secret.
 * Returns the connection params or throws if no usable secret is available.
 */
export function resolveDraftProviderConnection(
	input: FetchProviderModelsInput,
	savedProviders: Array<{ id: string; secret?: string }>,
): {
	providerId: string;
	protocol: FetchProviderModelsInput["protocol"];
	baseUrl: string;
	proxyUrl?: string;
	secret: string;
} {
	const baseUrl = input.baseUrl.trim();
	const proxyUrl = input.proxyUrl?.trim() || undefined;
	const secret = input.secret?.trim();

	if (!baseUrl) throw new Error("Base URL is required");

	if (secret) {
		return {
			providerId: input.id ?? "draft",
			protocol: input.protocol,
			baseUrl,
			proxyUrl,
			secret,
		};
	}

	if (input.id) {
		const saved = savedProviders.find((p) => p.id === input.id);
		if (saved?.secret) {
			return {
				providerId: input.id,
				protocol: input.protocol,
				baseUrl,
				proxyUrl,
				secret: saved.secret,
			};
		}
	}

	throw new Error("Provider API key is required");
}

export async function fetchProviderModelsFromDraft(
	input: FetchProviderModelsInput,
): Promise<ModelProviderModel[]> {
	const providers = await listProvidersForProxy();
	const connection = resolveDraftProviderConnection(input, providers);
	return fetchProviderModelsFromConnection(connection);
}

export async function testProvider(
	providerId: string,
): Promise<{ ok: boolean; message: string }> {
	const models = await fetchProviderModels(providerId);
	return { ok: true, message: `Fetched ${models.length} models` };
}
