import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR,
	parseDesktopPerfLoadedUiArgs,
} from "./desktop-perf-loaded-ui";

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
				"--max-workspace-dom-nodes",
				"5000",
				"--max-tasks-dom-nodes",
				"6000",
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
				"postgres://postgres:postgres@localhost:43014/main",
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
			maxWorkspaceDomNodes: 5000,
			maxTasksDomNodes: 6000,
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
			fixtureDatabaseUrl: "postgres://postgres:postgres@localhost:43014/main",
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
		expect(() =>
			parseDesktopPerfLoadedUiArgs(["--max-workspace-dom-nodes", "0"]),
		).toThrow(/--max-workspace-dom-nodes must be a positive integer/);
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
			'"desktop:perf-loaded-ui:online-lite": "DESKTOP_PERF_FIXTURE_DATABASE_URL=postgres://postgres:postgres@localhost:43014/main DESKTOP_PERF_FIXTURE_DATABASE_URL_UNPOOLED=postgres://postgres:postgres@localhost:43014/main bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture --fixture-host-backed-workspaces 1"',
		);
	});

	test("keeps task mention counting in the renderer summary", () => {
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(source).toContain("taskMentions: countText");
		expect(source).toContain("tasksView.taskMentions");
		expect(source).toContain("maxWorkspaceDomNodes");
		expect(source).toContain("maxTasksDomNodes");
		expect(source).toContain("workspace view rendered");
		expect(source).toContain("report.workspaceView.domNodeCount");
		expect(source).toContain("tasks view rendered");
		expect(source).toContain("report.tasksView.domNodeCount");
	});

	test("covers loaded first-use interaction paths", () => {
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(source).toContain("LoadedInteractionSummary");
		expect(source).toContain("runLoadedInteraction");
		expect(source).toContain("open-v2-workspace-detail");
		expect(source).toContain("getFixtureHostBackedWorkspaceId");
		expect(source).toContain("fixtureHostBackedWorkspaceId");
		expect(source).toContain("preferredWorkspaceId");
		expect(source).toContain("host-backed workspace detail id");
		expect(source).toContain("waitForV2WorkspaceDetailShell");
		expect(source).toContain("v2 workspace detail shell");
		expect(source).toContain("open-v2-workspace-right-sidebar");
		expect(source).toContain('["Files", "Changes", "Review", "Models"]');
		expect(source).toContain("switch-v2-workspace-sidebar-");
		expect(source).toContain("label.toLowerCase()");
		expect(source).toContain("open-tasks-project-filter");
		expect(source).toContain("open-tasks-status-filter");
		expect(source).toContain("open-tasks-assignee-filter");
		expect(source).toContain("switch-tasks-board-view");
		expect(source).toContain("switch-tasks-table-view");
		expect(source).toContain('["PRs", "Issues", "Tasks"]');
		expect(source).toContain("switch-tasks-type-");
		expect(source).toContain("typeTab.toLowerCase()");
		expect(source).toContain("loaded-workspace-detail-ui.png");
		expect(source).toContain("open-workspace-terminal-pane");
		expect(source).toContain("openTerminalPaneFromEmptyWorkspace");
		expect(source).toContain("terminal pane attached");
		expect(source).toContain("open-workspace-chat-pane");
		expect(source).toContain("openChatPaneFromEmptyWorkspace");
		expect(source).toContain("workspace-chat-first-send");
		expect(source).toContain("sendWorkspaceChatProbe");
		expect(source).toContain("chat first send user message");
		expect(source).toContain("open-workspace-file-pane");
		expect(source).toContain("openFilePaneFromFilesSidebar");
		expect(source).toContain("[data-item-path]");
	});

	test("counts both sortable and static dashboard sidebar workspace rows", () => {
		expect(DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR).toContain(
			"data-dashboard-sidebar-workspace-item",
		);
		expect(DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR).toContain(
			"data-dashboard-sidebar-expanded-workspace-wrapper",
		);
		expect(DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR).toContain(
			"data-dashboard-sidebar-collapsed-workspace-row",
		);
	});

	test("opens the lazy dashboard sidebar before sidebar density checks", () => {
		const source = readFileSync("scripts/desktop-perf-loaded-ui.ts", "utf8");

		expect(source).toContain("openWorkspaceSidebarForDensityCheck");
		expect(source).toContain("options.minSidebarWorkspaceRows <= 0");
		expect(source).toContain('"workspace-sidebar-store"');
		expect(source).toContain("isOpen: true");
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
		expect(source).toContain("switchActiveOrganization");
		expect(source).toContain("waitForRendererFixtureOrganization");
		expect(source).toContain("getRendererActiveOrganizationId");
		expect(source).toContain("renderer active organization is");
		expect(source).toContain(
			"switched.result?.activeOrganizationId === fixtureOrganizationId",
		);
		expect(source).toContain("debugActiveOrganizationId");
		expect(source).toContain("getV2WorkspaceGraphHealth");
		expect(source).toContain("recoverPartialV2WorkspaceGraphCache");
		expect(source).toContain("Collection health:");
		expect(source).toContain("collections: collectionHealth");
	});

	test("exposes a development-only renderer organization switch hook", () => {
		const providerSource = readFileSync(
			"apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx",
			"utf8",
		);
		const collectionsSource = readFileSync(
			"apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts",
			"utf8",
		);

		expect(providerSource).toContain('env.NODE_ENV !== "development"');
		expect(providerSource).toContain("__supersetCollectionsDebug");
		expect(providerSource).toContain("switchActiveOrganization");
		expect(providerSource).toContain(
			"await switchOrganization(organizationId)",
		);
		expect(collectionsSource).toContain("switchActiveOrganization?:");
		expect(collectionsSource).toContain("getActiveOrganizationId?:");
	});
});
