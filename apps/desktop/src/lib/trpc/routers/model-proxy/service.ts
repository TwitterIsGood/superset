import type {
	FetchProviderModelsInput,
	ModelProviderModel,
	ModelProviderProtocol,
} from "shared/model-proxy";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { listProvidersForProxy } from "./storage";

function appendPath(baseUrl: string, endpoint: string): string {
	return `${baseUrl.replace(/\/+$/, "")}${endpoint}`;
}

type FetchOptionsWithDispatcher = RequestInit & { dispatcher?: ProxyAgent };

export function createProviderFetchOptions(params: {
	proxyUrl?: string;
	init: RequestInit;
}): FetchOptionsWithDispatcher {
	const proxyUrl = params.proxyUrl?.trim();
	if (!proxyUrl) return params.init as FetchOptionsWithDispatcher;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function normalizeOpenAIMessages(body: Record<string, unknown>): Array<{
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

export function extractOpenAIContent(value: unknown): string {
	if (!isRecord(value) || !Array.isArray(value.choices)) return "";
	const first = value.choices[0];
	if (!isRecord(first) || !isRecord(first.message)) return "";
	return normalizeContent(first.message.content);
}

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
	const response = await undiciFetch(
		appendPath(params.baseUrl, "/v1/models"),
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
		}) as any,
	);
	if (!response.ok) throw new Error(`Fetch models failed: ${response.status}`);
	const parsed = (await response.json()) as unknown;
	const data = isRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : [];
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
