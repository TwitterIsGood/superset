/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "TaskDetailScreen.tsx"),
	"utf8",
);

describe("TaskDetailScreen", () => {
	test("falls back to protected API snapshot when Electric task rows are not ready", () => {
		expect(SOURCE).toContain("apiClient.task.byIdOrSlug.query");
		expect(SOURCE).toContain("apiClient.task.statuses.list.query");
		expect(SOURCE).toContain('fallbackStatus === "error"');
		expect(SOURCE).toContain("Task could not load");
	});

	test("reserves bottom inset for the final detail action", () => {
		expect(SOURCE).toContain("getBottomOverlayScrollPadding");
		expect(SOURCE).toContain("getBottomOverlayListFooterHeight");
		expect(SOURCE).toContain("const bottomOverlayPadding");
		expect(SOURCE).toContain("const bottomOverlayFooterHeight");
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

	test("opens linked workspaces with internal Expo Router paths", () => {
		expect(SOURCE).toContain('pathname: "/workspaces/[id]"');
		expect(SOURCE).not.toContain(
			'pathname: "/(authenticated)/(home)/workspaces/[id]"',
		);
	});
});
