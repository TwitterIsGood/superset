import { afterEach, describe, expect, test } from "bun:test";
import {
	lstat,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	allocatePortBase,
	applyManagedEnvBlock,
	applyMobileEnvFile,
	buildPortSet,
	buildWorktreeDevPlan,
	deriveWorkspaceName,
	ensureEnvFile,
	isPortBaseSafe,
	LEGACY_LOCAL_OVERRIDE_MARKER,
	MANAGED_ENV_END,
	MANAGED_ENV_START,
	parseGitWorktreePorcelain,
	readDataPortOverridesFromEnv,
	stripManagedEnvBlocks,
} from "./dev-worktree";

const tempDirs: string[] = [];

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "superset-dev-worktree-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
	);
});

describe("parseGitWorktreePorcelain", () => {
	test("detects primary and linked worktrees from porcelain output", () => {
		const entries = parseGitWorktreePorcelain(`worktree /repo/main
HEAD abc123
branch refs/heads/main

worktree /repo/feature
HEAD def456
detached

`);

		expect(entries).toEqual([
			{ path: "/repo/main", head: "abc123", branch: "refs/heads/main" },
			{ path: "/repo/feature", head: "def456", detached: true },
		]);
	});
});

describe("port planning", () => {
	test("calculates the full 25-port window offsets", () => {
		expect(buildPortSet(3100)).toMatchObject({
			WEB_PORT: 3100,
			API_PORT: 3101,
			DESKTOP_VITE_PORT: 3105,
			DESKTOP_AUTOMATION_PORT: 3118,
			ELECTRIC_PORT: 3109,
			CADDY_ELECTRIC_PORT: 3110,
			RELAY_PORT: 3113,
			LOCAL_PG_PORT: 3114,
			LOCAL_NEON_PROXY_PORT: 3115,
			LOCAL_REDIS_PORT: 3116,
			LOCAL_KV_REST_PORT: 3117,
			LOCAL_S3_PORT: 3119,
			LOCAL_S3_CONSOLE_PORT: 3120,
		});
	});

	test("rejects unsafe bases whose window overlaps reserved ports", () => {
		expect(isPortBaseSafe(3000)).toBe(true);
		expect(isPortBaseSafe(4990)).toBe(false);
	});

	test("uses a parent-qualified workspace name for linked worktrees with duplicate repo leaf names", () => {
		expect(
			deriveWorkspaceName({
				currentRoot: "/repo/worktrees/86b1/superset",
				gitDir: "/repo/.git/worktrees/86b1",
				primaryRoot: "/repo/main/superset",
				role: "linked",
				worktrees: [],
			}),
		).toBe("86b1-superset");
	});

	test("shared mode isolates app ports and points data URLs at primary ports", () => {
		const plan = buildWorktreeDevPlan({
			dataMode: "shared",
			portBase: 3200,
			primaryPortBase: 3000,
			worktree: {
				currentRoot: "/repo/feature",
				gitDir: "/repo/.git/worktrees/feature",
				primaryRoot: "/repo/main",
				role: "linked",
				worktrees: [],
			},
		});

		expect(plan.env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3201");
		expect(plan.env.EXPO_PUBLIC_API_URL).toBe("http://localhost:3201");
		expect(plan.env.EXPO_PUBLIC_ELECTRIC_URL).toBe("http://localhost:3212");
		expect(plan.env.DESKTOP_AUTOMATION_PORT).toBe("3218");
		expect(plan.env.DATABASE_URL).toBe(
			"postgres://postgres:postgres@db.localtest.me:3015/main",
		);
		expect(plan.env.ELECTRIC_URL).toBe("http://localhost:3009/v1/shape");
		expect(plan.env.KV_REST_API_URL).toBe("http://localhost:3017");
		expect(plan.env.SUPERSET_DEV_DATA_MODE).toBe("shared");
		expect(plan.dataDockerProject).toBe("superset-main");
	});

	test("shared mode can use the primary env's live data ports", () => {
		const dataPortOverrides = readDataPortOverridesFromEnv(`
# >>> superset primary dev managed
LOCAL_PG_PORT="43014"
LOCAL_NEON_PROXY_PORT="43015"
LOCAL_ELECTRIC_PORT="43009"
LOCAL_REDIS_PORT="43016"
LOCAL_KV_REST_PORT="43017"
# <<< superset primary dev managed
`);
		const plan = buildWorktreeDevPlan({
			dataMode: "shared",
			dataPortOverrides,
			portBase: 3200,
			primaryPortBase: 3000,
			worktree: {
				currentRoot: "/repo/feature",
				gitDir: "/repo/.git/worktrees/feature",
				primaryRoot: "/repo/main",
				role: "linked",
				worktrees: [],
			},
		});

		expect(plan.env.DATABASE_URL).toBe(
			"postgres://postgres:postgres@db.localtest.me:43015/main",
		);
		expect(plan.env.ELECTRIC_URL).toBe("http://localhost:43009/v1/shape");
		expect(plan.env.KV_REST_API_URL).toBe("http://localhost:43017");
		expect(plan.env.KV_URL).toBe("redis://localhost:43016");
	});

	test("isolated mode points data URLs at the current worktree port window", () => {
		const plan = buildWorktreeDevPlan({
			dataMode: "isolated",
			portBase: 3220,
			primaryPortBase: 3000,
			worktree: {
				currentRoot: "/repo/feature",
				gitDir: "/repo/.git/worktrees/feature",
				primaryRoot: "/repo/main",
				role: "linked",
				worktrees: [],
			},
		});

		expect(plan.env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3221");
		expect(plan.env.EXPO_PUBLIC_API_URL).toBe("http://localhost:3221");
		expect(plan.env.EXPO_PUBLIC_ELECTRIC_URL).toBe("http://localhost:3232");
		expect(plan.env.DESKTOP_AUTOMATION_PORT).toBe("3238");
		expect(plan.env.DATABASE_URL).toBe(
			"postgres://postgres:postgres@db.localtest.me:3235/main",
		);
		expect(plan.env.ELECTRIC_URL).toBe("http://localhost:3229/v1/shape");
		expect(plan.env.KV_REST_API_URL).toBe("http://localhost:3237");
		expect(plan.env.SUPERSET_DEV_DATA_MODE).toBe("isolated");
		expect(plan.dataDockerProject).toBe("superset-feature");
	});
});

describe("port allocation", () => {
	test("allocates stable bases and skips used windows", async () => {
		const home = await makeTempDir();
		const first = await allocatePortBase("/repo/main", { homeDir: home });
		const firstAgain = await allocatePortBase("/repo/main", { homeDir: home });
		const second = await allocatePortBase("/repo/feature", { homeDir: home });

		expect(first).toBe(3000);
		expect(firstAgain).toBe(3000);
		expect(second).toBe(3025);

		const allocations = JSON.parse(
			await readFile(join(home, ".superset/port-allocations.json"), "utf8"),
		) as Record<string, number>;
		expect(allocations["/repo/main"]).toBe(3000);
		expect(allocations["/repo/feature"]).toBe(3025);
	});

	test("rejects manual bases whose port windows overlap another worktree", async () => {
		const home = await makeTempDir();
		await allocatePortBase("/repo/main", { base: 3200, homeDir: home });
		await expect(
			allocatePortBase("/repo/feature", { base: 3220, homeDir: home }),
		).rejects.toThrow("overlaps");
	});

	test("rejects manual bases already used by another worktree", async () => {
		const home = await makeTempDir();
		await allocatePortBase("/repo/main", { base: 3200, homeDir: home });
		await expect(
			allocatePortBase("/repo/feature", { base: 3200, homeDir: home }),
		).rejects.toThrow("overlaps");
	});
});

describe("managed env block", () => {
	test("turns a linked worktree .env symlink into a local file", async () => {
		const root = await makeTempDir();
		const sharedRoot = await makeTempDir();
		const sharedEnvPath = join(sharedRoot, ".env");
		const localEnvPath = join(root, ".env");

		await writeFile(sharedEnvPath, "SECRET=keep-me\n");
		await symlink(sharedEnvPath, localEnvPath);

		await ensureEnvFile(root);

		expect((await lstat(localEnvPath)).isSymbolicLink()).toBe(false);
		expect(await readFile(localEnvPath, "utf8")).toBe("SECRET=keep-me\n");
		expect(await readFile(sharedEnvPath, "utf8")).toBe("SECRET=keep-me\n");
	});

	test("adds a managed block without deleting existing secrets", () => {
		const output = applyManagedEnvBlock("SECRET=keep-me\n", {
			API_PORT: "3101",
			NEXT_PUBLIC_API_URL: "http://localhost:3101",
		});

		expect(output).toContain("SECRET=keep-me");
		expect(output).toContain(MANAGED_ENV_START);
		expect(output).toContain('API_PORT="3101"');
		expect(output).toContain(MANAGED_ENV_END);
	});

	test("replaces an existing managed block", () => {
		const input = `SECRET=keep-me

${MANAGED_ENV_START}
API_PORT="3001"
${MANAGED_ENV_END}
`;
		const output = applyManagedEnvBlock(input, {
			API_PORT: "3101",
		});

		expect(output).toContain("SECRET=keep-me");
		expect(output).not.toContain('API_PORT="3001"');
		expect(output).toContain('API_PORT="3101"');
		expect(output.match(new RegExp(MANAGED_ENV_START, "g"))).toHaveLength(1);
	});

	test("removes repeated legacy setup.local blocks while preserving later custom values", () => {
		const input = `SECRET=keep-me

${LEGACY_LOCAL_OVERRIDE_MARKER}
SUPERSET_PORT_BASE="3000"
API_PORT="3001"
NEXT_PUBLIC_API_URL="http://localhost:3001"

${LEGACY_LOCAL_OVERRIDE_MARKER}
SUPERSET_PORT_BASE="3020"
API_PORT="3021"
NEXT_PUBLIC_API_URL="http://localhost:3021"
CUSTOM_AFTER_LEGACY=keep-too
`;
		const stripped = stripManagedEnvBlocks(input);
		const output = applyManagedEnvBlock(input, {
			API_PORT: "3101",
			SUPERSET_PORT_BASE: "3100",
		});

		expect(stripped).toContain("SECRET=keep-me");
		expect(stripped).toContain("CUSTOM_AFTER_LEGACY=keep-too");
		expect(stripped).not.toContain(LEGACY_LOCAL_OVERRIDE_MARKER);
		expect(output).not.toContain('API_PORT="3001"');
		expect(output).not.toContain('API_PORT="3021"');
		expect(output).toContain("CUSTOM_AFTER_LEGACY=keep-too");
		expect(output).toContain('SUPERSET_PORT_BASE="3100"');
	});

	test("rewrites mobile Expo env values while preserving local-only keys", () => {
		const output = applyMobileEnvFile(
			`EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ELECTRIC_URL=http://localhost:3012
EXPO_PUBLIC_POSTHOG_KEY=keep-me
`,
			{
				EXPO_PUBLIC_API_URL: "http://localhost:3141",
				EXPO_PUBLIC_ELECTRIC_URL: "http://localhost:3152",
				EXPO_PUBLIC_WEB_URL: "http://localhost:3140",
				EXPO_PUBLIC_STREAMS_URL: "http://localhost:3147",
			},
		);

		expect(output).toContain("EXPO_PUBLIC_POSTHOG_KEY=keep-me");
		expect(output).not.toContain("http://localhost:3001");
		expect(output).not.toContain("http://localhost:3012");
		expect(output).toContain('EXPO_PUBLIC_API_URL="http://localhost:3141"');
		expect(output).toContain(
			'EXPO_PUBLIC_ELECTRIC_URL="http://localhost:3152"',
		);
	});
});
