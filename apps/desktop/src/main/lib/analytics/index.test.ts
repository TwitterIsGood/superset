import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldTrackAnalytics } from "./telemetry-gate";

describe("main analytics telemetry gate", () => {
	test("requires both a user id and enabled local telemetry", () => {
		expect(shouldTrackAnalytics("user-1", false)).toBe(false);
		expect(shouldTrackAnalytics(null, true)).toBe(false);
		expect(shouldTrackAnalytics("user-1", true)).toBe(true);
	});

	test("keeps track() wired through persisted telemetry settings", () => {
		const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

		expect(source).toContain("shouldTrackAnalytics");
		expect(source).toContain("isTelemetryEnabled()");
		expect(source).toContain("return;");
	});
});
