import { existsSync, mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { persistLocalProject } from "../../project/utils/persist-project";
import { cloneRepoInto } from "../../project/utils/resolve-repo";
import { getHostWorktreeBaseDir } from "../../settings/worktree-location";
import { projectNotSetupError } from "./project-helpers";
import { defaultWorktreesRoot } from "./worktree-paths";

export type LocalProject = typeof projects.$inferSelect;

export function findLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): LocalProject | undefined {
	return ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
}

export function requireLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): LocalProject {
	const localProject = findLocalProject(ctx, projectId);
	if (!localProject) {
		throw projectNotSetupError(projectId);
	}
	return localProject;
}

const localProjectSetupLocks = new Map<string, Promise<void>>();

async function acquireLocalProjectSetupLock(key: string): Promise<() => void> {
	const previous = localProjectSetupLocks.get(key) ?? Promise.resolve();
	let releaseCurrent!: () => void;
	const current = new Promise<void>((resolve) => {
		releaseCurrent = resolve;
	});
	const entry = previous.catch(() => {}).then(() => current);
	localProjectSetupLocks.set(key, entry);
	await previous.catch(() => {});

	let released = false;
	return () => {
		if (released) return;
		released = true;
		releaseCurrent();
		if (localProjectSetupLocks.get(key) === entry) {
			localProjectSetupLocks.delete(key);
		}
	};
}

export async function ensureLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): Promise<LocalProject> {
	const existing = findLocalProject(ctx, projectId);
	if (existing && existsSync(existing.repoPath)) return existing;

	const releaseProjectSetupLock = await acquireLocalProjectSetupLock(
		`project-setup:${projectId}`,
	);
	try {
		const afterLock = findLocalProject(ctx, projectId);
		if (afterLock && existsSync(afterLock.repoPath)) return afterLock;

		const cloudProject = await ctx.api.v2Project.get.query({
			organizationId: ctx.organizationId,
			id: projectId,
		});
		if (!cloudProject.repoCloneUrl) {
			throw projectNotSetupError(projectId);
		}

		const parentDir = getHostWorktreeBaseDir(ctx) ?? defaultWorktreesRoot();
		mkdirSync(parentDir, { recursive: true });
		const resolved = await cloneRepoInto(cloudProject.repoCloneUrl, parentDir);
		persistLocalProject(ctx, projectId, resolved);
		return requireLocalProject(ctx, projectId);
	} finally {
		releaseProjectSetupLock();
	}
}
