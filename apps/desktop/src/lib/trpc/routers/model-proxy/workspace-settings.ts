import { promises as fs } from "node:fs";
import path from "node:path";
import { projects, workspaces, worktrees } from "@superset/local-db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { SaveWorkspaceModelSettingsResult } from "shared/model-proxy";
import {
	mergeWorkspaceModelSettings,
	WORKSPACE_MODEL_ENV_KEYS,
} from "./workspace-settings-merge";

type LocalDb = typeof localDb;

export { mergeWorkspaceModelSettings, WORKSPACE_MODEL_ENV_KEYS };

const workspaceSettingsState: { db: LocalDb } = { db: localDb };

export function setWorkspaceSettingsDbForTest(db: LocalDb): void {
	workspaceSettingsState.db = db;
}

export function resetWorkspaceSettingsDbForTest(): void {
	workspaceSettingsState.db = localDb;
}

export function getWorkspaceRoot(workspaceId: string): string {
	const db = workspaceSettingsState.db;
	const workspace = db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${workspaceId} not found`,
		});
	}
	if (workspace.type === "worktree" && workspace.worktreeId) {
		const worktree = db
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, workspace.worktreeId))
			.get();
		if (worktree?.path) return worktree.path;
	}
	const project = db
		.select()
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();
	if (workspace.type === "branch" && project?.mainRepoPath)
		return project.mainRepoPath;
	throw new TRPCError({
		code: "NOT_FOUND",
		message: "Workspace path not found",
	});
}

export async function readWorkspaceModelSettings(workspaceId: string): Promise<{
	settingsPath: string;
	exists: boolean;
	invalidJson: boolean;
	haikuModel?: string;
	sonnetModel?: string;
	opusModel?: string;
}> {
	const settingsPath = path.join(
		getWorkspaceRoot(workspaceId),
		".claude",
		"settings.local.json",
	);
	try {
		const text = await fs.readFile(settingsPath, "utf8");
		const merged = mergeWorkspaceModelSettings(text, {
			ANTHROPIC_AUTH_TOKEN: "",
			ANTHROPIC_BASE_URL: "",
			API_TIMEOUT_MS: "3000000",
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
			ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "",
			ANTHROPIC_DEFAULT_OPUS_MODEL: "",
		});
		return {
			settingsPath,
			exists: true,
			invalidJson: merged.replacedInvalidJson,
			...merged.currentModels,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return { settingsPath, exists: false, invalidJson: false };
	}
}

export function getProjectWorkspaceRoots(projectId: string): string[] {
	const db = workspaceSettingsState.db;
	const rows = db
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.deletingAt)),
		)
		.all();

	const paths = new Set<string>();
	for (const ws of rows) {
		if (ws.type === "worktree" && ws.worktreeId) {
			const wt = db
				.select()
				.from(worktrees)
				.where(eq(worktrees.id, ws.worktreeId))
				.get();
			if (wt?.path) paths.add(wt.path);
		} else {
			const proj = db
				.select()
				.from(projects)
				.where(eq(projects.id, projectId))
				.get();
			if (proj?.mainRepoPath) paths.add(proj.mainRepoPath);
		}
	}
	return [...paths];
}

async function writeModelSettingsToRoot(
	root: string,
	env: Record<(typeof WORKSPACE_MODEL_ENV_KEYS)[number], string>,
): Promise<SaveWorkspaceModelSettingsResult> {
	const claudeDir = path.join(root, ".claude");
	const settingsPath = path.join(claudeDir, "settings.local.json");
	let createdClaudeDirectory = false;
	try {
		await fs.mkdir(claudeDir, { recursive: false });
		createdClaudeDirectory = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	let existingText: string | null = null;
	let createdSettingsFile = false;
	try {
		existingText = await fs.readFile(settingsPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		createdSettingsFile = true;
	}
	const merged = mergeWorkspaceModelSettings(existingText, env);
	await fs.writeFile(settingsPath, merged.text, "utf8");
	return {
		settingsPath,
		createdClaudeDirectory,
		createdSettingsFile,
		replacedInvalidJson: merged.replacedInvalidJson,
		replacedNonObjectEnv: merged.replacedNonObjectEnv,
		preservedEnvKeys: merged.preservedEnvKeys,
		writtenEnvKeys: [...WORKSPACE_MODEL_ENV_KEYS],
	};
}

export async function saveWorkspaceModelSettings(args: {
	workspaceId: string;
	baseUrl: string;
	token: string;
	haikuModel: string;
	sonnetModel: string;
	opusModel: string;
}): Promise<SaveWorkspaceModelSettingsResult> {
	const root = getWorkspaceRoot(args.workspaceId);
	return writeModelSettingsToRoot(root, {
		ANTHROPIC_AUTH_TOKEN: args.token,
		ANTHROPIC_BASE_URL: args.baseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModel,
		ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModel,
		ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModel,
	});
}

export async function saveProjectModelSettings(args: {
	workspaceId: string;
	baseUrl: string;
	token: string;
	haikuModel: string;
	sonnetModel: string;
	opusModel: string;
}): Promise<SaveWorkspaceModelSettingsResult> {
	const db = workspaceSettingsState.db;
	const workspace = db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, args.workspaceId))
		.get();
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${args.workspaceId} not found`,
		});
	}

	const roots = getProjectWorkspaceRoots(workspace.projectId);
	if (roots.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No workspace paths found for project",
		});
	}

	const env = {
		ANTHROPIC_AUTH_TOKEN: args.token,
		ANTHROPIC_BASE_URL: args.baseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModel,
		ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModel,
		ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModel,
	};

	let lastResult: SaveWorkspaceModelSettingsResult | undefined;
	for (const root of roots) {
		lastResult = await writeModelSettingsToRoot(root, env);
	}
	if (!lastResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No workspace paths found for project",
		});
	}
	return lastResult;
}
