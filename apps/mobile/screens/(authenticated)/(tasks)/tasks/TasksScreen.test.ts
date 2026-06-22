/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "TasksScreen.tsx"), "utf8");

describe("TasksScreen", () => {
	test("uses a protected API fallback instead of leaving Electric-unready tasks on skeleton rows", () => {
		expect(SOURCE).toContain("apiClient.task.list.query");
		expect(SOURCE).toContain("apiClient.task.statuses.list.query");
		expect(SOURCE).toContain("loadFallbackTasks");
		expect(SOURCE).toContain("Live task sync unavailable");
		expect(SOURCE).toContain("Tasks could not load");
		expect(SOURCE).toContain("TaskListSkeleton");
		expect(SOURCE).toContain("fallbackFinished");
		expect(SOURCE).toContain(
			"const isReady = electricReady || fallbackFinished",
		);
	});

	test("reserves bottom inset for authenticated bottom controls", () => {
		expect(SOURCE).toContain("getBottomOverlayScrollPadding");
		expect(SOURCE).toContain("getBottomOverlayListFooterHeight");
		expect(SOURCE).toContain("const bottomOverlayPadding");
		expect(SOURCE).toContain("const bottomOverlayFooterHeight");
		expect(SOURCE).not.toContain("useWindowDimensions");
		expect(SOURCE).not.toContain("listViewportHeight");
		expect(SOURCE).toContain("style={{ flex: 1 }}");
		expect(SOURCE).toContain("paddingBottom: bottomOverlayPadding");
		expect(SOURCE).toContain("contentInset={{ bottom: bottomOverlayPadding }}");
		expect(SOURCE).toContain(
			"scrollIndicatorInsets={{ bottom: bottomOverlayPadding }}",
		);
		expect(SOURCE).toContain(
			"<View style={{ height: bottomOverlayFooterHeight }} />",
		);
		expect(SOURCE).not.toContain("marginBottom: bottomOverlayPadding");
		expect(SOURCE).toContain("ScrollView");
		expect(SOURCE).toContain("RefreshControl");
		expect(SOURCE).toContain('contentInsetAdjustmentBehavior="automatic"');
		expect(SOURCE).toContain('className="gap-0 px-5 py-5"');
		expect(SOURCE).toContain("bg-[#050507]");
		expect(SOURCE).toContain("任务");
		expect(SOURCE).toContain('accessibilityLabel="Refresh tasks"');
		expect(SOURCE).not.toContain("FlatList");
		expect(SOURCE).toContain('keyboardShouldPersistTaps="handled"');
		expect(SOURCE).toContain("scrollEnabled");
	});

	test("uses a native iOS prompt and compact header capsule for task creation", () => {
		expect(SOURCE).toContain("apiClient.task.create.mutate");
		expect(SOURCE).toContain("Alert.prompt");
		expect(SOURCE).toContain('Platform.OS === "ios"');
		expect(SOURCE).toContain("showCreateTaskPrompt");
		expect(SOURCE).toContain("handleCreateTask");
		expect(SOURCE).toContain("createdTasks");
		expect(SOURCE).toContain("Task could not be created");
		expect(SOURCE).toContain('accessibilityLabel="Create task"');
		expect(SOURCE).toContain('accessibilityLabel="Refresh tasks"');
		expect(SOURCE).toContain(
			'className="h-12 flex-row items-center rounded-full',
		);
		expect(SOURCE).toContain('priority: "none"');
		expect(SOURCE).not.toContain("TaskCreateScreen");
	});
});
