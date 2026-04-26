import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import type {
	ModelProviderModel,
	ModelProviderProtocol,
	ModelProviderSummary,
	UpsertModelProviderInput,
} from "shared/model-proxy";
import { decrypt, encrypt } from "../auth/utils/crypto-storage";

const STORAGE_DIR = path.join(SUPERSET_HOME_DIR, "model-proxy");
export const MODEL_PROVIDERS_STORAGE_PATH = path.join(
	STORAGE_DIR,
	"providers.json",
);

export type StoredModelProvider = {
	id: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	proxyUrl?: string;
	enabled: boolean;
	secretEncrypted?: string;
	models: ModelProviderModel[];
	createdAt: string;
	updatedAt: string;
};

type StorageData = {
	providers: StoredModelProvider[];
};

async function ensureStorageDir(): Promise<void> {
	ensureSupersetHomeDirExists();
	await fs.mkdir(STORAGE_DIR, {
		recursive: true,
		mode: SUPERSET_HOME_DIR_MODE,
	});
	await fs.chmod(STORAGE_DIR, SUPERSET_HOME_DIR_MODE).catch(() => {});
}

function emptyData(): StorageData {
	return { providers: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredModel(
	value: unknown,
	providerId: string,
): ModelProviderModel | null {
	if (!isRecord(value) || typeof value.id !== "string") return null;
	return {
		id: value.id,
		displayName:
			typeof value.displayName === "string" ? value.displayName : undefined,
		providerId,
		lastFetchedAt:
			typeof value.lastFetchedAt === "string" ? value.lastFetchedAt : undefined,
	};
}

function parseStoredProvider(value: unknown): StoredModelProvider | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.name !== "string" ||
		typeof value.baseUrl !== "string" ||
		(value.protocol !== "anthropic" && value.protocol !== "openai") ||
		typeof value.enabled !== "boolean" ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string"
	) {
		return null;
	}
	return {
		id: value.id,
		name: value.name,
		protocol: value.protocol,
		baseUrl: value.baseUrl,
		proxyUrl: typeof value.proxyUrl === "string" ? value.proxyUrl : undefined,
		enabled: value.enabled,
		secretEncrypted:
			typeof value.secretEncrypted === "string"
				? value.secretEncrypted
				: undefined,
		models: Array.isArray(value.models)
			? value.models
					.map((model) => parseStoredModel(model, value.id as string))
					.filter((model): model is ModelProviderModel => model !== null)
			: [],
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
	};
}

async function readData(): Promise<StorageData> {
	await ensureStorageDir();
	try {
		const text = await fs.readFile(MODEL_PROVIDERS_STORAGE_PATH, "utf8");
		const parsed = JSON.parse(text) as unknown;
		if (!isRecord(parsed) || !Array.isArray(parsed.providers)) {
			return emptyData();
		}
		return {
			providers: parsed.providers
				.map(parseStoredProvider)
				.filter(
					(provider): provider is StoredModelProvider => provider !== null,
				),
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
		throw error;
	}
}

async function writeData(data: StorageData): Promise<void> {
	await ensureStorageDir();
	const tmpPath = `${MODEL_PROVIDERS_STORAGE_PATH}.${process.pid}.${Date.now()}.tmp`;
	await fs.writeFile(tmpPath, `${JSON.stringify(data, null, "\t")}\n`, {
		mode: SUPERSET_SENSITIVE_FILE_MODE,
	});
	await fs.chmod(tmpPath, SUPERSET_SENSITIVE_FILE_MODE);
	await fs.rename(tmpPath, MODEL_PROVIDERS_STORAGE_PATH);
	await fs.chmod(MODEL_PROVIDERS_STORAGE_PATH, SUPERSET_SENSITIVE_FILE_MODE);
}

export function redactProvider(
	provider: StoredModelProvider,
): ModelProviderSummary {
	return {
		id: provider.id,
		name: provider.name,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		proxyUrl: provider.proxyUrl,
		enabled: provider.enabled,
		hasSecret: !!provider.secretEncrypted,
		models: provider.models,
		createdAt: provider.createdAt,
		updatedAt: provider.updatedAt,
	};
}

export async function listStoredProviders(): Promise<ModelProviderSummary[]> {
	const data = await readData();
	return data.providers.map(redactProvider);
}

export async function listProvidersForProxy(): Promise<
	Array<StoredModelProvider & { secret?: string }>
> {
	const data = await readData();
	return data.providers.map((provider) => ({
		...provider,
		secret: provider.secretEncrypted
			? decrypt(Buffer.from(provider.secretEncrypted, "base64"))
			: undefined,
	}));
}

function normalizeModels(
	providerId: string,
	modelIds: string[] | undefined,
	existingModels: ModelProviderModel[] = [],
): ModelProviderModel[] {
	const existingById = new Map(
		existingModels.map((model) => [model.id, model]),
	);
	const seen = new Set<string>();
	return (modelIds ?? existingModels.map((model) => model.id))
		.map((modelId) => modelId.trim())
		.filter((modelId) => {
			if (!modelId || seen.has(modelId)) return false;
			seen.add(modelId);
			return true;
		})
		.map((modelId) => ({
			...existingById.get(modelId),
			id: modelId,
			providerId,
		}));
}

export async function upsertProvider(
	input: UpsertModelProviderInput,
): Promise<ModelProviderSummary> {
	const data = await readData();
	const now = new Date().toISOString();
	const existingIndex = input.id
		? data.providers.findIndex((provider) => provider.id === input.id)
		: -1;
	const existing = existingIndex >= 0 ? data.providers[existingIndex] : null;
	const id = existing?.id ?? input.id ?? `provider_${randomUUID()}`;
	const proxyUrl = input.proxyUrl?.trim() || undefined;
	const provider: StoredModelProvider = {
		id,
		name: input.name.trim(),
		protocol: input.protocol,
		baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
		proxyUrl,
		enabled: input.enabled,
		secretEncrypted:
			input.secret !== undefined && input.secret.trim().length > 0
				? encrypt(input.secret.trim()).toString("base64")
				: existing?.secretEncrypted,
		models: normalizeModels(id, input.models, existing?.models),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};
	if (existingIndex >= 0) {
		data.providers[existingIndex] = provider;
	} else {
		data.providers.push(provider);
	}
	await writeData(data);
	return redactProvider(provider);
}

export async function deleteProvider(
	id: string,
): Promise<{ deleted: boolean }> {
	const data = await readData();
	const nextProviders = data.providers.filter((provider) => provider.id !== id);
	const deleted = nextProviders.length !== data.providers.length;
	if (deleted) await writeData({ providers: nextProviders });
	return { deleted };
}

export async function replaceProviderModels(
	providerId: string,
	models: ModelProviderModel[],
): Promise<ModelProviderSummary> {
	const data = await readData();
	const provider = data.providers.find((item) => item.id === providerId);
	if (!provider) throw new Error(`Provider ${providerId} not found`);
	provider.models = normalizeModels(
		provider.id,
		models.map((model) => model.id),
		models,
	);
	provider.updatedAt = new Date().toISOString();
	await writeData(data);
	return redactProvider(provider);
}

export async function getProviderSecret(
	providerId: string,
): Promise<string | null> {
	const providers = await listProvidersForProxy();
	return (
		providers.find((provider) => provider.id === providerId)?.secret ?? null
	);
}
