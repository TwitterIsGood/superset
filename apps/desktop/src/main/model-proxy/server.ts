import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { ModelProxyStatus } from "shared/model-proxy";
import { aggregateModels, ModelRoundRobinRouter } from "lib/trpc/routers/model-proxy/aggregation";
import {
	createProviderFetchOptions,
	extractOpenAIContent,
	normalizeOpenAIMessages,
} from "lib/trpc/routers/model-proxy/service";
import { listProvidersForProxy, type StoredModelProvider } from "lib/trpc/routers/model-proxy/storage";
import {
	MODEL_PROXY_HOST,
	MODEL_PROXY_PORT,
	MODEL_PROXY_PROTOCOL_VERSION,
	type ModelProxyDaemonHealth,
} from "main/lib/model-proxy-daemon/types";

type ProviderWithSecret = StoredModelProvider & { secret?: string };

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

export class ModelProxyDaemonServer {
	private server: ReturnType<typeof createServer> | null = null;
	private lastError: string | undefined;
	private router = new ModelRoundRobinRouter();

	constructor(
		private readonly controlToken: string,
		private readonly workspaceToken: string,
		private readonly startedAt = Date.now(),
	) {}

	async start(): Promise<void> {
		if (this.server?.listening) return;
		this.server = createServer((request, response) => {
			void this.handleRequest(request, response).catch((error) => {
				this.lastError = error instanceof Error ? error.message : String(error);
				jsonResponse(response, 500, { error: { message: this.lastError } });
			});
		});
		await new Promise<void>((resolve, reject) => {
			const server = this.server;
			if (!server) {
				reject(new Error("Model proxy server was not created"));
				return;
			}
			server.once("error", reject);
			server.listen(MODEL_PROXY_PORT, MODEL_PROXY_HOST, () => resolve());
		});
	}

	async stop(): Promise<void> {
		const server = this.server;
		this.server = null;
		if (!server) return;
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}

	getBaseUrl(): string {
		return `http://${MODEL_PROXY_HOST}:${MODEL_PROXY_PORT}`;
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
			port: MODEL_PROXY_PORT,
			tokenConfigured: this.workspaceToken.length > 0,
			enabledProviderCount: providers.filter((provider) => provider.enabled).length,
			aggregatedModelCount: aggregateModels(summaries).length,
			lastError: this.lastError,
		};
	}

	private async health(): Promise<ModelProxyDaemonHealth> {
		const status = await this.status();
		return {
			ok: true,
			pid: process.pid,
			startedAt: this.startedAt,
			port: MODEL_PROXY_PORT,
			protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
			enabledProviderCount: status.enabledProviderCount,
			aggregatedModelCount: status.aggregatedModelCount,
		};
	}

	private isWorkspaceAuthorized(request: IncomingMessage): boolean {
		const auth = extractBearer(getHeaderValue(request.headers, "authorization"));
		const anthropicKey = getHeaderValue(request.headers, "x-api-key");
		return auth === this.workspaceToken || anthropicKey === this.workspaceToken;
	}

	private isControlAuthorized(request: IncomingMessage): boolean {
		const auth = extractBearer(getHeaderValue(request.headers, "authorization"));
		return auth === this.controlToken;
	}

	private async handleRequest(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const url = new URL(request.url ?? "/", this.getBaseUrl());
		if (request.method === "GET" && url.pathname === "/health") {
			if (!this.isControlAuthorized(request)) {
				jsonResponse(response, 401, { error: { message: "Unauthorized" } });
				return;
			}
			jsonResponse(response, 200, await this.health());
			return;
		}

		if (!this.isWorkspaceAuthorized(request)) {
			jsonResponse(response, 401, { error: { message: "Unauthorized" } });
			return;
		}
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
			"content-type": upstream.headers.get("content-type") ?? "application/json",
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
