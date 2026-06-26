import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseDesktopPerfLoadedUiArgs } from "./desktop-perf-loaded-ui";

describe("desktop loaded UI verification helper", () => {
	test("parses loaded UI verification options", () => {
		expect(
			parseDesktopPerfLoadedUiArgs([
				"--artifact-dir",
				".tmp/loaded-ui",
				"--project-text",
				"Desktop Perf Project 1",
				"--task-text",
				"Desktop perf task",
				"--min-workspace-rows",
				"24",
				"--min-sidebar-workspace-rows",
				"40",
				"--min-task-mentions",
				"12",
				"--timeout-ms",
				"45000",
				"--skip-navigation",
				"--allow-console-errors",
				"--fail-on-resource-errors",
				"--auto-login-dev",
				"--ensure-fixture",
				"--fixture-slug",
				"desktop-perf-loaded",
				"--fixture-projects",
				"10",
				"--fixture-workspaces-per-project",
				"20",
				"--fixture-tasks",
				"300",
				"--fixture-host-backed-workspaces",
				"1",
				"--fixture-database-url",
				"postgres://postgres:postgres@localhost:43015/main",
				"--fixture-database-url-unpooled",
				"postgres://postgres:postgres@localhost:43014/main",
				"--allow-remote-fixture",
				"--dev-email",
				"admin@local.test",
				"--dev-password",
				"supersetdev",
				"--json",
			]),
		).toEqual({
			artifactDir: ".tmp/loaded-ui",
			projectText: "Desktop Perf Project 1",
			taskText: "Desktop perf task",
			minWorkspaceRows: 24,
			minSidebarWorkspaceRows: 40,
			minTaskMentions: 12,
			timeoutMs: 45_000,
			skipNavigation: true,
			allowConsoleErrors: true,
			failOnResourceErrors: true,
			autoLoginDev: true,
			devEmail: "admin@local.test",
			devPassword: "supersetdev",
			ensureFixture: true,
			fixtureSlug: "desktop-perf-loaded",
			fixtureProjects: 10,
			fixtureWorkspacesPerProject: 20,
			fixtureTasks: 300,
			fixtureHostBackedWorkspaces: 1,
			fixtureDatabaseUrl: "postgres://postgres:postgres@localhost:43015/main",
			fixtureDatabaseUrlUnpooled:
				"postgres://postgres:postgres@localhost:43014/main",
			allowRemoteFixture: true,
			json: true,
		});
	});

	test("rejects invalid row thresholds", () => {
		expect(() =>
			parseDesktopPerfLoadedUiArgs(["--min-workspace-rows", "0"]),
		).toThrow(/--min-workspace-rows must be a positive integer/);
	});

	test("allows sidebar density checks to be disabled", () => {
		const options = parseDesktopPerfLoadedUiArgs([
			"--min-sidebar-workspace-rows",
			"0",
		]);

		expect(options).not.toBe("help");
		if (options !== "help") {
			expect(options.minSidebarWorkspaceRows).toBe(0);
		}
	});

	test("is exposed as a root package script", () => {
		const packageJson = readFileSync("package.json", "utf8");

		expect(packageJson).toContain(
			'"desktop:perf-loaded-ui": "bun run scripts/desktop-perf-loaded-ui.ts"',
		);
		expect(packageJson).toContain(
			'"desktop:perf-loaded-ui:dev-login": "bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture"',
		);
		expect(packageJson).toContain(
			'"desktop:perf-loaded-ui:online-lite": "DESKTOP_PERF_FIXTURE_DATABASE_URL=postgres://postgres:postgres@localhost:43015/main DESKTOP_PERF_FIXTURE_DATABASE_URL_UNPOOLED=postgres://postgres:postgres@localhost:43014/main bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture --fixture-host-backed-workspaces 0"',
		);
	});

	test("keeps task mention counting in the renderer summary", () => {
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(source).toContain("taskMentions: countText");
		expect(source).toContain("tasksView.taskMentions");
	});

	test("can auto-login to the local loaded dev account before verifying data", () => {
		const options = parseDesktopPerfLoadedUiArgs(["--auto-login-dev"]);
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(options).not.toBe("help");
		if (options !== "help") {
			expect(options.autoLoginDev).toBe(true);
			expect(options.ensureFixture).toBe(false);
			expect(options.devEmail).toBe("admin@local.test");
			expect(options.devPassword).toBe("supersetdev");
		}
		expect(source).toContain("autoLoginDevIfNeeded");
		expect(source).toContain('selector: "#email"');
		expect(source).toContain('selector: "#password"');
		expect(source).toContain('form button[type="submit"]');
		expect(source).toContain("Desktop is on the sign-in route");
		expect(source).toContain("autoLoginAttempted");
	});

	test("can ensure the dense fixture before verifying the UI", () => {
		const options = parseDesktopPerfLoadedUiArgs(["--ensure-fixture"]);
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(options).not.toBe("help");
		if (options !== "help") {
			expect(options.ensureFixture).toBe(true);
			expect(options.fixtureProjects).toBe(10);
			expect(options.fixtureWorkspacesPerProject).toBe(20);
			expect(options.fixtureTasks).toBe(300);
			expect(options.fixtureHostBackedWorkspaces).toBe(1);
		}
		expect(source).toContain("desktop:perf-fixture");
		expect(source).toContain("ensure");
		expect(source).toContain("--host-backed-workspaces");
		expect(source).toContain("fixtureDatabaseUrl");
		expect(source).toContain("DATABASE_URL");
	});

	test("reports and recovers partial desktop collection caches", () => {
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(source).toContain("__supersetCollectionsDebug");
		expect(source).toContain("getV2WorkspaceGraphHealth");
		expect(source).toContain("recoverPartialV2WorkspaceGraphCache");
		expect(source).toContain("Collection health:");
		expect(source).toContain("collections: collectionHealth");
	});
});
