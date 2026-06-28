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
	test("TasksView does not block local tasks behind Linear", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).not.toContain("showLinearCTA");
		expect(source).not.toContain("<LinearCTA");
		expect(source).toContain("<TasksTopBar");
	});

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

	test("TasksView passes the project filter through board and table content", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).toContain("projectFilter={projectFilter}");
		expect(source).toContain("projects={v2Projects ?? []}");
		expect(source).toContain("isProjectlessTaskFilter(projectFilter)");
	});

	test("TasksView keeps board DnD off the default tasks route module graph", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).not.toContain(
			'import { BoardContent } from "./components/BoardContent"',
		);
		expect(source).not.toContain("@dnd-kit/");
		expect(source).toContain('import("./components/BoardContent")');
		expect(source).toContain('viewMode === "board"');
		expect(source).toContain("<Suspense fallback={null}>");
	});

	test("TasksView keeps PR and issue search content off the default tasks route module graph", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).not.toContain(
			'import { PullRequestsContent } from "./components/PullRequestsContent"',
		);
		expect(source).not.toContain(
			'import { GitHubIssuesContent } from "./components/GitHubIssuesContent"',
		);
		expect(source).toContain('import("./components/PullRequestsContent")');
		expect(source).toContain('import("./components/GitHubIssuesContent")');
		expect(source).toContain("import type { SelectedIssue }");
		expect(source).toContain('typeTab === "prs"');
		expect(source).toContain('typeTab === "issues"');
	});

	test("Tasks table and board avoid date-fns for short date labels", () => {
		const tableSource = readComponent("hooks/useTasksTable/useTasksTable.tsx");
		const boardCardSource = readComponent(
			"components/TasksBoardView/components/KanbanCard/KanbanCard.tsx",
		);
		const formatterSource = readComponent(
			"utils/formatTaskShortDate/formatTaskShortDate.ts",
		);

		for (const source of [tableSource, boardCardSource]) {
			expect(source).not.toContain('from "date-fns"');
			expect(source).toContain("formatTaskShortDate");
		}
		expect(formatterSource).toContain("Intl.DateTimeFormat");
	});

	test("Tasks search avoids building Fuse indexes on the default route", () => {
		const source = readComponent("hooks/useHybridSearch/useHybridSearch.ts");

		expect(source).not.toContain("fuse.js");
		expect(source).not.toContain("new Fuse");
		expect(source).toContain("includesSubsequence");
		expect(source).toContain("normalizeSearchText");
	});

	test("BoardContent is the first static boundary for task board DnD", () => {
		const boardContentSource = readComponent(
			"components/BoardContent/BoardContent.tsx",
		);
		const boardViewSource = readComponent(
			"components/TasksBoardView/TasksBoardView.tsx",
		);

		expect(boardContentSource).toContain(
			'import { TasksBoardView } from "../TasksBoardView"',
		);
		expect(boardViewSource).toContain('from "@dnd-kit/core"');
		expect(boardViewSource).toContain('from "@dnd-kit/sortable"');
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

	test("TasksTopBar keeps create task dialog off the default tasks route path", () => {
		const source = readComponent("components/TasksTopBar/TasksTopBar.tsx");

		expect(source).not.toContain(
			'import { CreateTaskDialog } from "./components/CreateTaskDialog"',
		);
		expect(source).toContain('import("./components/CreateTaskDialog")');
		expect(source).toContain("isCreateTaskOpen ? (");
		expect(source).toContain("<Suspense fallback={null}>");
	});

	test("TasksTopBar keeps batch workspace popovers off the unselected tasks route path", () => {
		const source = readComponent("components/TasksTopBar/TasksTopBar.tsx");

		expect(source).not.toContain(
			'import { RunInWorkspacePopoverV2 } from "./components/RunInWorkspacePopoverV2"',
		);
		expect(source).not.toContain(
			'import { RunIssuesInWorkspacePopover } from "./components/RunIssuesInWorkspacePopover"',
		);
		expect(source).not.toContain("useTrellisRuntimePack");
		expect(source).toContain('import("./components/RunInWorkspacePopoverV2")');
		expect(source).toContain(
			'import("./components/RunIssuesInWorkspacePopover")',
		);
		expect(source).toContain("hasSelection");
	});

	test("ProjectFilter reuses the TasksView project query instead of opening a duplicate live query", () => {
		const topBarSource = readComponent(
			"components/TasksTopBar/TasksTopBar.tsx",
		);
		const projectFilterSource = readComponent(
			"components/TasksTopBar/components/ProjectFilter/ProjectFilter.tsx",
		);
		const menuContentSource = readComponent(
			"components/TasksTopBar/components/ProjectFilter/components/ProjectFilterMenuContent/ProjectFilterMenuContent.tsx",
		);

		expect(topBarSource).toContain("projects={projects}");
		expect(projectFilterSource).toContain("projects: ProjectFilterProject[]");
		expect(projectFilterSource).not.toContain("useLiveQuery");
		expect(projectFilterSource).not.toContain("useCollections");
		expect(projectFilterSource).not.toContain('from "@superset/ui/command"');
		expect(projectFilterSource).not.toContain("PopoverContent");
		expect(projectFilterSource).toContain(
			'"./components/ProjectFilterMenuContent/ProjectFilterMenuContent"',
		);
		expect(menuContentSource).toContain('from "@superset/ui/command"');
		expect(menuContentSource).toContain("PopoverContent");
	});

	test("AssigneeFilter keeps people and task scans behind the opened menu chunk", () => {
		const assigneeFilterSource = readComponent(
			"components/TasksTopBar/components/AssigneeFilter/AssigneeFilter.tsx",
		);
		const menuContentSource = readComponent(
			"components/TasksTopBar/components/AssigneeFilter/components/AssigneeFilterMenuContent/AssigneeFilterMenuContent.tsx",
		);

		expect(assigneeFilterSource).not.toContain("useLiveQuery");
		expect(assigneeFilterSource).not.toContain("useCollections");
		expect(assigneeFilterSource).not.toContain('from "@superset/ui/command"');
		expect(assigneeFilterSource).not.toContain(
			'from "@superset/ui/atoms/Avatar"',
		);
		expect(assigneeFilterSource).toContain(
			'"./components/AssigneeFilterMenuContent/AssigneeFilterMenuContent"',
		);
		expect(assigneeFilterSource).toContain("open ? (");
		expect(menuContentSource).toContain("useLiveQuery");
		expect(menuContentSource).toContain("collections.tasks");
		expect(menuContentSource).toContain("assigneeExternalId");
	});

	test("StatusFilter keeps command menu UI behind the opened menu chunk", () => {
		const statusFilterSource = readComponent(
			"components/TasksTopBar/components/StatusFilter/StatusFilter.tsx",
		);
		const menuContentSource = readComponent(
			"components/TasksTopBar/components/StatusFilter/components/StatusFilterMenuContent/StatusFilterMenuContent.tsx",
		);

		expect(statusFilterSource).not.toContain('from "@superset/ui/command"');
		expect(statusFilterSource).not.toContain("PopoverContent");
		expect(statusFilterSource).toContain(
			'"./components/StatusFilterMenuContent/StatusFilterMenuContent"',
		);
		expect(statusFilterSource).toContain("open ? (");
		expect(menuContentSource).toContain('from "@superset/ui/command"');
		expect(menuContentSource).toContain("PopoverContent");
	});

	test("TasksTopBar does not pull the full lucide barrel into the tasks route", () => {
		const source = readComponent("components/TasksTopBar/TasksTopBar.tsx");

		expect(source).not.toContain('from "lucide-react"');
		expect(source).toContain('from "lucide-react/dist/esm/icons/search.js"');
		expect(source).toContain(
			'from "lucide-react/dist/esm/icons/square-pen.js"',
		);
	});

	test("Default tasks table path avoids the lucide barrel", () => {
		const defaultPathSources = [
			"components/TableContent/TableContent.tsx",
			"hooks/useTasksTable/useTasksTable.tsx",
			"hooks/useTasksTable/components/AssigneeCell/AssigneeCell.tsx",
			"components/TasksTopBar/components/ProjectFilter/ProjectFilter.tsx",
			"components/TasksTopBar/components/StatusFilter/StatusFilter.tsx",
			"components/TasksTopBar/components/AssigneeFilter/AssigneeFilter.tsx",
			"components/shared/icons/AllIssuesIcon/AllIssuesIcon.tsx",
		];

		for (const relativePath of defaultPathSources) {
			const source = readComponent(relativePath);

			expect(source).not.toContain('from "lucide-react"');
			expect(source).toContain('from "lucide-react/dist/esm/icons/');
		}
	});

	test("AssigneeCell users query is gated until its dropdown opens", () => {
		const source = readComponent(
			"hooks/useTasksTable/components/AssigneeCell/AssigneeCell.tsx",
		);

		expect(source).toContain(
			"(open ? q.from({ users: collections.users }) : null)",
		);
		expect(source).toContain("[collections, open]");
	});

	test("CreateTaskDialog sends rich local task fields", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx",
		);

		expect(source).toContain("dueDate:");
		expect(source).toContain("labels,");
		expect(source).toContain("v2ProjectId,");
		expect(source).toContain("generateTaskDraft");
	});

	test("CreateTaskDialog seeds the local task row before navigating to detail", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx",
		);
		const localUpsertIndex = source.indexOf(
			"collections.tasks.utils.upsertSyncedRow(result.task)",
		);
		const navigateIndex = source.indexOf("navigate({");

		expect(source).toContain("collections.tasks.startSyncImmediate();");
		expect(localUpsertIndex).toBeGreaterThan(-1);
		expect(navigateIndex).toBeGreaterThan(-1);
		expect(localUpsertIndex).toBeLessThan(navigateIndex);
	});

	test("CreateTaskDialog uses inline AI polish without dormant attachment or native date controls", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx",
		);

		expect(source).toContain("AI polish");
		expect(source).toContain("buildTaskPolishPrompt");
		expect(source).toContain("CreateTaskDueDatePicker");
		expect(source).not.toContain("roughPrompt");
		expect(source).not.toContain("Attachments are not wired yet");
		expect(source).not.toContain("HiOutlinePaperClip");
		expect(source).not.toContain('type="date"');
	});

	test("CreateTaskDueDatePicker uses the shared calendar instead of a native date input", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/components/CreateTaskDueDatePicker/CreateTaskDueDatePicker.tsx",
		);

		expect(source).toContain('from "@superset/ui/calendar"');
		expect(source).toContain("<Calendar");
		expect(source).not.toContain('type="date"');
	});

	test("Task-driven workspace creation exposes Trellis initialization", () => {
		const taskDetailSource = readComponent(
			"../../$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx",
		);
		const taskBatchSource = readComponent(
			"components/TasksTopBar/components/RunInWorkspacePopoverV2/RunInWorkspacePopoverV2.tsx",
		);
		const issueBatchSource = readComponent(
			"components/TasksTopBar/components/RunIssuesInWorkspacePopover/RunIssuesInWorkspacePopover.tsx",
		);

		for (const source of [
			taskDetailSource,
			taskBatchSource,
			issueBatchSource,
		]) {
			expect(source).toContain("TrellisSetupRow");
			expect(source).toContain("useState(true)");
			expect(source).toContain("useTrellisRuntimePack");
			expect(source).toContain("prepareTrellisSetup");
			expect(source).toContain("useLocalPack: hostId === machineId");
			expect(source).toContain("trellisSetup,");
			expect(source).toContain("trellisRuntimePack.isResolving");
			expect(source).toContain("allowProjectPreparation");
			expect(source).not.toContain("Project not set up on this host");
			expect(source).not.toContain("Checking host…");
		}
	});

	test("Task detail Open in Workspace keeps narrow sidebar controls constrained", () => {
		const taskDetailSource = readComponent(
			"../../$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx",
		);

		expect(taskDetailSource).toContain(
			'className="h-8 w-full max-w-full min-w-0"',
		);
		expect(taskDetailSource).toContain(
			'triggerClassName="h-8 w-full min-w-0 max-w-full text-xs"',
		);
		expect(taskDetailSource).toContain(
			'className="min-w-0 max-w-full overflow-hidden"',
		);
	});
});
