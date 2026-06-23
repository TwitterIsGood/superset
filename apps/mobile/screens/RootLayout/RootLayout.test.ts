/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_LAYOUT_SOURCE = readFileSync(
	join(import.meta.dir, "RootLayout.tsx"),
	{
		encoding: "utf8",
	},
);
const APP_CONFIG_SOURCE = readFileSync(
	join(import.meta.dir, "../../app.config.ts"),
	{ encoding: "utf8" },
);

describe("RootLayout development chrome", () => {
	test("hides the Expo dev-menu floating button so it cannot cover mobile acceptance UI", () => {
		expect(ROOT_LAYOUT_SOURCE).toContain(
			'import { requireOptionalNativeModule } from "expo-modules-core";',
		);
		expect(ROOT_LAYOUT_SOURCE).toContain("DevMenuPreferences");
		expect(ROOT_LAYOUT_SOURCE).toContain("showFloatingActionButton: false");
		expect(ROOT_LAYOUT_SOURCE).toContain(
			"useHideDevMenuFloatingActionButton();",
		);
		expect(APP_CONFIG_SOURCE).toContain(
			"EXDevMenuShowFloatingActionButton: false",
		);
		expect(APP_CONFIG_SOURCE).toContain("override: false");
		expect(APP_CONFIG_SOURCE).toContain("NSExceptionDomains");
		expect(APP_CONFIG_SOURCE).toContain("getIosAtsExceptionDomains(mobileEnv)");
	});
});
