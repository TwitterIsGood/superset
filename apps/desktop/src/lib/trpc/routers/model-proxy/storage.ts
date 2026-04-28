import { randomUUID } from "node:crypto";
import { modelProviderModels, modelProviders } from "@superset/local-db";
import { asc, eq, inArray } from "drizzle-orm";
import { type LocalDb, localDb } from "main/lib/local-db";
import type {
	ModelProviderModel,
	ModelProviderProtocol,
	ModelProviderSummary,
	UpsertModelProviderInput,
} from "shared/model-proxy";
import { decrypt, encrypt } from "../auth/utils/crypto-storage";

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

type ProviderDb = Pick<
	LocalDb,
	"select" | "insert" | "update" | "delete" | "transaction"
>;

const storageState: { db: ProviderDb } = { db: localDb };

export function setModelProviderStorageDbForTest(db: unknown): void {
	storageState.db = db as ProviderDb;
}

export function resetModelProviderStorageDbForTest(): void {
	storageState.db = localDb;
}

function getDb(): ProviderDb {
	return storageState.db;
}

function mapProviderRow(
	provider: typeof modelProviders.$inferSelect,
	models: ModelProviderModel[],
): StoredModelProvider {
	return {
		id: provider.id,
		name: provider.name,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		proxyUrl: provider.proxyUrl ?? undefined,
		enabled: provider.enabled,
		secretEncrypted: provider.secretEncrypted ?? undefined,
		models,
		createdAt: provider.createdAt,
		updatedAt: provider.updatedAt,
	};
}

function mapModelRow(
	model: typeof modelProviderModels.$inferSelect,
): ModelProviderModel {
	return {
		id: model.modelId,
		displayName: model.displayName ?? undefined,
		providerId: model.providerId,
		lastFetchedAt: model.lastFetchedAt ?? undefined,
	};
}

async function loadProviders(): Promise<StoredModelProvider[]> {
	const db = getDb();
	const providerRows = await db
		.select()
		.from(modelProviders)
		.orderBy(asc(modelProviders.createdAt), asc(modelProviders.id))
		.all();

	if (providerRows.length === 0) return [];

	const providerIds = providerRows.map((provider) => provider.id);
	const modelRows = await db
		.select()
		.from(modelProviderModels)
		.where(inArray(modelProviderModels.providerId, providerIds))
		.orderBy(
			asc(modelProviderModels.providerId),
			asc(modelProviderModels.position),
			asc(modelProviderModels.modelId),
		)
		.all();

	const modelsByProvider = new Map<string, ModelProviderModel[]>();
	for (const model of modelRows) {
		const models = modelsByProvider.get(model.providerId) ?? [];
		models.push(mapModelRow(model));
		modelsByProvider.set(model.providerId, models);
	}

	return providerRows.map((provider) =>
		mapProviderRow(provider, modelsByProvider.get(provider.id) ?? []),
	);
}

async function loadProvider(id: string): Promise<StoredModelProvider | null> {
	const db = getDb();
	const provider = await db
		.select()
		.from(modelProviders)
		.where(eq(modelProviders.id, id))
		.get();
	if (!provider) return null;

	const models = await db
		.select()
		.from(modelProviderModels)
		.where(eq(modelProviderModels.providerId, id))
		.orderBy(
			asc(modelProviderModels.position),
			asc(modelProviderModels.modelId),
		)
		.all();

	return mapProviderRow(provider, models.map(mapModelRow));
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
	const providers = await loadProviders();
	return providers.map(redactProvider);
}

export async function listProvidersForProxy(): Promise<
	Array<StoredModelProvider & { secret?: string }>
> {
	const providers = await loadProviders();
	return providers.map((provider) => ({
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

function modelRowsForProvider(
	providerId: string,
	models: ModelProviderModel[],
): Array<typeof modelProviderModels.$inferInsert> {
	return models.map((model, position) => ({
		providerId,
		modelId: model.id,
		displayName: model.displayName,
		lastFetchedAt: model.lastFetchedAt,
		position,
	}));
}

async function replaceModelRows(
	providerId: string,
	models: ModelProviderModel[],
	db: ProviderDb = getDb(),
): Promise<void> {
	await db
		.delete(modelProviderModels)
		.where(eq(modelProviderModels.providerId, providerId))
		.run();

	const rows = modelRowsForProvider(providerId, models);
	if (rows.length > 0) await db.insert(modelProviderModels).values(rows).run();
}

export async function upsertProvider(
	input: UpsertModelProviderInput,
): Promise<ModelProviderSummary> {
	const db = getDb();
	const now = new Date().toISOString();
	const existing = input.id ? await loadProvider(input.id) : null;
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

	const row: typeof modelProviders.$inferInsert = {
		id: provider.id,
		name: provider.name,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		proxyUrl: provider.proxyUrl,
		enabled: provider.enabled,
		secretEncrypted: provider.secretEncrypted,
		createdAt: provider.createdAt,
		updatedAt: provider.updatedAt,
	};

	await db
		.insert(modelProviders)
		.values(row)
		.onConflictDoUpdate({
			target: modelProviders.id,
			set: {
				name: row.name,
				protocol: row.protocol,
				baseUrl: row.baseUrl,
				proxyUrl: row.proxyUrl ?? null,
				enabled: row.enabled,
				secretEncrypted: row.secretEncrypted ?? null,
				updatedAt: row.updatedAt,
			},
		})
		.run();
	await replaceModelRows(provider.id, provider.models, db);

	return redactProvider(provider);
}

export async function deleteProvider(
	id: string,
): Promise<{ deleted: boolean }> {
	const db = getDb();
	const existing = await db
		.select({ id: modelProviders.id })
		.from(modelProviders)
		.where(eq(modelProviders.id, id))
		.get();
	if (!existing) return { deleted: false };

	await db
		.delete(modelProviderModels)
		.where(eq(modelProviderModels.providerId, id))
		.run();
	await db.delete(modelProviders).where(eq(modelProviders.id, id)).run();
	return { deleted: true };
}

export async function replaceProviderModels(
	providerId: string,
	models: ModelProviderModel[],
): Promise<ModelProviderSummary> {
	const db = getDb();
	const provider = await loadProvider(providerId);
	if (!provider) throw new Error(`Provider ${providerId} not found`);

	provider.models = normalizeModels(
		provider.id,
		models.map((model) => model.id),
		models,
	);
	provider.updatedAt = new Date().toISOString();

	await replaceModelRows(provider.id, provider.models, db);
	await db
		.update(modelProviders)
		.set({ updatedAt: provider.updatedAt })
		.where(eq(modelProviders.id, provider.id))
		.run();

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
