#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getHostId, getHostName } from "../packages/shared/src/host-info";
import { assertSafeDatabaseUrl } from "./e2e-workspace-fixture";

const DEV_EMAIL = "admin@local.test";
const DEFAULT_SLUG = "desktop-perf";
const DEFAULT_REPO_URL = "https://github.com/superset-sh/superset.git";

export interface ParsedDesktopPerfFixtureCommand {
	command: "seed" | "cleanup" | "stats" | "ensure" | "help";
	options: Record<string, string | boolean>;
}

function loadRootEnv(): void {
	const envPath = resolve(process.cwd(), ".env");
	if (!existsSync(envPath)) return;

	for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const equalsIndex = line.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] ??= value
			.replaceAll("\\n", "\n")
			.replaceAll('\\"', '"')
			.replaceAll("\\$", "$")
			.replaceAll("\\\\", "\\");
	}
}

loadRootEnv();

export function parseDesktopPerfFixtureArgs(
	args: string[],
): ParsedDesktopPerfFixtureCommand {
	const [command = "help", ...rest] = args;
	if (command === "help" || command === "-h" || command === "--help") {
		return { command: "help", options: {} };
	}
	if (
		command !== "seed" &&
		command !== "cleanup" &&
		command !== "stats" &&
		command !== "ensure"
	) {
		throw new Error(`unknown command: ${command}`);
	}

	const options: Record<string, string | boolean> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token?.startsWith("--")) {
			throw new Error(`unexpected argument: ${token ?? ""}`);
		}
		const key = token.slice(2);
		if (key === "allow-remote") {
			options[key] = true;
			continue;
		}
		const value = rest[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`missing value for --${key}`);
		}
		options[key] = value;
		index += 1;
	}

	return { command, options };
}

function stringOption(
	options: Record<string, string | boolean>,
	key: string,
): string | undefined {
	const value = options[key];
	return typeof value === "string" ? value : undefined;
}

function positiveIntegerOption(
	options: Record<string, string | boolean>,
	key: string,
	defaultValue: number,
): number {
	const raw = stringOption(options, key);
	if (raw === undefined) return defaultValue;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value < 1) {
		throw new Error(`--${key} must be a positive integer`);
	}
	return value;
}

function nonNegativeIntegerOption(
	options: Record<string, string | boolean>,
	key: string,
	defaultValue: number,
): number {
	const raw = stringOption(options, key);
	if (raw === undefined) return defaultValue;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`--${key} must be 0 or greater`);
	}
	return value;
}

async function getDbDeps() {
	const [{ db }, schema, drizzle] = await Promise.all([
		import("../packages/db/src/client"),
		import("../packages/db/src/schema/index"),
		import("../packages/db/node_modules/drizzle-orm"),
	]);
	return {
		db,
		and: drizzle.and,
		desc: drizzle.desc,
		eq: drizzle.eq,
		inArray: drizzle.inArray,
		like: drizzle.like,
		members: schema.members,
		taskStatuses: schema.taskStatuses,
		tasks: schema.tasks,
		users: schema.users,
		v2Hosts: schema.v2Hosts,
		v2Projects: schema.v2Projects,
		v2UsersHosts: schema.v2UsersHosts,
		v2Workspaces: schema.v2Workspaces,
	};
}

async function resolveOrganizationId(email: string) {
	const { db, eq, members, users } = await getDbDeps();
	const [row] = await db
		.select({
			userId: users.id,
			organizationId: members.organizationId,
		})
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(users.email, email))
		.limit(1);

	if (!row) {
		throw new Error(
			`No organization found for ${email}. Run bun run db:seed-dev first.`,
		);
	}

	return row;
}

async function resolveFixtureHost(args: {
	organizationId: string;
	userId: string;
	slug: string;
}) {
	const { and, db, eq, v2Hosts, v2UsersHosts } = await getDbDeps();
	const machineId = `${args.slug}-fixture-host`;
	const [existing] = await db
		.select({
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2Hosts.organizationId, args.organizationId),
				eq(v2UsersHosts.userId, args.userId),
				eq(v2Hosts.machineId, machineId),
			),
		)
		.limit(1);

	if (existing) return existing;

	const now = new Date();
	await db
		.insert(v2Hosts)
		.values({
			organizationId: args.organizationId,
			machineId,
			name: "Desktop perf fixture host",
			isOnline: false,
			createdByUserId: args.userId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [v2Hosts.organizationId, v2Hosts.machineId],
			set: {
				name: "Desktop perf fixture host",
				updatedAt: now,
			},
		});
	await db
		.insert(v2UsersHosts)
		.values({
			organizationId: args.organizationId,
			userId: args.userId,
			hostId: machineId,
			role: "owner",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				v2UsersHosts.organizationId,
				v2UsersHosts.userId,
				v2UsersHosts.hostId,
			],
			set: { role: "owner", updatedAt: now },
		});

	return { machineId, name: "Desktop perf fixture host" };
}

async function resolveLocalHost(args: {
	organizationId: string;
	userId: string;
}) {
	const { and, db, eq, v2Hosts, v2UsersHosts } = await getDbDeps();
	const machineId = getHostId();
	const name = getHostName();
	const now = new Date();
	await db
		.insert(v2Hosts)
		.values({
			organizationId: args.organizationId,
			machineId,
			name,
			isOnline: true,
			createdByUserId: args.userId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [v2Hosts.organizationId, v2Hosts.machineId],
			set: {
				name,
				isOnline: true,
				updatedAt: now,
			},
		});
	await db
		.insert(v2UsersHosts)
		.values({
			organizationId: args.organizationId,
			userId: args.userId,
			hostId: machineId,
			role: "owner",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				v2UsersHosts.organizationId,
				v2UsersHosts.userId,
				v2UsersHosts.hostId,
			],
			set: { role: "owner", updatedAt: now },
		});

	const [existing] = await db
		.select({
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2Hosts.organizationId, args.organizationId),
				eq(v2UsersHosts.userId, args.userId),
				eq(v2Hosts.machineId, machineId),
			),
		)
		.limit(1);

	return existing ?? { machineId, name };
}

function getCurrentGitBranch(): string {
	try {
		const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: process.cwd(),
			encoding: "utf8",
			timeout: 5_000,
		}).trim();
		return branch && branch !== "HEAD" ? branch : "main";
	} catch {
		return "main";
	}
}

function getHostDbPath(organizationId: string): string {
	const homeDir = process.env.SUPERSET_HOME_DIR
		? resolve(process.env.SUPERSET_HOME_DIR)
		: resolve(process.cwd(), "superset-dev-data");
	return resolve(homeDir, "host", organizationId, "host.db");
}

function cleanupLocalHostFixture(args: {
	organizationId: string;
	projectIds: string[];
}): void {
	if (args.projectIds.length === 0) return;
	const dbPath = getHostDbPath(args.organizationId);
	if (!existsSync(dbPath)) return;
	const db = new Database(dbPath);
	try {
		const deleteWorkspaces = db.prepare(
			"delete from workspaces where project_id = ?",
		);
		const deleteProjects = db.prepare("delete from projects where id = ?");
		const transaction = db.transaction((projectIds: string[]) => {
			for (const projectId of projectIds) {
				deleteWorkspaces.run(projectId);
				deleteProjects.run(projectId);
			}
		});
		transaction(args.projectIds);
	} finally {
		db.close();
	}
}

function seedLocalHostFixture(args: {
	organizationId: string;
	projects: Array<{ id: string; repoCloneUrl: string | null }>;
	workspaces: Array<{
		id: string;
		projectId: string;
		branch: string;
		createdAt: Date;
	}>;
}): { dbPath: string; workspaceCount: number } {
	const dbPath = getHostDbPath(args.organizationId);
	if (args.workspaces.length === 0) {
		return { dbPath, workspaceCount: 0 };
	}

	mkdirSync(dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	const repoPath = process.cwd();
	try {
		const insertProject = db.prepare(`
			insert into projects (id, repo_path, repo_url, remote_name, worktree_base_dir, created_at)
			values (?, ?, ?, ?, ?, ?)
			on conflict(id) do update set
				repo_path = excluded.repo_path,
				repo_url = excluded.repo_url,
				remote_name = excluded.remote_name,
				worktree_base_dir = excluded.worktree_base_dir
		`);
		const insertWorkspace = db.prepare(`
			insert into workspaces (id, project_id, worktree_path, branch, created_at)
			values (?, ?, ?, ?, ?)
			on conflict(id) do update set
				project_id = excluded.project_id,
				worktree_path = excluded.worktree_path,
				branch = excluded.branch
		`);
		const projectsById = new Map(
			args.projects.map((project) => [project.id, project]),
		);
		const transaction = db.transaction(() => {
			for (const workspace of args.workspaces) {
				const project = projectsById.get(workspace.projectId);
				if (!project) continue;
				insertProject.run(
					project.id,
					repoPath,
					project.repoCloneUrl,
					"origin",
					dirname(repoPath),
					workspace.createdAt.getTime(),
				);
				insertWorkspace.run(
					workspace.id,
					workspace.projectId,
					repoPath,
					workspace.branch,
					workspace.createdAt.getTime(),
				);
			}
		});
		transaction();
		return { dbPath, workspaceCount: args.workspaces.length };
	} finally {
		db.close();
	}
}

function countLocalHostFixtureWorkspaces(args: {
	organizationId: string;
	workspaceIds: string[];
}): number {
	if (args.workspaceIds.length === 0) return 0;
	const dbPath = getHostDbPath(args.organizationId);
	if (!existsSync(dbPath)) return 0;
	const db = new Database(dbPath, { readonly: true });
	try {
		const placeholders = args.workspaceIds.map(() => "?").join(",");
		const row = db
			.prepare(
				`select count(*) as count from workspaces where id in (${placeholders})`,
			)
			.get(...args.workspaceIds) as { count?: number } | undefined;
		return Number(row?.count ?? 0);
	} finally {
		db.close();
	}
}

async function ensureTaskStatuses(organizationId: string) {
	const { db, eq, taskStatuses } = await getDbDeps();
	const definitions = [
		{ name: "Backlog", color: "slate", type: "backlog", position: 0 },
		{ name: "Todo", color: "blue", type: "unstarted", position: 1 },
		{ name: "In Progress", color: "amber", type: "started", position: 2 },
		{ name: "Done", color: "green", type: "completed", position: 3 },
		{ name: "Canceled", color: "red", type: "canceled", position: 4 },
	];
	const rows = await db
		.select()
		.from(taskStatuses)
		.where(eq(taskStatuses.organizationId, organizationId));
	const byType = new Map(rows.map((row) => [row.type, row]));

	for (const definition of definitions) {
		if (byType.has(definition.type)) continue;
		const [inserted] = await db
			.insert(taskStatuses)
			.values({
				organizationId,
				...definition,
			})
			.returning();
		if (inserted) byType.set(inserted.type, inserted);
	}

	const usable = definitions
		.map((definition) => byType.get(definition.type))
		.filter((row): row is NonNullable<typeof row> => Boolean(row));
	if (usable.length === 0) {
		throw new Error("No task statuses available for fixture seed");
	}
	return usable;
}

async function cleanupFixture(options: Record<string, string | boolean>) {
	assertSafeDatabaseUrl(process.env.DATABASE_URL, {
		allowRemote: Boolean(options["allow-remote"]),
	});

	const slug = stringOption(options, "slug") ?? DEFAULT_SLUG;
	const email = stringOption(options, "email") ?? DEV_EMAIL;
	const { organizationId, userId } = await resolveOrganizationId(email);
	const { and, db, eq, inArray, like, tasks, v2Projects, v2Workspaces } =
		await getDbDeps();

	const projects = await db
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.organizationId, organizationId),
				like(v2Projects.slug, `${slug}-%`),
			),
		);
	const projectIds = projects.map((project) => project.id);

	let deletedTasks = 0;
	let deletedWorkspaces = 0;
	let deletedProjects = 0;

	if (projectIds.length > 0) {
		const taskRows = await db
			.delete(tasks)
			.where(
				and(
					eq(tasks.organizationId, organizationId),
					inArray(tasks.v2ProjectId, projectIds),
				),
			)
			.returning({ id: tasks.id });
		deletedTasks = taskRows.length;

		const workspaceRows = await db
			.delete(v2Workspaces)
			.where(inArray(v2Workspaces.projectId, projectIds))
			.returning({ id: v2Workspaces.id });
		deletedWorkspaces = workspaceRows.length;

		const projectRows = await db
			.delete(v2Projects)
			.where(inArray(v2Projects.id, projectIds))
			.returning({ id: v2Projects.id });
		deletedProjects = projectRows.length;
		cleanupLocalHostFixture({ organizationId, projectIds });
	}

	return {
		ok: true,
		action: "cleanup",
		email,
		userId,
		organizationId,
		slug,
		deletedProjects,
		deletedWorkspaces,
		deletedTasks,
	};
}

async function getFixtureStats(options: Record<string, string | boolean>) {
	assertSafeDatabaseUrl(process.env.DATABASE_URL, {
		allowRemote: Boolean(options["allow-remote"]),
	});

	const slug = stringOption(options, "slug") ?? DEFAULT_SLUG;
	const email = stringOption(options, "email") ?? DEV_EMAIL;
	const expectedProjectCount = positiveIntegerOption(options, "projects", 8);
	const expectedWorkspacesPerProject = positiveIntegerOption(
		options,
		"workspaces-per-project",
		18,
	);
	const expectedTaskCount = positiveIntegerOption(options, "tasks", 240);
	const expectedHostBackedWorkspaces = nonNegativeIntegerOption(
		options,
		"host-backed-workspaces",
		0,
	);
	const { organizationId, userId } = await resolveOrganizationId(email);
	const { and, db, eq, inArray, like, tasks, v2Projects, v2Workspaces } =
		await getDbDeps();

	const projects = await db
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.organizationId, organizationId),
				like(v2Projects.slug, `${slug}-%`),
			),
		);
	const projectIds = projects.map((project) => project.id);

	let workspaceCount = 0;
	let taskCount = 0;
	let hostBackedWorkspaceCount = 0;
	let localHostBackedWorkspaceCount = 0;
	let hostBackedWorkspaceIds: string[] = [];
	if (projectIds.length > 0) {
		const workspaceRows = await db
			.select({ id: v2Workspaces.id })
			.from(v2Workspaces)
			.where(inArray(v2Workspaces.projectId, projectIds));
		workspaceCount = workspaceRows.length;
		const localHostId = getHostId();
		const hostBackedWorkspaceRows = await db
			.select({ id: v2Workspaces.id })
			.from(v2Workspaces)
			.where(
				and(
					inArray(v2Workspaces.projectId, projectIds),
					eq(v2Workspaces.hostId, localHostId),
				),
			);
		hostBackedWorkspaceCount = hostBackedWorkspaceRows.length;
		hostBackedWorkspaceIds = hostBackedWorkspaceRows.map(
			(workspace) => workspace.id,
		);
		localHostBackedWorkspaceCount = countLocalHostFixtureWorkspaces({
			organizationId,
			workspaceIds: hostBackedWorkspaceIds,
		});

		const taskRows = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, organizationId),
					inArray(tasks.v2ProjectId, projectIds),
				),
			);
		taskCount = taskRows.length;
	}

	const expectedWorkspaceCount =
		expectedProjectCount * expectedWorkspacesPerProject;

	return {
		ok: true,
		action: "stats" as const,
		email,
		userId,
		organizationId,
		slug,
		projectCount: projects.length,
		workspaceCount,
		taskCount,
		localHostId: getHostId(),
		hostBackedWorkspaceCount,
		localHostBackedWorkspaceCount,
		hostBackedWorkspaceIds,
		expected: {
			projectCount: expectedProjectCount,
			workspacesPerProject: expectedWorkspacesPerProject,
			workspaceCount: expectedWorkspaceCount,
			taskCount: expectedTaskCount,
			hostBackedWorkspaceCount: expectedHostBackedWorkspaces,
		},
		isLoaded:
			projects.length >= expectedProjectCount &&
			workspaceCount >= expectedWorkspaceCount &&
			taskCount >= expectedTaskCount &&
			hostBackedWorkspaceCount >= expectedHostBackedWorkspaces &&
			localHostBackedWorkspaceCount >= expectedHostBackedWorkspaces,
	};
}

async function seedFixture(options: Record<string, string | boolean>) {
	assertSafeDatabaseUrl(process.env.DATABASE_URL, {
		allowRemote: Boolean(options["allow-remote"]),
	});

	const slug = stringOption(options, "slug") ?? DEFAULT_SLUG;
	const email = stringOption(options, "email") ?? DEV_EMAIL;
	const repoUrl = stringOption(options, "repo-url") ?? DEFAULT_REPO_URL;
	const projectCount = positiveIntegerOption(options, "projects", 8);
	const workspacesPerProject = positiveIntegerOption(
		options,
		"workspaces-per-project",
		18,
	);
	const taskCount = positiveIntegerOption(options, "tasks", 240);
	const hostBackedWorkspaces = nonNegativeIntegerOption(
		options,
		"host-backed-workspaces",
		0,
	);
	const now = new Date();

	await cleanupFixture({
		slug,
		email,
		...(options["allow-remote"] ? { "allow-remote": true } : {}),
	});

	const { organizationId, userId } = await resolveOrganizationId(email);
	const host = await resolveFixtureHost({ organizationId, userId, slug });
	const localHost =
		hostBackedWorkspaces > 0
			? await resolveLocalHost({ organizationId, userId })
			: null;
	const statuses = await ensureTaskStatuses(organizationId);
	const { db, tasks, v2Projects, v2Workspaces } = await getDbDeps();

	const projects = await db
		.insert(v2Projects)
		.values(
			Array.from({ length: projectCount }, (_, index) => ({
				organizationId,
				name: `Desktop Perf Project ${index + 1}`,
				slug: `${slug}-project-${String(index + 1).padStart(2, "0")}`,
				repoCloneUrl: repoUrl,
				createdAt: new Date(now.getTime() - index * 86_400_000),
				updatedAt: now,
			})),
		)
		.returning();

	const insertedTasks = await db
		.insert(tasks)
		.values(
			Array.from({ length: taskCount }, (_, index) => {
				const project = projects[index % projects.length];
				const status = statuses[index % statuses.length];
				if (!project || !status) {
					throw new Error("Fixture project/status generation failed");
				}
				const createdAt = new Date(now.getTime() - index * 3_600_000);
				return {
					organizationId,
					creatorId: userId,
					assigneeId: index % 3 === 0 ? userId : null,
					v2ProjectId: project.id,
					statusId: status.id,
					slug: `${slug}-task-${String(index + 1).padStart(4, "0")}`,
					title: `Desktop perf task ${index + 1}`,
					description:
						"Generated local fixture row for desktop performance validation.",
					priority: ["urgent", "high", "medium", "low", "none"][index % 5] as
						| "urgent"
						| "high"
						| "medium"
						| "low"
						| "none",
					estimate: (index % 8) + 1,
					labels: [`perf-${index % 7}`, `project-${index % projectCount}`],
					branch: `perf/task-${String(index + 1).padStart(4, "0")}`,
					prUrl:
						index % 4 === 0
							? `https://github.com/superset-sh/superset/pull/${10_000 + index}`
							: null,
					createdAt,
					updatedAt: createdAt,
					startedAt:
						status.type === "started" || status.type === "completed"
							? createdAt
							: null,
					completedAt: status.type === "completed" ? now : null,
				};
			}),
		)
		.returning();

	const currentBranch = getCurrentGitBranch();
	const workspaceValues = projects.flatMap((project, projectIndex) =>
		Array.from({ length: workspacesPerProject }, (_, workspaceIndex) => {
			const flatIndex = projectIndex * workspacesPerProject + workspaceIndex;
			const task = insertedTasks[flatIndex % insertedTasks.length];
			const isHostBacked =
				localHost !== null && flatIndex < hostBackedWorkspaces;
			return {
				id: randomUUID(),
				organizationId,
				projectId: project.id,
				hostId: isHostBacked ? localHost.machineId : host.machineId,
				name:
					workspaceIndex === 0
						? `${project.name} Main`
						: `${project.name} Workspace ${workspaceIndex}`,
				branch:
					workspaceIndex === 0
						? currentBranch
						: `perf/${projectIndex + 1}-${workspaceIndex}`,
				type: workspaceIndex === 0 ? "main" : "worktree",
				createdByUserId: userId,
				taskId: task?.id ?? null,
				createdAt: new Date(now.getTime() - flatIndex * 900_000),
				updatedAt: now,
			} satisfies typeof v2Workspaces.$inferInsert;
		}),
	);

	const workspaces = await db
		.insert(v2Workspaces)
		.values(workspaceValues)
		.returning();
	const hostBackedWorkspaceIds = new Set(
		workspaceValues
			.filter((workspace) => workspace.hostId === localHost?.machineId)
			.map((workspace) => workspace.id),
	);
	const localHostSeed = seedLocalHostFixture({
		organizationId,
		projects: projects.map((project) => ({
			id: project.id,
			repoCloneUrl: project.repoCloneUrl,
		})),
		workspaces: workspaces
			.filter((workspace) => hostBackedWorkspaceIds.has(workspace.id))
			.map((workspace) => ({
				id: workspace.id,
				projectId: workspace.projectId,
				branch: workspace.branch,
				createdAt: workspace.createdAt,
			})),
	});

	return {
		ok: true,
		action: "seed",
		email,
		userId,
		organizationId,
		slug,
		host,
		localHost,
		projectCount: projects.length,
		workspaceCount: workspaces.length,
		hostBackedWorkspaceCount: localHostSeed.workspaceCount,
		hostBackedWorkspaceIds: [...hostBackedWorkspaceIds],
		hostDbPath: localHostSeed.dbPath,
		taskCount: insertedTasks.length,
	};
}

async function ensureFixture(options: Record<string, string | boolean>) {
	const before = await getFixtureStats(options);
	if (before.isLoaded) {
		return {
			...before,
			action: "ensure" as const,
			seeded: false,
		};
	}

	const seedResult = await seedFixture(options);
	return {
		ok: true,
		action: "ensure" as const,
		seeded: true,
		before,
		seedResult,
	};
}

function printHelp() {
	console.log(`Usage: bun run desktop:perf-fixture -- <command> [options]

Commands:
  seed      Seed dense local desktop data for performance validation
  ensure    Seed only when the dense fixture is missing or below the requested shape
  stats     Print current dense fixture counts for the requested slug
  cleanup   Delete rows created by this fixture slug
  help      Show this help

Seed/ensure/stats options:
  --slug <slug>                       Prefix for generated project/task rows (default ${DEFAULT_SLUG})
  --projects <count>                  Number of projects (default 8)
  --workspaces-per-project <count>    Workspaces per project (default 18)
  --tasks <count>                     Number of tasks (default 240)
  --repo-url <url>                    Repo URL shown on projects (default ${DEFAULT_REPO_URL})
  --email <email>                     Dev account email (default ${DEV_EMAIL})
  --allow-remote                      Permit non-local DATABASE_URL for disposable test DBs

Cleanup options:
  --slug <slug>                       Prefix to delete (default ${DEFAULT_SLUG})
  --email <email>                     Dev account email (default ${DEV_EMAIL})
  --allow-remote                      Permit non-local DATABASE_URL for disposable test DBs
`);
}

async function main() {
	const parsed = parseDesktopPerfFixtureArgs(Bun.argv.slice(2));
	if (parsed.command === "help") {
		printHelp();
		return;
	}

	const result =
		parsed.command === "seed"
			? await seedFixture(parsed.options)
			: parsed.command === "cleanup"
				? await cleanupFixture(parsed.options)
				: parsed.command === "ensure"
					? await ensureFixture(parsed.options)
					: await getFixtureStats(parsed.options);
	console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
