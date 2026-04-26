import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeWorkspaceModelSettings } from "./workspace-settings-merge";

const env = {
	ANTHROPIC_AUTH_TOKEN: "local-token",
	ANTHROPIC_BASE_URL: "http://127.0.0.1:1234",
	API_TIMEOUT_MS: "3000000",
	CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
	ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku",
	ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet",
	ANTHROPIC_DEFAULT_OPUS_MODEL: "opus",
};

describe("mergeWorkspaceModelSettings", () => {
	test("preserves unrelated top-level and env keys", () => {
		const result = mergeWorkspaceModelSettings(
			JSON.stringify({
				permissions: { allow: ["Bash(bun test)"] },
				env: { CUSTOM_FLAG: "keep", ANTHROPIC_BASE_URL: "old" },
			}),
			env,
		);
		const parsed = JSON.parse(result.text);
		expect(parsed.permissions.allow).toEqual(["Bash(bun test)"]);
		expect(parsed.env.CUSTOM_FLAG).toBe("keep");
		expect(parsed.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:1234");
		expect(result.preservedEnvKeys).toEqual(["CUSTOM_FLAG"]);
	});

	test("replaces invalid json", () => {
		const result = mergeWorkspaceModelSettings("{", env);
		expect(result.replacedInvalidJson).toBe(true);
		expect(JSON.parse(result.text).env.ANTHROPIC_AUTH_TOKEN).toBe(
			"local-token",
		);
	});

	test("replaces non-object env", () => {
		const result = mergeWorkspaceModelSettings(
			JSON.stringify({ env: "bad" }),
			env,
		);
		expect(result.replacedNonObjectEnv).toBe(true);
		expect(JSON.parse(result.text).env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe(
			"opus",
		);
	});
});

// --- Tests for getProjectWorkspaceRoots and saveProjectModelSettings ---
// These functions depend on localDb (better-sqlite3), which cannot run under
// Bun's test runner due to native ABI incompatibility. We use bun:sqlite +
// drizzle-orm/bun-sqlite to create an in-memory stand-in and mock the module.

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	projects,
	workspaces,
	worktrees,
} from "../../../../../../../packages/local-db/src/schema/schema";

const testSchema = { projects, workspaces, worktrees };

type TestDb = ReturnType<typeof drizzle<typeof testSchema>>;

const CREATE_TABLES_SQL = `
	CREATE TABLE projects (
		id text PRIMARY KEY NOT NULL,
		main_repo_path text NOT NULL,
		name text NOT NULL,
		color text NOT NULL,
		tab_order integer,
		last_opened_at integer NOT NULL,
		created_at integer NOT NULL,
		config_toast_dismissed integer,
		default_branch text,
		workspace_base_branch text,
		github_owner text,
		branch_prefix_mode text,
		branch_prefix_custom text,
		worktree_base_dir text,
		hide_image integer,
		icon_url text,
		neon_project_id text,
		default_app text
	);
	CREATE TABLE worktrees (
		id text PRIMARY KEY NOT NULL,
		project_id text NOT NULL,
		path text NOT NULL,
		branch text NOT NULL,
		base_branch text,
		created_at integer NOT NULL,
		git_status text,
		github_status text,
		created_by_superset integer NOT NULL DEFAULT 1
	);
	CREATE TABLE workspaces (
		id text PRIMARY KEY NOT NULL,
		project_id text NOT NULL,
		worktree_id text,
		type text NOT NULL,
		branch text NOT NULL,
		name text NOT NULL,
		tab_order integer NOT NULL,
		created_at integer NOT NULL,
		updated_at integer NOT NULL,
		last_opened_at integer NOT NULL,
		is_unread integer,
		is_unnamed integer,
		deleting_at integer,
		port_base integer,
		section_id text
	);
`;

let testDb: TestDb;
let tempDirs: string[];

function seedTestDb(db: TestDb, options: TestSeedOptions) {
	const {
		projectId,
		mainRepoPath,
		worktrees: wtRows,
		workspaces: wsRows,
	} = options;

	db.insert(projects)
		.values({
			id: projectId,
			mainRepoPath,
			name: "Test Project",
			color: "#000000",
			lastOpenedAt: Date.now(),
			createdAt: Date.now(),
		})
		.run();

	for (const wt of wtRows) {
		db.insert(worktrees)
			.values({
				id: wt.id,
				projectId,
				path: wt.path,
				branch: wt.branch,
				createdAt: Date.now(),
			})
			.run();
	}

	for (const ws of wsRows) {
		db.insert(workspaces)
			.values({
				id: ws.id,
				projectId,
				worktreeId: ws.worktreeId ?? null,
				type: ws.type,
				branch: ws.branch,
				name: ws.name ?? ws.id,
				tabOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastOpenedAt: Date.now(),
				deletingAt: ws.deletingAt ?? null,
			})
			.run();
	}
}

interface TestSeedOptions {
	projectId: string;
	mainRepoPath: string;
	worktrees: Array<{ id: string; path: string; branch: string }>;
	workspaces: Array<{
		id: string;
		worktreeId?: string;
		type: "worktree" | "branch";
		branch: string;
		name?: string;
		deletingAt?: number | null;
	}>;
}

function createTempDir(): string {
	return mkdtempSync(join(tmpdir(), "ws-settings-test-"));
}

function setupTestDb(): TestDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = OFF");
	sqlite.exec(CREATE_TABLES_SQL);
	return drizzle(sqlite, { schema: testSchema });
}

describe("getProjectWorkspaceRoots", () => {
	let getProjectWorkspaceRoots: (projectId: string) => string[];

	beforeEach(() => {
		testDb = setupTestDb();

		mock.module("main/lib/local-db", () => ({
			localDb: testDb,
		}));

		const mod = require("./workspace-settings");
		mod.setWorkspaceSettingsDbForTest(testDb);
		getProjectWorkspaceRoots = mod.getProjectWorkspaceRoots;

		tempDirs = [];
	});

	afterEach(() => {
		const mod = require("./workspace-settings");
		mod.resetWorkspaceSettingsDbForTest();
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		mock.restore();
	});

	test("returns correct paths for project with multiple worktree workspaces and one branch workspace", () => {
		const dir1 = createTempDir();
		const dir2 = createTempDir();
		const mainDir = createTempDir();
		tempDirs.push(dir1, dir2, mainDir);

		seedTestDb(testDb, {
			projectId: "proj-1",
			mainRepoPath: mainDir,
			worktrees: [
				{ id: "wt-1", path: dir1, branch: "feature-a" },
				{ id: "wt-2", path: dir2, branch: "feature-b" },
			],
			workspaces: [
				{
					id: "ws-1",
					worktreeId: "wt-1",
					type: "worktree",
					branch: "feature-a",
				},
				{
					id: "ws-2",
					worktreeId: "wt-2",
					type: "worktree",
					branch: "feature-b",
				},
				{ id: "ws-3", type: "branch", branch: "main" },
			],
		});

		const roots = getProjectWorkspaceRoots("proj-1");
		expect(roots.sort()).toEqual([dir1, dir2, mainDir].sort());
	});

	test("deduplicates when multiple workspaces resolve to the same path", () => {
		const mainDir = createTempDir();
		tempDirs.push(mainDir);

		seedTestDb(testDb, {
			projectId: "proj-2",
			mainRepoPath: mainDir,
			worktrees: [],
			workspaces: [
				{ id: "ws-a", type: "branch", branch: "main" },
				{ id: "ws-b", type: "branch", branch: "develop" },
			],
		});

		// Both branch workspaces resolve to the same mainRepoPath
		const roots = getProjectWorkspaceRoots("proj-2");
		expect(roots).toEqual([mainDir]);
	});

	test("excludes workspaces with deletingAt set", () => {
		const dir1 = createTempDir();
		const dir2 = createTempDir();
		tempDirs.push(dir1, dir2);

		seedTestDb(testDb, {
			projectId: "proj-3",
			mainRepoPath: dir1,
			worktrees: [
				{ id: "wt-1", path: dir1, branch: "feature-a" },
				{ id: "wt-2", path: dir2, branch: "feature-b" },
			],
			workspaces: [
				{
					id: "ws-1",
					worktreeId: "wt-1",
					type: "worktree",
					branch: "feature-a",
				},
				{
					id: "ws-2",
					worktreeId: "wt-2",
					type: "worktree",
					branch: "feature-b",
					deletingAt: Date.now(),
				},
			],
		});

		const roots = getProjectWorkspaceRoots("proj-3");
		// ws-2 is deleting, so wt-2's path should be excluded.
		// wt-1 and the main repo both resolve to dir1, so only one path.
		expect(roots).toEqual([dir1]);
	});

	test("returns empty array when no workspaces exist for project", () => {
		const roots = getProjectWorkspaceRoots("nonexistent-project");
		expect(roots).toEqual([]);
	});
});

describe("saveProjectModelSettings", () => {
	let saveProjectModelSettings: (args: {
		workspaceId: string;
		baseUrl: string;
		token: string;
		haikuModel: string;
		sonnetModel: string;
		opusModel: string;
	}) => Promise<{
		preservedEnvKeys: string[];
	}>;

	beforeEach(() => {
		testDb = setupTestDb();

		mock.module("main/lib/local-db", () => ({
			localDb: testDb,
		}));

		const mod = require("./workspace-settings");
		mod.setWorkspaceSettingsDbForTest(testDb);
		saveProjectModelSettings = mod.saveProjectModelSettings;

		tempDirs = [];
	});

	afterEach(() => {
		const mod = require("./workspace-settings");
		mod.resetWorkspaceSettingsDbForTest();
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		mock.restore();
	});

	test("writes to all workspace roots for the project", async () => {
		const dir1 = createTempDir();
		const dir2 = createTempDir();
		tempDirs.push(dir1, dir2);

		seedTestDb(testDb, {
			projectId: "proj-save",
			mainRepoPath: dir1,
			worktrees: [{ id: "wt-save", path: dir2, branch: "feature" }],
			workspaces: [
				{ id: "ws-save-1", type: "branch", branch: "main" },
				{
					id: "ws-save-2",
					worktreeId: "wt-save",
					type: "worktree",
					branch: "feature",
				},
			],
		});

		await saveProjectModelSettings({
			workspaceId: "ws-save-1",
			baseUrl: "http://localhost:9999",
			token: "test-token",
			haikuModel: "model-haiku",
			sonnetModel: "model-sonnet",
			opusModel: "model-opus",
		});

		// Verify both roots got the settings file
		const { readFileSync } = await import("node:fs");
		const file1 = JSON.parse(
			readFileSync(join(dir1, ".claude", "settings.local.json"), "utf8"),
		);
		const file2 = JSON.parse(
			readFileSync(join(dir2, ".claude", "settings.local.json"), "utf8"),
		);

		expect(file1.env.ANTHROPIC_AUTH_TOKEN).toBe("test-token");
		expect(file1.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("model-haiku");
		expect(file2.env.ANTHROPIC_AUTH_TOKEN).toBe("test-token");
		expect(file2.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("model-sonnet");
	});

	test("preserves existing non-model env keys in all workspace roots", async () => {
		const dir1 = createTempDir();
		const dir2 = createTempDir();
		tempDirs.push(dir1, dir2);

		// Pre-seed dir1 with a settings file that has a custom env key
		mkdirSync(join(dir1, ".claude"), { recursive: true });
		writeFileSync(
			join(dir1, ".claude", "settings.local.json"),
			JSON.stringify({
				env: { CUSTOM_FLAG: "preserve-me", ANTHROPIC_AUTH_TOKEN: "old" },
			}),
		);

		seedTestDb(testDb, {
			projectId: "proj-preserve",
			mainRepoPath: dir1,
			worktrees: [{ id: "wt-preserve", path: dir2, branch: "feature" }],
			workspaces: [
				{ id: "ws-preserve-1", type: "branch", branch: "main" },
				{
					id: "ws-preserve-2",
					worktreeId: "wt-preserve",
					type: "worktree",
					branch: "feature",
				},
			],
		});

		await saveProjectModelSettings({
			workspaceId: "ws-preserve-2",
			baseUrl: "http://localhost:9999",
			token: "new-token",
			haikuModel: "h",
			sonnetModel: "s",
			opusModel: "o",
		});

		// Verify the custom key was preserved on disk in dir1
		// (the returned diagnostics come from the last root written, dir2)
		const { readFileSync } = await import("node:fs");
		const file1 = JSON.parse(
			readFileSync(join(dir1, ".claude", "settings.local.json"), "utf8"),
		);
		expect(file1.env.CUSTOM_FLAG).toBe("preserve-me");
		expect(file1.env.ANTHROPIC_AUTH_TOKEN).toBe("new-token");
	});

	test("throws NOT_FOUND when workspace does not exist", async () => {
		try {
			await saveProjectModelSettings({
				workspaceId: "nonexistent",
				baseUrl: "http://localhost:9999",
				token: "tok",
				haikuModel: "h",
				sonnetModel: "s",
				opusModel: "o",
			});
			expect.unreachable("Should have thrown");
		} catch (error: unknown) {
			expect((error as { code: string }).code).toBe("NOT_FOUND");
		}
	});
});
