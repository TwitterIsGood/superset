import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";
import {
	getTelemetrySettingsPath,
	isTelemetryEnabled,
	setTelemetryEnabled,
	setTelemetryHomeDirOverrideForTests,
} from "./telemetry-settings";

let tempHome = "";

beforeEach(() => {
	tempHome = mkdtempSync(join(tmpdir(), "superset-telemetry-"));
	setTelemetryHomeDirOverrideForTests(tempHome);
});

afterEach(() => {
	setTelemetryHomeDirOverrideForTests(null);
	if (tempHome) {
		rmSync(tempHome, { recursive: true, force: true });
	}
});

describe("telemetry settings persistence", () => {
	test("uses the product default when no local setting exists", () => {
		expect(isTelemetryEnabled()).toBe(DEFAULT_TELEMETRY_ENABLED);
	});

	test("persists opt-out state in the Superset home profile", () => {
		setTelemetryEnabled(false);

		expect(isTelemetryEnabled()).toBe(false);
		expect(getTelemetrySettingsPath()).toBe(join(tempHome, "telemetry.json"));

		const raw = JSON.parse(readFileSync(getTelemetrySettingsPath(), "utf-8"));
		expect(raw.enabled).toBe(false);
		expect(typeof raw.updatedAt).toBe("string");
	});

	test("falls back to the product default for invalid local JSON", () => {
		writeFileSync(getTelemetrySettingsPath(), "{not-json", "utf-8");

		expect(isTelemetryEnabled()).toBe(DEFAULT_TELEMETRY_ENABLED);
	});

	test("writes the file with owner-only permissions when supported", () => {
		setTelemetryEnabled(true);

		const path = getTelemetrySettingsPath();
		expect(existsSync(path)).toBe(true);

		chmodSync(path, 0o644);
		setTelemetryEnabled(false);

		const mode = statSync(path).mode & 0o777;
		expect(mode & 0o077).toBe(0);
	});
});
