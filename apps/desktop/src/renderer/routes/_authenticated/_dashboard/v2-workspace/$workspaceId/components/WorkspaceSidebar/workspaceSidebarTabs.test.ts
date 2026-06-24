import { describe, expect, test } from "bun:test";
import {
	isSidebarTabId,
	resolveWorkspaceSidebarActiveTab,
} from "./workspaceSidebarTabs";

describe("workspace sidebar tabs", () => {
	test("accepts only workspace sidebar tab ids", () => {
		expect(isSidebarTabId("files")).toBe(true);
		expect(isSidebarTabId("changes")).toBe(true);
		expect(isSidebarTabId("review")).toBe(true);
		expect(isSidebarTabId("models")).toBe(true);
		expect(isSidebarTabId("rightSidebarTab")).toBe(false);
	});

	test("falls back per workspace row instead of using a global tab value", () => {
		expect(resolveWorkspaceSidebarActiveTab("files")).toBe("files");
		expect(resolveWorkspaceSidebarActiveTab("models")).toBe("models");
		expect(resolveWorkspaceSidebarActiveTab("rightSidebarTab")).toBe("changes");
		expect(resolveWorkspaceSidebarActiveTab(null)).toBe("changes");
	});
});
