import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

/**
 * Regression test for https://github.com/anthropics/superset/issues/2641
 *
 * The "Run in Workspace" button disappeared because TasksView stopped passing
 * selectedTasks / onClearSelection to TasksTopBar, and TableContent stopped
 * exposing the row-selection state from useTasksTable.
 *
 * These tests verify the wiring exists at the source level so the regression
 * cannot silently reappear.
 */

const TASKS_VIEW_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(TASKS_VIEW_DIR, relativePath), "utf-8");
}

describe("Run in Workspace selection wiring (#2641)", () => {
	test("TasksView passes selectedTasks and onClearSelection to TasksTopBar", () => {
		const source = readComponent("TasksView.tsx");

		// TasksTopBar must receive selectedTasks prop
		expect(source).toContain("selectedTasks={");

		// TasksTopBar must receive onClearSelection prop
		expect(source).toContain("onClearSelection={");
	});

	test("TasksView passes onSelectionChange to TableContent", () => {
		const source = readComponent("TasksView.tsx");

		// TableContent must receive onSelectionChange callback
		expect(source).toContain("onSelectionChange={");
	});

	test("TableContent exposes selection state from useTasksTable", () => {
		const source = readComponent("components/TableContent/TableContent.tsx");

		// Must destructure rowSelection and setRowSelection from useTasksTable
		expect(source).toContain("rowSelection");
		expect(source).toContain("setRowSelection");

		// Must accept onSelectionChange prop
		expect(source).toContain("onSelectionChange");
	});

	test("TasksTopBar renders RunInWorkspacePopover when tasks are selected", () => {
		const source = readComponent("components/TasksTopBar/TasksTopBar.tsx");

		// Must use selectedTasks to determine hasSelection
		expect(source).toContain("selectedTasks");
		expect(source).toContain("hasSelection");

		// Must render RunInWorkspacePopover
		expect(source).toContain("RunInWorkspacePopover");
	});

	test("TasksView does not block the Tasks page on Linear connection checks", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).not.toContain("isLoading: isCheckingLinear");
		expect(source).not.toContain("isCheckingLinear ?");
		expect(source).toContain("isReady: isLinearCheckReady");
		expect(source).toContain("showLinearCTA");
	});

	test("Tasks table and board do not block indefinitely on live query loading", () => {
		const tableSource = readComponent(
			"components/TableContent/TableContent.tsx",
		);
		const boardSource = readComponent(
			"components/BoardContent/BoardContent.tsx",
		);
		const tableHookSource = readComponent(
			"hooks/useTasksTable/useTasksTable.tsx",
		);
		const dataHookSource = readComponent("hooks/useTasksData/useTasksData.tsx");

		expect(tableSource).not.toContain("<Spinner");
		expect(boardSource).not.toContain("<Spinner");
		expect(tableHookSource).not.toContain("isLoading");
		expect(dataHookSource).not.toContain("isLoading");
	});

	test("agent task prompts are written back to local Tasks after completion", () => {
		const rendererLibDir = join(TASKS_VIEW_DIR, "../../../../../../lib");
		const adapterSource = readFileSync(
			join(
				rendererLibDir,
				"agent-session-orchestrator/adapters/terminal-adapter.ts",
			),
			"utf-8",
		);
		const layoutSource = readFileSync(
			join(TASKS_VIEW_DIR, "../../../../layout.tsx"),
			"utf-8",
		);
		const writebackSource = readFileSync(
			join(rendererLibDir, "tasks/task-agent-writeback.ts"),
			"utf-8",
		);

		expect(adapterSource).toContain("registerTaskAgentWriteback");
		expect(layoutSource).toContain("syncTaskAgentWritebackOnStop");
		expect(writebackSource).toContain("tasksLocal.update.mutate");
		expect(writebackSource).toContain('event.eventType !== "Stop"');
		expect(writebackSource).toContain('return "completed";');
	});
});
