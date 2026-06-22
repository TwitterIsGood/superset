/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "WorkspacesScreen.tsx"),
	"utf8",
);

describe("WorkspacesScreen", () => {
	test("renders cached or API fallback workspace rows before declaring an empty state", () => {
		expect(SOURCE).toContain("apiClient.v2Workspace.list");
		expect(SOURCE).toContain("apiClient.host.list");
		expect(SOURCE).toContain("effectiveWorkspaces");
		expect(SOURCE).toContain("effectiveProjects");
		expect(SOURCE).toContain("effectiveHosts");
		expect(SOURCE).toContain("fallbackHostAccesses ?? hostAccesses");
		expect(SOURCE).toContain("WorkspaceListSkeleton");
		expect(SOURCE).toContain("WorkspaceEmptyState");
	});

	test("reserves bottom inset for the final workspace row", () => {
		expect(SOURCE).toContain("getBottomOverlayScrollPadding");
		expect(SOURCE).toContain("getBottomOverlayListFooterHeight");
		expect(SOURCE).toContain("const bottomOverlayPadding");
		expect(SOURCE).toContain("const bottomOverlayFooterHeight");
		expect(SOURCE).toContain(
			'return (\n\t\t<View className="flex-1 bg-[#050507]">',
		);
		expect(SOURCE).toContain("style={{ flex: 1 }}");
		expect(SOURCE).not.toContain("marginBottom: bottomOverlayPadding");
		expect(SOURCE).toContain("paddingBottom: bottomOverlayPadding");
		expect(SOURCE).toContain("contentInset={{ bottom: bottomOverlayPadding }}");
		expect(SOURCE).toContain(
			"scrollIndicatorInsets={{ bottom: bottomOverlayPadding }}",
		);
		expect(SOURCE).toContain(
			"<View style={{ height: bottomOverlayFooterHeight }} />",
		);
	});

	test("follows the Codex iOS project switcher shape", () => {
		expect(SOURCE).toContain("expo-glass-effect");
		expect(SOURCE).toContain("ActionSheetIOS");
		expect(SOURCE).toContain("OrganizationSwitcherSheet");
		expect(SOURCE).toContain("AdaptiveGlassCapsule");
		expect(SOURCE).toContain("selectedHostId");
		expect(SOURCE).toContain("searchQuery");
		expect(SOURCE).toContain("organizationSheetOpen");
		expect(SOURCE).toContain("showNativeHomeActions");
		expect(SOURCE).toContain("handleSwitchOrganization");
		expect(SOURCE).toContain("filteredWorkspaceGroups");
		expect(SOURCE).toContain("ListFilter");
		expect(SOURCE).toContain('accessibilityLabel="Switch organization"');
		expect(SOURCE).toContain('accessibilityLabel="More options"');
		expect(SOURCE).toContain('router.push("/(authenticated)/(more)/settings")');
		expect(SOURCE).toContain("switchOrganization(organizationId)");
		expect(SOURCE).toContain('options: ["取消", "设置", "刷新"]');
		expect(SOURCE).toContain('pathname: "/workspaces/[id]"');
		expect(SOURCE).not.toContain(
			'pathname: "/(authenticated)/(home)/workspaces/[id]"',
		);
		expect(SOURCE).toContain("Superset");
		expect(SOURCE).toContain("全部");
		expect(SOURCE).toContain("项目");
		expect(SOURCE).toContain('placeholder="搜索项目或 Worktree"');
		expect(SOURCE).toContain("聊天");
		expect(SOURCE).toContain('accessibilityLabel="Open latest session"');
		expect(SOURCE).toContain("SquarePen");
		expect(SOURCE).not.toContain(">Sessions<");
		expect(SOURCE).not.toContain("AuthenticatedTabBar");
	});
});
