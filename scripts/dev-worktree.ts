import { existsSync } from "node:fs";
import {
	copyFile,
	lstat,
	mkdir,
	readFile,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export type DataMode = "shared" | "isolated";
export type WorktreeRole = "primary" | "linked";

export const MANAGED_ENV_START = "# >>> superset worktree dev managed";
export const MANAGED_ENV_END = "# <<< superset worktree dev managed";
export const LEGACY_LOCAL_OVERRIDE_MARKER =
	"# ===== Local workspace overrides (setup.local.sh) =====";
export const MOBILE_ENV_MANAGED_KEYS = new Set([
	"SUPERSET_MOBILE_PROFILE",
	"EXPO_PUBLIC_SUPERSET_PROFILE",
	"EXPO_PUBLIC_API_URL",
	"EXPO_PUBLIC_ELECTRIC_URL",
	"EXPO_PUBLIC_RELAY_URL",
	"EXPO_PUBLIC_STREAMS_URL",
	"EXPO_PUBLIC_WEB_URL",
]);

export const PORT_RANGE = 25;
export const DEFAULT_PORT_START = 3000;
export const RESERVED_PORTS = [
	3659, 4045, 5000, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
	7000,
] as const;

const ELECTRIC_SECRET = "local_electric_dev_secret";
const LOCAL_KV_TOKEN = "local-kv-token";

const MANAGED_ENV_KEYS = new Set([
	"ADMIN_PORT",
	"API_PORT",
	"CADDY_ELECTRIC_PORT",
	"CODE_INSPECTOR_PORT",
	"DATABASE_URL",
	"DATABASE_URL_UNPOOLED",
	"DESKTOP_AUTOMATION_PORT",
	"DESKTOP_NOTIFICATIONS_PORT",
	"DESKTOP_VITE_PORT",
	"DOCS_PORT",
	"DURABLE_STREAMS_URL",
	"ELECTRIC_PORT",
	"ELECTRIC_SECRET",
	"ELECTRIC_URL",
	"EXPO_PUBLIC_API_URL",
	"EXPO_PUBLIC_ELECTRIC_URL",
	"EXPO_PUBLIC_RELAY_URL",
	"EXPO_PUBLIC_STREAMS_URL",
	"EXPO_PUBLIC_SUPERSET_PROFILE",
	"EXPO_PUBLIC_WEB_URL",
	"KV_REST_API_TOKEN",
	"KV_REST_API_URL",
	"KV_URL",
	"LOCAL_ELECTRIC_PORT",
	"LOCAL_KV_REST_PORT",
	"LOCAL_NEON_PROXY_PORT",
	"LOCAL_PG_PORT",
	"LOCAL_REDIS_PORT",
	"LOCAL_S3_CONSOLE_PORT",
	"LOCAL_S3_PORT",
	"MARKETING_PORT",
	"NEXT_PUBLIC_ADMIN_URL",
	"NEXT_PUBLIC_API_URL",
	"NEXT_PUBLIC_DESKTOP_URL",
	"NEXT_PUBLIC_DOCS_URL",
	"NEXT_PUBLIC_ELECTRIC_PROXY_URL",
	"NEXT_PUBLIC_ELECTRIC_URL",
	"NEXT_PUBLIC_MARKETING_URL",
	"NEXT_PUBLIC_RELAY_URL",
	"NEXT_PUBLIC_STREAMS_URL",
	"NEXT_PUBLIC_WEB_URL",
	"PORT",
	"RELAY_URL",
	"STREAMS_INTERNAL_PORT",
	"STREAMS_INTERNAL_URL",
	"STREAMS_PORT",
	"STREAMS_URL",
	"SUPERSET_DEV_DATA_MODE",
	"SUPERSET_HOME_DIR",
	"SUPERSET_MOBILE_PROFILE",
	"SUPERSET_PORT_BASE",
	"SUPERSET_PRIMARY_ROOT",
	"SUPERSET_WEB_URL",
	"SUPERSET_WORKSPACE_NAME",
	"SUPERSET_WORKTREE_ROLE",
	"WEB_PORT",
	"WRANGLER_PORT",
]);

type CliOptions = {
	dataMode: DataMode;
	prepareOnly: boolean;
	noInstall: boolean;
	base?: number;
	printJson: boolean;
};

type WorktreeEntry = {
	path: string;
	head?: string;
	branch?: string;
	detached?: boolean;
	prunable?: string;
};

export type WorktreeInfo = {
	currentRoot: string;
	primaryRoot: string;
	role: WorktreeRole;
	gitDir: string;
	worktrees: WorktreeEntry[];
};

export type PortSet = {
	WEB_PORT: number;
	API_PORT: number;
	MARKETING_PORT: number;
	ADMIN_PORT: number;
	DOCS_PORT: number;
	DESKTOP_AUTOMATION_PORT: number;
	DESKTOP_VITE_PORT: number;
	DESKTOP_NOTIFICATIONS_PORT: number;
	STREAMS_PORT: number;
	STREAMS_INTERNAL_PORT: number;
	ELECTRIC_PORT: number;
	CADDY_ELECTRIC_PORT: number;
	CODE_INSPECTOR_PORT: number;
	WRANGLER_PORT: number;
	RELAY_PORT: number;
	LOCAL_PG_PORT: number;
	LOCAL_REDIS_PORT: number;
	LOCAL_KV_REST_PORT: number;
	LOCAL_S3_PORT: number;
	LOCAL_S3_CONSOLE_PORT: number;
};

type DataPortOverrides = Partial<
	Pick<
		PortSet,
		| "ELECTRIC_PORT"
		| "LOCAL_PG_PORT"
		| "LOCAL_REDIS_PORT"
		| "LOCAL_KV_REST_PORT"
		| "LOCAL_S3_PORT"
		| "LOCAL_S3_CONSOLE_PORT"
	>
>;

export type WorktreeDevPlan = {
	currentRoot: string;
	primaryRoot: string;
	role: WorktreeRole;
	workspaceName: string;
	dataMode: DataMode;
	portBase: number;
	dataPortBase: number;
	dockerProject: string;
	dataDockerProject: string;
	ports: PortSet;
	dataPorts: PortSet;
	env: Record<string, string>;
	urls: Record<string, string>;
};

type AllocationOptions = {
	homeDir?: string;
	base?: number;
	start?: number;
	range?: number;
};

type CommandResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

function normalizePath(path: string) {
	return resolve(path);
}

function assertStringMap(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

async function runCommand(
	command: string,
	args: string[],
	options: { cwd: string; env?: Record<string, string>; inherit?: boolean },
): Promise<CommandResult> {
	const child = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stderr: options.inherit ? "inherit" : "pipe",
		stdout: options.inherit ? "inherit" : "pipe",
	});
	const exitCode = await child.exited;
	const stdout =
		options.inherit || !child.stdout
			? ""
			: await new Response(child.stdout).text();
	const stderr =
		options.inherit || !child.stderr
			? ""
			: await new Response(child.stderr).text();
	return { stdout, stderr, exitCode };
}

async function runRequired(
	command: string,
	args: string[],
	options: { cwd: string; env?: Record<string, string>; inherit?: boolean },
) {
	const result = await runCommand(command, args, options);
	if (result.exitCode !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim();
		throw new Error(
			`${command} ${args.join(" ")} failed with exit ${result.exitCode}${
				detail ? `\n${detail}` : ""
			}`,
		);
	}
	return result.stdout.trim();
}

export function parseGitWorktreePorcelain(output: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let current: WorktreeEntry | undefined;

	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line) {
			if (current) {
				entries.push(current);
				current = undefined;
			}
			continue;
		}

		const [key, ...rest] = line.split(" ");
		const value = rest.join(" ");
		if (key === "worktree") {
			if (current) {
				entries.push(current);
			}
			current = { path: value };
			continue;
		}

		if (!current) {
			continue;
		}

		if (key === "HEAD") current.head = value;
		if (key === "branch") current.branch = value;
		if (key === "detached") current.detached = true;
		if (key === "prunable") current.prunable = value || "true";
	}

	if (current) {
		entries.push(current);
	}

	return entries;
}

export async function detectWorktree(cwd: string): Promise<WorktreeInfo> {
	const currentRoot = normalizePath(
		await runRequired("git", ["rev-parse", "--show-toplevel"], { cwd }),
	);
	const gitDir = await runRequired("git", ["rev-parse", "--git-dir"], {
		cwd: currentRoot,
	});
	const worktreeOutput = await runRequired(
		"git",
		["worktree", "list", "--porcelain"],
		{
			cwd: currentRoot,
		},
	);
	const worktrees = parseGitWorktreePorcelain(worktreeOutput);
	const primaryRoot = normalizePath(worktrees[0]?.path ?? currentRoot);
	const role: WorktreeRole =
		normalizePath(currentRoot) === primaryRoot ? "primary" : "linked";

	await assertSupersetRoot(currentRoot);
	if (!existsSync(primaryRoot)) {
		throw new Error(`Primary git worktree does not exist: ${primaryRoot}`);
	}
	await assertSupersetRoot(primaryRoot);

	return { currentRoot, primaryRoot, role, gitDir, worktrees };
}

async function assertSupersetRoot(root: string) {
	const packageJsonPath = join(root, "package.json");
	if (!existsSync(packageJsonPath)) {
		throw new Error(`Not a Superset repository root: ${root}`);
	}
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
		name?: string;
	};
	if (packageJson.name !== "@superset/repo") {
		throw new Error(
			`Refusing to prepare ${root}: package.json name is ${packageJson.name ?? "<missing>"}`,
		);
	}
}

export function isPortBaseSafe(base: number, range = PORT_RANGE) {
	return !RESERVED_PORTS.some((port) => port >= base && port < base + range);
}

function portWindowsOverlap(first: number, second: number, range: number) {
	return first < second + range && second < first + range;
}

function readAllocationValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return undefined;
}

async function acquireAllocationLock(lockDir: string) {
	await mkdir(join(lockDir, ".."), { recursive: true });

	for (let waited = 0; waited <= 30; waited += 1) {
		try {
			await mkdir(lockDir);
			await writeFile(join(lockDir, "pid"), String(process.pid));
			return;
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error)) {
				throw error;
			}
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") {
				throw error;
			}
		}

		const shouldRemove = await isStaleLock(lockDir);
		if (shouldRemove) {
			await rm(lockDir, { force: true, recursive: true });
			continue;
		}

		if (waited === 30) {
			throw new Error(`Timed out waiting for port allocation lock: ${lockDir}`);
		}
		await sleep(1000);
	}
}

async function isStaleLock(lockDir: string) {
	const pidPath = join(lockDir, "pid");
	try {
		const pid = Number((await readFile(pidPath, "utf8")).trim());
		if (Number.isInteger(pid) && pid > 0) {
			try {
				process.kill(pid, 0);
				return false;
			} catch {
				return true;
			}
		}
	} catch {
		// Fall through to mtime check.
	}

	try {
		const stats = await stat(lockDir);
		return Date.now() - stats.mtimeMs >= 300_000;
	} catch {
		return true;
	}
}

async function releaseAllocationLock(lockDir: string) {
	await rm(lockDir, { force: true, recursive: true });
}

export async function allocatePortBase(
	worktreeRoot: string,
	options: AllocationOptions = {},
) {
	const homeDir = options.homeDir ?? homedir();
	const range = options.range ?? PORT_RANGE;
	const start = options.start ?? DEFAULT_PORT_START;
	const allocDir = join(homeDir, ".superset");
	const allocFile = join(allocDir, "port-allocations.json");
	const lockDir = join(allocDir, "port-allocations.lock");
	const key = normalizePath(worktreeRoot);

	await mkdir(allocDir, { recursive: true });
	if (!existsSync(allocFile)) {
		await writeFile(allocFile, "{}\n");
	}

	await acquireAllocationLock(lockDir);
	try {
		const raw = await readFile(allocFile, "utf8");
		const allocations = assertStringMap(JSON.parse(raw || "{}"));
		const existing = readAllocationValue(allocations[key]);

		if (options.base !== undefined) {
			if (!Number.isInteger(options.base) || options.base < 1) {
				throw new Error(`Invalid --base value: ${options.base}`);
			}
			if (!isPortBaseSafe(options.base, range)) {
				throw new Error(
					`Port base ${options.base} overlaps a reserved port in its ${range}-port window`,
				);
			}
			for (const [allocatedPath, allocatedValue] of Object.entries(
				allocations,
			)) {
				const allocatedBase = readAllocationValue(allocatedValue);
				if (
					allocatedPath !== key &&
					allocatedBase !== undefined &&
					portWindowsOverlap(allocatedBase, options.base, range)
				) {
					throw new Error(
						`Port base ${options.base} overlaps the ${range}-port window allocated to ${allocatedPath}`,
					);
				}
			}
			allocations[key] = options.base;
			await writeFile(allocFile, `${JSON.stringify(allocations, null, 2)}\n`);
			return options.base;
		}

		const otherBases = Object.entries(allocations)
			.filter(([allocatedPath]) => allocatedPath !== key)
			.map(([, allocatedValue]) => readAllocationValue(allocatedValue))
			.filter((value): value is number => value !== undefined);

		if (
			existing !== undefined &&
			isPortBaseSafe(existing, range) &&
			!otherBases.some((base) => portWindowsOverlap(base, existing, range))
		) {
			return existing;
		}

		if (existing !== undefined) {
			delete allocations[key];
		}

		const used = Object.entries(allocations)
			.filter(([allocatedPath]) => allocatedPath !== key)
			.map(([, allocatedValue]) => readAllocationValue(allocatedValue))
			.filter((value): value is number => value !== undefined);
		let candidate = start;
		while (
			used.some((base) => portWindowsOverlap(base, candidate, range)) ||
			!isPortBaseSafe(candidate, range)
		) {
			candidate += range;
		}
		allocations[key] = candidate;
		await writeFile(allocFile, `${JSON.stringify(allocations, null, 2)}\n`);
		return candidate;
	} finally {
		await releaseAllocationLock(lockDir);
	}
}

export function buildPortSet(base: number): PortSet {
	return {
		WEB_PORT: base,
		API_PORT: base + 1,
		MARKETING_PORT: base + 2,
		ADMIN_PORT: base + 3,
		DOCS_PORT: base + 4,
		DESKTOP_VITE_PORT: base + 5,
		DESKTOP_NOTIFICATIONS_PORT: base + 6,
		STREAMS_PORT: base + 7,
		STREAMS_INTERNAL_PORT: base + 8,
		ELECTRIC_PORT: base + 9,
		CADDY_ELECTRIC_PORT: base + 10,
		CODE_INSPECTOR_PORT: base + 11,
		WRANGLER_PORT: base + 12,
		RELAY_PORT: base + 13,
		LOCAL_PG_PORT: base + 14,
		LOCAL_REDIS_PORT: base + 16,
		LOCAL_KV_REST_PORT: base + 17,
		DESKTOP_AUTOMATION_PORT: base + 18,
		LOCAL_S3_PORT: base + 19,
		LOCAL_S3_CONSOLE_PORT: base + 20,
	};
}

export function sanitizeName(value: string) {
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-/, "")
		.replace(/-$/, "")
		.slice(0, 48);
	return sanitized || "superset";
}

export function deriveWorkspaceName(worktree: WorktreeInfo) {
	const currentName = basename(worktree.currentRoot);
	if (
		worktree.role === "linked" &&
		currentName === basename(worktree.primaryRoot)
	) {
		return `${basename(dirname(worktree.currentRoot))}-${currentName}`;
	}
	return currentName;
}

export function buildWorktreeDevPlan(input: {
	worktree: WorktreeInfo;
	portBase: number;
	primaryPortBase: number;
	dataMode: DataMode;
	dataPortOverrides?: DataPortOverrides;
}): WorktreeDevPlan {
	const ports = buildPortSet(input.portBase);
	const dataPortBase =
		input.dataMode === "shared" ? input.primaryPortBase : input.portBase;
	const dataPorts = {
		...buildPortSet(dataPortBase),
		...(input.dataMode === "shared" ? input.dataPortOverrides : undefined),
	};
	const workspaceName = deriveWorkspaceName(input.worktree);
	const primaryWorkspaceName = basename(input.worktree.primaryRoot);
	const dockerProject = `superset-${sanitizeName(workspaceName)}`;
	const dataDockerProject =
		input.dataMode === "shared"
			? `superset-${sanitizeName(primaryWorkspaceName)}`
			: dockerProject;

	const urls = {
		admin: `http://localhost:${ports.ADMIN_PORT}`,
		api: `http://localhost:${ports.API_PORT}`,
		caddyElectric: `https://localhost:${ports.CADDY_ELECTRIC_PORT}`,
		desktop: `http://localhost:${ports.DESKTOP_VITE_PORT}`,
		docs: `http://localhost:${ports.DOCS_PORT}`,
		electricRaw: `http://localhost:${dataPorts.ELECTRIC_PORT}/v1/shape`,
		electricProxy: `http://localhost:${ports.WRANGLER_PORT}`,
		kvRest: `http://localhost:${dataPorts.LOCAL_KV_REST_PORT}`,
		marketing: `http://localhost:${ports.MARKETING_PORT}`,
		postgres: `postgres://postgres:postgres@localhost:${dataPorts.LOCAL_PG_PORT}/main`,
		relay: `http://localhost:${ports.RELAY_PORT}`,
		s3: `http://localhost:${dataPorts.LOCAL_S3_PORT}`,
		s3Console: `http://localhost:${dataPorts.LOCAL_S3_CONSOLE_PORT}`,
		streams: `http://localhost:${ports.STREAMS_PORT}`,
		web: `http://localhost:${ports.WEB_PORT}`,
	};

	const env: Record<string, string> = {
		SUPERSET_WORKSPACE_NAME: workspaceName,
		SUPERSET_HOME_DIR: join(input.worktree.currentRoot, "superset-dev-data"),
		SUPERSET_MOBILE_PROFILE: "development",
		SUPERSET_PORT_BASE: String(input.portBase),
		SUPERSET_WORKTREE_ROLE: input.worktree.role,
		SUPERSET_PRIMARY_ROOT: input.worktree.primaryRoot,
		SUPERSET_DEV_DATA_MODE: input.dataMode,

		LOCAL_PG_PORT: String(dataPorts.LOCAL_PG_PORT),
		LOCAL_ELECTRIC_PORT: String(dataPorts.ELECTRIC_PORT),
		LOCAL_REDIS_PORT: String(dataPorts.LOCAL_REDIS_PORT),
		LOCAL_KV_REST_PORT: String(dataPorts.LOCAL_KV_REST_PORT),
		LOCAL_S3_PORT: String(dataPorts.LOCAL_S3_PORT),
		LOCAL_S3_CONSOLE_PORT: String(dataPorts.LOCAL_S3_CONSOLE_PORT),
		DATABASE_URL: urls.postgres,
		DATABASE_URL_UNPOOLED: `postgres://postgres:postgres@localhost:${dataPorts.LOCAL_PG_PORT}/main`,
		KV_REST_API_URL: urls.kvRest,
		KV_REST_API_TOKEN: LOCAL_KV_TOKEN,
		KV_URL: `redis://localhost:${dataPorts.LOCAL_REDIS_PORT}`,

		WEB_PORT: String(ports.WEB_PORT),
		API_PORT: String(ports.API_PORT),
		MARKETING_PORT: String(ports.MARKETING_PORT),
		ADMIN_PORT: String(ports.ADMIN_PORT),
		DOCS_PORT: String(ports.DOCS_PORT),
		DESKTOP_AUTOMATION_PORT: String(ports.DESKTOP_AUTOMATION_PORT),
		DESKTOP_VITE_PORT: String(ports.DESKTOP_VITE_PORT),
		DESKTOP_NOTIFICATIONS_PORT: String(ports.DESKTOP_NOTIFICATIONS_PORT),
		STREAMS_PORT: String(ports.STREAMS_PORT),
		STREAMS_INTERNAL_PORT: String(ports.STREAMS_INTERNAL_PORT),
		CADDY_ELECTRIC_PORT: String(ports.CADDY_ELECTRIC_PORT),
		CODE_INSPECTOR_PORT: String(ports.CODE_INSPECTOR_PORT),
		WRANGLER_PORT: String(ports.WRANGLER_PORT),
		RELAY_PORT: String(ports.RELAY_PORT),
		ELECTRIC_PORT: String(dataPorts.ELECTRIC_PORT),
		ELECTRIC_SECRET: ELECTRIC_SECRET,

		NEXT_PUBLIC_API_URL: urls.api,
		NEXT_PUBLIC_WEB_URL: urls.web,
		NEXT_PUBLIC_MARKETING_URL: urls.marketing,
		NEXT_PUBLIC_ADMIN_URL: urls.admin,
		NEXT_PUBLIC_DOCS_URL: urls.docs,
		NEXT_PUBLIC_DESKTOP_URL: urls.desktop,
		RELAY_URL: urls.relay,
		NEXT_PUBLIC_RELAY_URL: urls.relay,
		SUPERSET_WEB_URL: urls.web,
		EXPO_PUBLIC_WEB_URL: urls.web,
		EXPO_PUBLIC_SUPERSET_PROFILE: "development",
		EXPO_PUBLIC_API_URL: urls.api,
		EXPO_PUBLIC_RELAY_URL: urls.relay,

		PORT: String(ports.STREAMS_PORT),
		STREAMS_URL: urls.streams,
		NEXT_PUBLIC_STREAMS_URL: urls.streams,
		EXPO_PUBLIC_STREAMS_URL: urls.streams,
		STREAMS_INTERNAL_URL: `http://127.0.0.1:${ports.STREAMS_INTERNAL_PORT}`,

		ELECTRIC_URL: urls.electricRaw,
		NEXT_PUBLIC_ELECTRIC_URL: urls.electricProxy,
		NEXT_PUBLIC_ELECTRIC_PROXY_URL: urls.electricProxy,
		EXPO_PUBLIC_ELECTRIC_URL: urls.electricProxy,
	};

	return {
		currentRoot: input.worktree.currentRoot,
		primaryRoot: input.worktree.primaryRoot,
		role: input.worktree.role,
		workspaceName,
		dataMode: input.dataMode,
		portBase: input.portBase,
		dataPortBase,
		dockerProject,
		dataDockerProject,
		ports,
		dataPorts,
		env,
		urls,
	};
}

function shouldDropLegacyLine(line: string) {
	const trimmed = line.trim();
	if (!trimmed) return true;
	if (trimmed.startsWith("#")) return true;
	const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(trimmed);
	return Boolean(match?.[1] && MANAGED_ENV_KEYS.has(match[1]));
}

export function stripManagedEnvBlocks(input: string) {
	const lines = input.replace(/\r\n/g, "\n").split("\n");
	const output: string[] = [];
	let inManagedBlock = false;
	let inLegacyBlock = false;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === MANAGED_ENV_START) {
			inManagedBlock = true;
			inLegacyBlock = false;
			continue;
		}
		if (inManagedBlock) {
			if (trimmed === MANAGED_ENV_END) {
				inManagedBlock = false;
			}
			continue;
		}

		if (trimmed === LEGACY_LOCAL_OVERRIDE_MARKER) {
			inLegacyBlock = true;
			continue;
		}
		if (inLegacyBlock) {
			if (shouldDropLegacyLine(line)) {
				continue;
			}
			inLegacyBlock = false;
		}

		output.push(line);
	}

	return output.join("\n").trimEnd();
}

function escapeEnvValue(value: string) {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`")
		.replace(/\n/g, "\\n");
}

export function writeEnvVar(key: string, value: string) {
	return `${key}="${escapeEnvValue(value)}"`;
}

export function buildManagedEnvBlock(env: Record<string, string>) {
	const lines = [
		MANAGED_ENV_START,
		"# Generated by bun run dev:worktree. Edit values above or below this block.",
		"# Re-run the command to repair ports, URLs, and data-mode values.",
	];
	for (const [key, value] of Object.entries(env)) {
		lines.push(writeEnvVar(key, value));
	}
	lines.push(MANAGED_ENV_END);
	return lines.join("\n");
}

export function applyManagedEnvBlock(
	input: string,
	env: Record<string, string>,
) {
	const cleaned = stripManagedEnvBlocks(input);
	const block = buildManagedEnvBlock(env);
	return `${cleaned}${cleaned ? "\n\n" : ""}${block}\n`;
}

function stripEnvKeys(input: string, keys: Set<string>) {
	return input
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => {
			const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim());
			return !match?.[1] || !keys.has(match[1]);
		})
		.join("\n")
		.trimEnd();
}

export function applyMobileEnvFile(input: string, env: Record<string, string>) {
	const cleaned = stripEnvKeys(input, MOBILE_ENV_MANAGED_KEYS);
	const managedLines = Array.from(MOBILE_ENV_MANAGED_KEYS)
		.filter((key) => key in env)
		.map((key) => writeEnvVar(key, env[key] ?? ""));
	return `${cleaned}${cleaned ? "\n" : ""}${managedLines.join("\n")}\n`;
}

export async function ensureEnvFile(root: string) {
	const envPath = join(root, ".env");
	try {
		const envStats = await lstat(envPath);
		if (envStats.isSymbolicLink()) {
			const existing = await readFile(envPath, "utf8").catch(() => "");
			await unlink(envPath);
			if (existing) {
				await writeFile(envPath, existing);
				return envPath;
			}
		}
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error)) {
			throw error;
		}
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT") {
			throw error;
		}
	}

	if (!existsSync(envPath)) {
		const examplePath = join(root, ".env.local.example");
		if (!existsSync(examplePath)) {
			throw new Error(`Missing .env and .env.local.example in ${root}`);
		}
		await copyFile(examplePath, envPath);
	}
	return envPath;
}

export function parseEnvAssignments(input: string) {
	const values: Record<string, string> = {};
	for (const rawLine of input.replace(/\r\n/g, "\n").split("\n")) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(
			rawLine,
		);
		if (!match) continue;

		const key = match[1];
		let value = match[2]?.trim() ?? "";
		const quote = value[0];
		if (
			(quote === '"' || quote === "'") &&
			value.length >= 2 &&
			value[value.length - 1] === quote
		) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

function readEnvPort(values: Record<string, string>, key: string) {
	const value = values[key];
	if (!value || !/^\d+$/.test(value)) return undefined;
	return Number(value);
}

export function readDataPortOverridesFromEnv(input: string): DataPortOverrides {
	const primaryBlock = extractEnvBlock(
		input,
		"# >>> superset primary dev managed",
		"# <<< superset primary dev managed",
	);
	const values = parseEnvAssignments(primaryBlock ?? input);
	const overrides: DataPortOverrides = {};

	const localPgPort = readEnvPort(values, "LOCAL_PG_PORT");
	if (localPgPort !== undefined) overrides.LOCAL_PG_PORT = localPgPort;

	const localElectricPort =
		readEnvPort(values, "LOCAL_ELECTRIC_PORT") ??
		readEnvPort(values, "ELECTRIC_PORT");
	if (localElectricPort !== undefined) {
		overrides.ELECTRIC_PORT = localElectricPort;
	}

	const localRedisPort = readEnvPort(values, "LOCAL_REDIS_PORT");
	if (localRedisPort !== undefined) {
		overrides.LOCAL_REDIS_PORT = localRedisPort;
	}

	const localKvRestPort = readEnvPort(values, "LOCAL_KV_REST_PORT");
	if (localKvRestPort !== undefined) {
		overrides.LOCAL_KV_REST_PORT = localKvRestPort;
	}

	const localS3Port = readEnvPort(values, "LOCAL_S3_PORT");
	if (localS3Port !== undefined) {
		overrides.LOCAL_S3_PORT = localS3Port;
	}

	const localS3ConsolePort = readEnvPort(values, "LOCAL_S3_CONSOLE_PORT");
	if (localS3ConsolePort !== undefined) {
		overrides.LOCAL_S3_CONSOLE_PORT = localS3ConsolePort;
	}

	return overrides;
}

function extractEnvBlock(input: string, start: string, end: string) {
	const startIndex = input.indexOf(start);
	if (startIndex === -1) return undefined;
	const contentStart = startIndex + start.length;
	const endIndex = input.indexOf(end, contentStart);
	if (endIndex === -1) return input.slice(contentStart);
	return input.slice(contentStart, endIndex);
}

async function writePreparedFiles(plan: WorktreeDevPlan) {
	const envPath = await ensureEnvFile(plan.currentRoot);
	const currentEnv = await readFile(envPath, "utf8");
	await writeFile(envPath, applyManagedEnvBlock(currentEnv, plan.env));

	const mobileEnvPath = join(plan.currentRoot, "apps/mobile/.env.local");
	const currentMobileEnv = existsSync(mobileEnvPath)
		? await readFile(mobileEnvPath, "utf8")
		: "";
	await writeFile(
		mobileEnvPath,
		applyMobileEnvFile(currentMobileEnv, plan.env),
	);

	await writeFile(
		join(plan.currentRoot, "Caddyfile"),
		`{
\tauto_https disable_redirects
}

https://localhost:{$CADDY_ELECTRIC_PORT} {
\treverse_proxy localhost:{$WRANGLER_PORT} {
\t\tflush_interval -1
\t}
}
`,
	);

	await writeFile(
		join(plan.currentRoot, "apps/electric-proxy/.dev.vars"),
		`AUTH_URL=${plan.urls.api}
ELECTRIC_SHAPE_URL=${plan.urls.electricRaw}
ELECTRIC_SECRET=${ELECTRIC_SECRET}
ELECTRIC_SOURCE_ID=
ELECTRIC_SOURCE_SECRET=
`,
	);

	await mkdir(join(plan.currentRoot, ".superset"), { recursive: true });
	await writeFile(
		join(plan.currentRoot, ".superset/ports.json"),
		`${JSON.stringify(buildPortsJson(plan), null, 2)}\n`,
	);
}

function buildPortsJson(plan: WorktreeDevPlan) {
	const backingPrefix = plan.dataMode === "shared" ? "Shared " : "";
	return {
		ports: [
			{ port: plan.ports.WEB_PORT, label: "Web" },
			{ port: plan.ports.API_PORT, label: "API" },
			{ port: plan.ports.MARKETING_PORT, label: "Marketing" },
			{ port: plan.ports.ADMIN_PORT, label: "Admin" },
			{ port: plan.ports.DOCS_PORT, label: "Docs" },
			{ port: plan.ports.DESKTOP_VITE_PORT, label: "Desktop Vite" },
			{
				port: plan.ports.DESKTOP_NOTIFICATIONS_PORT,
				label: "Desktop Notifications",
			},
			{
				port: plan.ports.DESKTOP_AUTOMATION_PORT,
				label: "Desktop Automation",
			},
			{ port: plan.ports.STREAMS_PORT, label: "Streams" },
			{ port: plan.ports.STREAMS_INTERNAL_PORT, label: "Streams Internal" },
			{ port: plan.ports.CADDY_ELECTRIC_PORT, label: "Caddy Electric" },
			{ port: plan.ports.CODE_INSPECTOR_PORT, label: "Code Inspector" },
			{ port: plan.ports.WRANGLER_PORT, label: "Electric Proxy (Wrangler)" },
			{ port: plan.ports.RELAY_PORT, label: "Relay" },
			{ port: plan.dataPorts.ELECTRIC_PORT, label: `${backingPrefix}Electric` },
			{ port: plan.dataPorts.LOCAL_PG_PORT, label: `${backingPrefix}Postgres` },
			{ port: plan.dataPorts.LOCAL_REDIS_PORT, label: `${backingPrefix}Redis` },
			{
				port: plan.dataPorts.LOCAL_KV_REST_PORT,
				label: `${backingPrefix}KV REST`,
			},
			{ port: plan.dataPorts.LOCAL_S3_PORT, label: `${backingPrefix}S3` },
			{
				port: plan.dataPorts.LOCAL_S3_CONSOLE_PORT,
				label: `${backingPrefix}S3 Console`,
			},
		],
	};
}

async function checkTcpPort(port: number, timeoutMs = 500) {
	return await new Promise<boolean>((resolveCheck) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		const done = (result: boolean) => {
			socket.removeAllListeners();
			socket.destroy();
			resolveCheck(result);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

async function checkHttpHealth(url: string, timeoutMs = 1000) {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeout);
		return response.ok;
	} catch {
		return false;
	}
}

async function getDataServiceStatus(plan: WorktreeDevPlan) {
	const [postgres, electric, redis, kvRest] = await Promise.all([
		checkTcpPort(plan.dataPorts.LOCAL_PG_PORT),
		checkHttpHealth(
			`http://localhost:${plan.dataPorts.ELECTRIC_PORT}/v1/health`,
		),
		checkTcpPort(plan.dataPorts.LOCAL_REDIS_PORT),
		checkHttpHealth(`${plan.urls.kvRest}/health`),
	]);
	return { postgres, electric, redis, kvRest };
}

function allDataServicesReady(
	status: Awaited<ReturnType<typeof getDataServiceStatus>>,
) {
	return status.postgres && status.electric && status.redis && status.kvRest;
}

async function ensureDockerAvailable() {
	const result = await runCommand("docker", ["--version"], {
		cwd: process.cwd(),
	});
	if (result.exitCode !== 0) {
		throw new Error("Docker is required to start the local shared data stack");
	}
}

async function startDockerDataStack(plan: WorktreeDevPlan) {
	const stackRoot =
		plan.dataMode === "shared" ? plan.primaryRoot : plan.currentRoot;
	await ensureDockerAvailable();
	console.log(
		`Starting ${plan.dataMode} data stack from ${stackRoot} (project ${plan.dataDockerProject})...`,
	);
	await runRequired(
		"docker",
		[
			"compose",
			"-p",
			plan.dataDockerProject,
			"-f",
			join(stackRoot, "docker-compose.yml"),
			"up",
			"-d",
		],
		{
			cwd: stackRoot,
			env: {
				LOCAL_PG_PORT: String(plan.dataPorts.LOCAL_PG_PORT),
				LOCAL_ELECTRIC_PORT: String(plan.dataPorts.ELECTRIC_PORT),
				LOCAL_REDIS_PORT: String(plan.dataPorts.LOCAL_REDIS_PORT),
				LOCAL_KV_REST_PORT: String(plan.dataPorts.LOCAL_KV_REST_PORT),
				LOCAL_S3_PORT: String(plan.dataPorts.LOCAL_S3_PORT),
				LOCAL_S3_CONSOLE_PORT: String(plan.dataPorts.LOCAL_S3_CONSOLE_PORT),
				KV_REST_API_TOKEN: LOCAL_KV_TOKEN,
			},
			inherit: true,
		},
	);

	for (let attempt = 1; attempt <= 30; attempt += 1) {
		const status = await getDataServiceStatus(plan);
		if (allDataServicesReady(status)) {
			console.log("Data stack is reachable.");
			return;
		}
		if (attempt % 5 === 0) {
			console.log(
				`Waiting for data stack... ${formatDataStatus(status)} (${attempt}/30)`,
			);
		}
		await sleep(1000);
	}

	throw new Error("Data stack did not become reachable within 30s");
}

async function runIsolatedMigrations(plan: WorktreeDevPlan) {
	if (plan.dataMode !== "isolated") return;
	console.log("Applying migrations and seeding isolated dev account...");
	await runRequired("bun", ["run", "db:migrate"], {
		cwd: plan.currentRoot,
		env: plan.env,
		inherit: true,
	});
	await runRequired("bun", ["run", "db:seed-dev"], {
		cwd: plan.currentRoot,
		env: plan.env,
		inherit: true,
	});
}

function formatDataStatus(
	status: Awaited<ReturnType<typeof getDataServiceStatus>>,
) {
	return [
		`pg=${status.postgres ? "up" : "down"}`,
		`electric=${status.electric ? "up" : "down"}`,
		`redis=${status.redis ? "up" : "down"}`,
		`kv=${status.kvRest ? "up" : "down"}`,
	].join(" ");
}

async function maybeEnsureDataStack(
	plan: WorktreeDevPlan,
	prepareOnly: boolean,
) {
	const status = await getDataServiceStatus(plan);
	if (allDataServicesReady(status)) {
		console.log(`Data stack: ready (${formatDataStatus(status)})`);
		return;
	}

	console.log(`Data stack: not ready (${formatDataStatus(status)})`);
	if (prepareOnly) {
		console.log("Prepare-only mode: not starting Docker services.");
		console.log(
			`Run without --prepare-only to start the ${plan.dataMode} data stack automatically.`,
		);
		return;
	}

	await startDockerDataStack(plan);
	await runIsolatedMigrations(plan);
	if (plan.dataMode === "shared") {
		console.log(
			"Shared mode does not run migrations automatically. If this is a fresh shared DB, run `bun run db:migrate && bun run db:seed-dev` from the primary worktree.",
		);
	}
}

async function ensureDependencies(root: string, noInstall: boolean) {
	if (noInstall || existsSync(join(root, "node_modules"))) {
		return;
	}
	console.log("node_modules missing; running bun install...");
	await runRequired("bun", ["install"], { cwd: root, inherit: true });
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		dataMode: "shared",
		prepareOnly: false,
		noInstall: false,
		printJson: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--prepare-only") {
			options.prepareOnly = true;
			continue;
		}
		if (arg === "--no-install") {
			options.noInstall = true;
			continue;
		}
		if (arg === "--print-json") {
			options.printJson = true;
			continue;
		}
		if (arg === "--data") {
			const value = args[index + 1];
			if (value !== "shared" && value !== "isolated") {
				throw new Error("--data must be shared or isolated");
			}
			options.dataMode = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--data=")) {
			const value = arg.slice("--data=".length);
			if (value !== "shared" && value !== "isolated") {
				throw new Error("--data must be shared or isolated");
			}
			options.dataMode = value;
			continue;
		}
		if (arg === "--base") {
			const value = Number(args[index + 1]);
			if (!Number.isInteger(value)) {
				throw new Error("--base requires an integer port");
			}
			options.base = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--base=")) {
			const value = Number(arg.slice("--base=".length));
			if (!Number.isInteger(value)) {
				throw new Error("--base requires an integer port");
			}
			options.base = value;
			continue;
		}
		if (arg === "--slot" || arg.startsWith("--slot=")) {
			const value =
				arg === "--slot" ? args[index + 1] : arg.slice("--slot=".length);
			if (arg === "--slot") index += 1;
			if (value !== "auto") {
				throw new Error("Only --slot auto is supported");
			}
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function printHelp() {
	console.log(`Superset worktree dev

Usage:
  bun run dev:worktree [-- --prepare-only] [--data shared|isolated] [--base PORT]

Defaults:
  --data shared       Reuse the primary worktree's local DB/Electric/Redis/KV.
  --prepare-only      Write files and print URLs without starting services.
  --no-install        Skip automatic bun install when node_modules is missing.
`);
}

function printPlan(plan: WorktreeDevPlan) {
	console.log("");
	console.log("Superset worktree dev");
	console.log(`Current root: ${plan.currentRoot}`);
	console.log(`Role: ${plan.role}`);
	console.log(`Primary root: ${plan.primaryRoot}`);
	console.log(`Data mode: ${plan.dataMode}`);
	console.log(`Port base: ${plan.portBase}`);
	console.log(`Data port base: ${plan.dataPortBase}`);
	console.log(`SUPERSET_HOME_DIR: ${plan.env.SUPERSET_HOME_DIR}`);
	console.log("");
	console.log("URLs");
	console.log(`  Web:      ${plan.urls.web}`);
	console.log(`  API:      ${plan.urls.api}`);
	console.log(`  Desktop:  ${plan.urls.desktop}`);
	console.log(
		`  Electric: ${plan.urls.electricProxy} -> ${plan.urls.electricRaw}`,
	);
	console.log(`  Relay:    ${plan.urls.relay}`);
	console.log(`  KV REST:  ${plan.urls.kvRest}`);
	console.log("");
	if (plan.dataMode === "shared") {
		console.log(
			"Shared data mode: app ports are isolated, DB/Electric/Redis/KV point at the primary worktree's local stack.",
		);
	} else {
		console.log(
			"Isolated data mode: this worktree owns its DB/Electric/Redis/KV stack.",
		);
	}
}

async function buildPlanFromDisk(options: CliOptions) {
	const worktree = await detectWorktree(process.cwd());
	if (worktree.role === "primary") {
		const portBase = await allocatePortBase(worktree.currentRoot, {
			base: options.base,
		});
		return buildWorktreeDevPlan({
			worktree,
			portBase,
			primaryPortBase: portBase,
			dataMode: options.dataMode,
		});
	}

	const primaryPortBase = await allocatePortBase(worktree.primaryRoot);
	const portBase = await allocatePortBase(worktree.currentRoot, {
		base: options.base,
	});
	const dataPortOverrides =
		options.dataMode === "shared"
			? await readSharedDataPortOverrides(worktree.primaryRoot)
			: undefined;
	return buildWorktreeDevPlan({
		worktree,
		portBase,
		primaryPortBase,
		dataMode: options.dataMode,
		dataPortOverrides,
	});
}

async function readSharedDataPortOverrides(primaryRoot: string) {
	const envPath = join(primaryRoot, ".env");
	try {
		return readDataPortOverridesFromEnv(await readFile(envPath, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				return undefined;
			}
		}
		throw error;
	}
}

async function main() {
	const options = parseArgs(Bun.argv.slice(2));
	const plan = await buildPlanFromDisk(options);

	printPlan(plan);
	if (options.printJson) {
		console.log(JSON.stringify(plan, null, 2));
	}

	await ensureDependencies(plan.currentRoot, options.noInstall);
	await writePreparedFiles(plan);
	console.log(
		"Prepared .env, Caddyfile, apps/electric-proxy/.dev.vars, and .superset/ports.json.",
	);

	await maybeEnsureDataStack(plan, options.prepareOnly);

	if (options.prepareOnly) {
		console.log("Prepare-only complete.");
		return;
	}

	console.log("Starting desktop dev graph: bun run dev:desktop");
	const child = Bun.spawn(["bun", "run", "dev:desktop"], {
		cwd: plan.currentRoot,
		env: { ...process.env, ...plan.env },
		stderr: "inherit",
		stdout: "inherit",
		stdin: "inherit",
	});
	const exitCode = await child.exited;
	process.exit(exitCode);
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
