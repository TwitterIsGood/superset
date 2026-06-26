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
});
