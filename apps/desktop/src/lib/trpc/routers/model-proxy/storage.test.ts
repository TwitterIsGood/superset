import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	modelProviderModels,
	modelProviders,
} from "../../../../../../../packages/local-db/src/schema/schema";

mock.module("@superset/local-db", () => ({
	modelProviderModels,
	modelProviders,
}));

mock.module("main/lib/local-db", () => ({
	localDb: {},
}));

type StorageModule = typeof import("./storage");

type TestDb = ReturnType<
	typeof drizzle<{
		modelProviders: typeof modelProviders;
		modelProviderModels: typeof modelProviderModels;
	}>
>;

const CREATE_TABLES_SQL = `
	CREATE TABLE model_providers (
		id text PRIMARY KEY NOT NULL,
		name text NOT NULL,
		protocol text NOT NULL,
		base_url text NOT NULL,
		proxy_url text,
		enabled integer NOT NULL,
		secret_encrypted text,
		created_at text NOT NULL,
		updated_at text NOT NULL
	);
	CREATE INDEX model_providers_created_at_idx ON model_providers (created_at);
	CREATE TABLE model_provider_models (
		provider_id text NOT NULL,
		model_id text NOT NULL,
		display_name text,
		last_fetched_at text,
		position integer NOT NULL,
		PRIMARY KEY (provider_id, model_id),
		FOREIGN KEY (provider_id) REFERENCES model_providers(id) ON DELETE cascade
	);
	CREATE INDEX model_provider_models_provider_id_idx ON model_provider_models (provider_id);
	CREATE INDEX model_provider_models_model_id_idx ON model_provider_models (model_id);
`;

let sqlite: Database;
let testDb: TestDb;
let storage: StorageModule;

function setupTestDb() {
	sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = OFF");
	sqlite.exec(CREATE_TABLES_SQL);
	testDb = drizzle(sqlite, {
		schema: { modelProviders, modelProviderModels },
	});
	storage.setModelProviderStorageDbForTest(testDb);
}

describe("model provider storage", () => {
	beforeEach(async () => {
		storage = await import("./storage");
		setupTestDb();
	});

	afterEach(() => {
		storage?.resetModelProviderStorageDbForTest();
		sqlite?.close();
	});

	test("redacts secrets and decrypts proxy providers", async () => {
		const provider = await storage.upsertProvider({
			name: "Local",
			protocol: "openai",
			baseUrl: "https://example.test/v1",
			enabled: true,
			secret: "secret-key",
			models: ["gpt-test"],
		});

		expect(provider.hasSecret).toBe(true);
		expect(JSON.stringify(provider)).not.toContain("secret-key");

		const listed = await storage.listStoredProviders();
		expect(listed).toHaveLength(1);
		expect(JSON.stringify(listed)).not.toContain("secret-key");
		expect(listed[0]?.hasSecret).toBe(true);

		const proxyProviders = await storage.listProvidersForProxy();
		expect(proxyProviders[0]?.secret).toBe("secret-key");
	});

	test("trims URLs and removes blank proxy values", async () => {
		const provider = await storage.upsertProvider({
			name: "Proxy Provider",
			protocol: "anthropic",
			baseUrl: "  https://example.test///  ",
			proxyUrl: "  http://127.0.0.1:7890  ",
			enabled: true,
			secret: "secret-key",
			models: ["claude-test"],
		});

		expect(provider.baseUrl).toBe("https://example.test");
		expect(provider.proxyUrl).toBe("http://127.0.0.1:7890");

		const updated = await storage.upsertProvider({
			id: provider.id,
			name: "Proxy Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			proxyUrl: "  ",
			enabled: true,
			models: ["claude-test"],
		});

		expect(updated.proxyUrl).toBeUndefined();
		expect((await storage.listStoredProviders())[0]?.proxyUrl).toBeUndefined();
	});

	test("preserves and replaces secrets on update", async () => {
		const provider = await storage.upsertProvider({
			name: "Secret Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			enabled: true,
			secret: "first-secret",
			models: ["claude-test"],
		});

		await storage.upsertProvider({
			id: provider.id,
			name: "Secret Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			enabled: true,
			models: ["claude-test"],
		});
		expect(await storage.getProviderSecret(provider.id)).toBe("first-secret");

		await storage.upsertProvider({
			id: provider.id,
			name: "Secret Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			enabled: true,
			secret: "   ",
			models: ["claude-test"],
		});
		expect(await storage.getProviderSecret(provider.id)).toBe("first-secret");

		await storage.upsertProvider({
			id: provider.id,
			name: "Secret Provider",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			enabled: true,
			secret: "second-secret",
			models: ["claude-test"],
		});
		expect(await storage.getProviderSecret(provider.id)).toBe("second-secret");
	});

	test("normalizes and orders model IDs", async () => {
		const provider = await storage.upsertProvider({
			name: "Models",
			protocol: "openai",
			baseUrl: "https://example.test",
			enabled: true,
			models: [" b ", "a", "", "b", "c"],
		});

		expect(provider.models.map((model) => model.id)).toEqual(["b", "a", "c"]);
		expect(
			provider.models.every((model) => model.providerId === provider.id),
		).toBe(true);
		expect(
			(await storage.listStoredProviders())[0]?.models.map((model) => model.id),
		).toEqual(["b", "a", "c"]);
	});

	test("lists providers in deterministic order", async () => {
		await storage.upsertProvider({
			id: "provider_b",
			name: "B",
			protocol: "openai",
			baseUrl: "https://b.test",
			enabled: true,
		});
		await storage.upsertProvider({
			id: "provider_a",
			name: "A",
			protocol: "openai",
			baseUrl: "https://a.test",
			enabled: true,
		});

		const providers = await storage.listStoredProviders();
		expect(providers.map((provider) => provider.id)).toEqual([
			"provider_a",
			"provider_b",
		]);
	});

	test("deletes providers and model rows explicitly", async () => {
		const provider = await storage.upsertProvider({
			name: "Delete Me",
			protocol: "openai",
			baseUrl: "https://example.test",
			enabled: true,
			models: ["one", "two"],
		});

		expect(await storage.deleteProvider(provider.id)).toEqual({
			deleted: true,
		});
		expect(await storage.deleteProvider(provider.id)).toEqual({
			deleted: false,
		});
		expect(await storage.listStoredProviders()).toEqual([]);

		const childCount = await testDb
			.select({ value: count() })
			.from(modelProviderModels)
			.where(eq(modelProviderModels.providerId, provider.id))
			.get();
		expect(childCount?.value).toBe(0);
	});

	test("replaces provider models", async () => {
		const provider = await storage.upsertProvider({
			name: "Replace Models",
			protocol: "anthropic",
			baseUrl: "https://example.test",
			enabled: true,
			models: ["old-a", "old-b"],
		});

		const updated = await storage.replaceProviderModels(provider.id, [
			{
				id: "new-b",
				displayName: "New B",
				providerId: provider.id,
				lastFetchedAt: "2026-04-28T00:00:00.000Z",
			},
			{ id: "new-a", providerId: provider.id },
		]);

		expect(updated.models.map((model) => model.id)).toEqual(["new-b", "new-a"]);
		expect(updated.models[0]?.displayName).toBe("New B");
		expect(
			(await storage.listStoredProviders())[0]?.models.map((model) => model.id),
		).toEqual(["new-b", "new-a"]);
	});

	test("throws when replacing models for a missing provider", () => {
		expect(storage.replaceProviderModels("missing", [])).rejects.toThrow(
			"Provider missing not found",
		);
	});
});
