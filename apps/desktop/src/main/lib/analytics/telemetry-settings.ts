import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";

interface TelemetrySettingsFile {
	enabled?: unknown;
	updatedAt?: unknown;
}

const TELEMETRY_SETTINGS_FILE_NAME = "telemetry.json";
const TELEMETRY_HOME_DIR = process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR;
let telemetryHomeDirOverrideForTests: string | null = null;

export function setTelemetryHomeDirOverrideForTests(path: string | null): void {
	if (process.env.NODE_ENV !== "test") {
		throw new Error("Telemetry home dir override is only available in tests");
	}
	telemetryHomeDirOverrideForTests = path;
}

export function getTelemetrySettingsPath(): string {
	return join(
		telemetryHomeDirOverrideForTests ?? TELEMETRY_HOME_DIR,
		TELEMETRY_SETTINGS_FILE_NAME,
	);
}

function readSettingsFile(): TelemetrySettingsFile | null {
	const path = getTelemetrySettingsPath();
	if (!existsSync(path)) return null;

	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as TelemetrySettingsFile)
			: null;
	} catch {
		return null;
	}
}

export function isTelemetryEnabled(): boolean {
	const settings = readSettingsFile();
	return typeof settings?.enabled === "boolean"
		? settings.enabled
		: DEFAULT_TELEMETRY_ENABLED;
}

export function setTelemetryEnabled(enabled: boolean): void {
	const path = getTelemetrySettingsPath();
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: SUPERSET_HOME_DIR_MODE });
	try {
		chmodSync(dir, SUPERSET_HOME_DIR_MODE);
	} catch {
		// Best-effort permission repair.
	}

	const tempPath = join(dir, `.${randomUUID()}.${process.pid}.telemetry.tmp`);
	writeFileSync(
		tempPath,
		`${JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2)}\n`,
		{ mode: SUPERSET_SENSITIVE_FILE_MODE },
	);
	try {
		chmodSync(tempPath, SUPERSET_SENSITIVE_FILE_MODE);
	} catch {
		// Best-effort permission repair.
	}

	try {
		renameSync(tempPath, path);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {
			// Ignore cleanup failures after the original write failure.
		}
		throw error;
	}

	try {
		chmodSync(path, SUPERSET_SENSITIVE_FILE_MODE);
	} catch {
		// Best-effort permission repair.
	}
}
