import { describe, expect, test } from "bun:test";

const workspaceSidebarSource = await Bun.file(
	new URL("./WorkspaceSidebar.tsx", import.meta.url),
).text();

describe("WorkspaceSidebar lazy tabs", () => {
	test("keeps heavy tab hooks out of the always-mounted sidebar shell", () => {
		expect(workspaceSidebarSource).not.toContain("useChangesTab(");
		expect(workspaceSidebarSource).not.toContain("useReviewTab(");
		expect(workspaceSidebarSource).not.toContain(
			'import { FilesTab } from "./components/FilesTab"',
		);
		expect(workspaceSidebarSource).not.toContain(
			'import { ChangesSidebarTab } from "./components/ChangesSidebarTab"',
		);
		expect(workspaceSidebarSource).not.toContain(
			'import { ReviewSidebarTab } from "./components/ReviewSidebarTab"',
		);
		expect(workspaceSidebarSource).not.toContain(
			'import { ModelsTab } from "./components/ModelsTab"',
		);
		expect(workspaceSidebarSource).toContain('import("./components/FilesTab")');
		expect(workspaceSidebarSource).toContain(
			'import("./components/ChangesSidebarTab")',
		);
		expect(workspaceSidebarSource).toContain(
			'import("./components/ReviewSidebarTab")',
		);
		expect(workspaceSidebarSource).toContain(
			'import("./components/ModelsTab")',
		);
		expect(workspaceSidebarSource).toContain('enabled: activeTab === "review"');
	});

	test("keeps visited heavy tabs warm without importing them eagerly", () => {
		expect(workspaceSidebarSource).toContain("KEEP_WARM_SIDEBAR_TAB_IDS");
		expect(workspaceSidebarSource).toContain(
			"LARGE_CHANGESET_KEEP_WARM_THRESHOLD",
		);
		expect(workspaceSidebarSource).toContain('"files"');
		expect(workspaceSidebarSource).toContain('"changes"');
		expect(workspaceSidebarSource).toContain("visitedWarmTabs");
		expect(workspaceSidebarSource).toContain("aria-hidden={!isActive}");
		expect(workspaceSidebarSource).toContain(
			"inert={isActive ? undefined : true}",
		);
		expect(workspaceSidebarSource).toContain(
			"invisible pointer-events-none absolute inset-0 z-0 flex",
		);
	});
});
