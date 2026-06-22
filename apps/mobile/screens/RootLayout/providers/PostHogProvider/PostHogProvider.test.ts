/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "PostHogProvider.tsx"),
	"utf8",
);

describe("PostHogProvider", () => {
	test("disables automatic screen capture under expo-router", () => {
		expect(SOURCE).toContain("captureScreens: false");
		expect(SOURCE).toContain("captureTouches: true");
		expect(SOURCE).not.toContain("usePathname");
	});
});
