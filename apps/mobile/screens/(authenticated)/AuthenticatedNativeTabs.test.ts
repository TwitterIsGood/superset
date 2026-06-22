/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "../../app/(authenticated)/_layout.tsx"),
	"utf8",
);

describe("authenticated native tab layout", () => {
	test("uses Expo NativeTabs instead of the old custom footer", () => {
		expect(SOURCE).toContain(
			'import { NativeTabs } from "expo-router/unstable-native-tabs";',
		);
		expect(SOURCE).toContain("<NativeTabs");
		expect(SOURCE).toContain('minimizeBehavior="onScrollDown"');
		expect(SOURCE).toContain('blurEffect="systemChromeMaterialDark"');
		expect(SOURCE).toContain('<NativeTabs.Trigger name="(home)">');
		expect(SOURCE).toContain('<NativeTabs.Trigger name="(tasks)">');
		expect(SOURCE).toContain('<NativeTabs.Trigger name="(more)">');
		expect(SOURCE).toContain("<NativeTabs.Trigger.Label>项目");
		expect(SOURCE).toContain("<NativeTabs.Trigger.Label>任务");
		expect(SOURCE).toContain("<NativeTabs.Trigger.Label>设置");
		expect(SOURCE).not.toContain("AuthenticatedTabBar");
		expect(SOURCE).not.toContain("expo-router/ui");
	});

	test("hides native tabs only for workspace detail chrome", () => {
		expect(SOURCE).toContain("routeOwnsHiddenNativeTabs");
		expect(SOURCE).toContain('segments.includes("workspaces")');
		expect(SOURCE).toContain('pathname.includes("/workspaces/")');
		expect(SOURCE).toContain("hidden={hideNativeTabs}");
		expect(SOURCE).toContain(
			"isTabBarHidden && routeOwnsHiddenNativeTabs({ pathname, segments })",
		);
	});
});
