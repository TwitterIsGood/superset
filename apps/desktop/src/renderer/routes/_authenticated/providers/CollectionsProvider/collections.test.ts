import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent provider source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent provider source
import { join } from "node:path";

describe("v2 workspace collection create persistence", () => {
	const source = readFileSync(join(import.meta.dir, "collections.ts"), "utf8");
	const tasksBlock = source.slice(
		source.indexOf("const tasks = createPersistedElectricCollection"),
		source.indexOf("const taskStatuses = createPersistedElectricCollection"),
	);
	const v2WorkspacesBlock = source.slice(
		source.indexOf("const v2Workspaces = createPersistedElectricCollection"),
		source.indexOf("v2Workspaces.createIndex"),
	);
	const v2ProjectsBlock = source.slice(
		source.indexOf("const v2Projects = createPersistedElectricCollection"),
		source.indexOf("v2Projects.createIndex"),
	);
	const onInsertBlock = v2WorkspacesBlock.slice(
		v2WorkspacesBlock.indexOf("onInsert: async"),
		v2WorkspacesBlock.indexOf("onUpdate: async"),
	);

	test("uses the host-service create result as the write barrier", () => {
		expect(onInsertBlock).toContain("metadata.result = result");
		expect(onInsertBlock).toContain("return undefined;");
		expect(onInsertBlock).not.toContain(
			"return electricTxidMatch(result.txid);",
		);
	});

	test("tasks can upsert API-created rows through the sync channel", () => {
		expect(source).toContain("function withSyncedRowUpsert");
		expect(source).toContain("syncControls.begin({ immediate: true });");
		expect(source).toContain(
			'syncControls.write({ type: "update", value: row });',
		);
		expect(tasksBlock).toContain("withSyncedRowUpsertFor<SelectTask>()");
		expect(tasksBlock).not.toContain("onInsert:");
	});

	test("v2 project setup can hydrate synced project and workspace rows immediately", () => {
		expect(v2ProjectsBlock).toContain(
			"withSyncedRowUpsertFor<SelectV2Project>()",
		);
		expect(v2WorkspacesBlock).toContain(
			"withSyncedRowUpsertFor<SelectV2Workspace>()",
		);
	});

	test("preloads organization collections by forcing immediate sync first", () => {
		const preloadSetBlock = source.slice(
			source.indexOf("async function preloadCollectionSet"),
			source.indexOf("/**\n * Get collections for an organization"),
		);

		expect(preloadSetBlock).toContain("startSyncImmediate?.()");
		expect(preloadSetBlock).toContain("return collection.preload();");
		expect(source).toContain("type SyncableCollection");
	});

	test("preloads only the authenticated shell and active route collection sets", () => {
		const preloadCollectionsBlock = source.slice(
			source.indexOf("export async function preloadCollections"),
			source.indexOf("/**\n * Get collections for an organization"),
		);
		const routePreloadBlock = source.slice(
			source.indexOf("function resolvePreloadCollectionKeys"),
			source.indexOf("function getPreloadableCollection"),
		);

		expect(source).toContain("AUTHENTICATED_SHELL_COLLECTION_KEYS");
		expect(source).toContain("TASKS_COLLECTION_KEYS");
		expect(source).toContain("WORKSPACE_COLLECTION_KEYS");
		expect(source).toContain("AUTOMATIONS_COLLECTION_KEYS");
		expect(source).toContain("SETTINGS_COLLECTION_KEYS");
		expect(routePreloadBlock).toContain(
			'normalizedPathname.startsWith("/tasks")',
		);
		expect(routePreloadBlock).toContain(
			'normalizedPathname.startsWith("/v2-workspace")',
		);
		expect(preloadCollectionsBlock).toContain(
			"resolvePreloadCollectionKeys(profile).map",
		);
		expect(preloadCollectionsBlock).not.toContain(
			"Object.entries(collections)",
		);
		expect(preloadCollectionsBlock).not.toContain(
			'.filter(([name]) => name !== "organizations")',
		);
		expect(source).toContain("getCollectionsStatusReport");
		expect(source).toContain("getPreloadCollectionKeysForPathname");
	});

	test("recovers partial v2 workspace graph caches by clearing stale Electric resume metadata", () => {
		expect(source).toContain("getV2WorkspaceGraphHealth");
		expect(source).toContain("recoverPartialV2WorkspaceGraphCache");
		expect(source).toContain('"electric:resume"');
		expect(source).toContain("truncate: true");
		expect(source).toContain("v2Workspaces has");
		expect(source).toContain("window.__supersetCollectionsDebug");
	});
});
