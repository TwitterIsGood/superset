import { promises as fs } from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { SaveWorkspaceModelSettingsResult } from "shared/model-proxy";
import {
	mergeWorkspaceModelSettings,
	WORKSPACE_MODEL_ENV_KEYS,
} from "./workspace-settings-merge";

export { mergeWorkspaceModelSettings, WORKSPACE_MODEL_ENV_KEYS };

export function getWorkspaceRoot(workspaceId: string): string {
	const workspace = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) {
		throw new TRPCError({ code: "NOT_FOUND", message: `Workspace ${workspaceId} not found` });
	}
	if (workspace.type === "worktree" && workspace.worktreeId) {
		const worktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, workspace.worktreeId))
			.get();
		if (worktree?.path) return worktree.path;
	}
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();
	if (workspace.type === "branch" && project?.mainRepoPath) return project.mainRepoPath;
	throw new TRPCError({ code: "NOT_FOUND", message: "Workspace path not found" });
}

export async function readWorkspaceModelSettings(workspaceId: string): Promise<{
	settingsPath: string;
	exists: boolean;
	invalidJson: boolean;
	haikuModel?: string;
	sonnetModel?: string;
	opusModel?: string;
}> {
	const settingsPath = path.join(getWorkspaceRoot(workspaceId), ".claude", "settings.local.json");
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

export async function saveWorkspaceModelSettings(args: {
	workspaceId: string;
	baseUrl: string;
	token: string;
	haikuModel: string;
	sonnetModel: string;
	opusModel: string;
}): Promise<SaveWorkspaceModelSettingsResult> {
	const root = getWorkspaceRoot(args.workspaceId);
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
	const merged = mergeWorkspaceModelSettings(existingText, {
		ANTHROPIC_AUTH_TOKEN: args.token,
		ANTHROPIC_BASE_URL: args.baseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModel,
		ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModel,
		ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModel,
	});
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
