import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import type { ModelProxyDaemonManifest } from "./types";

const MODEL_PROXY_DIR = join(SUPERSET_HOME_DIR, "model-proxy");
const MANIFEST_PATH = join(MODEL_PROXY_DIR, "daemon-manifest.json");
const CONTROL_TOKEN_PATH = join(MODEL_PROXY_DIR, "daemon-control.token");
const SPAWN_LOCK_PATH = join(MODEL_PROXY_DIR, "daemon.spawn.lock");
const LOG_PATH = join(MODEL_PROXY_DIR, "daemon.log");

export function modelProxyDaemonDir(): string {
	return MODEL_PROXY_DIR;
}

export function modelProxyManifestPath(): string {
	return MANIFEST_PATH;
}

export function modelProxyControlTokenPath(): string {
	return CONTROL_TOKEN_PATH;
}

export function modelProxySpawnLockPath(): string {
	return SPAWN_LOCK_PATH;
}

export function modelProxyLogPath(): string {
	return LOG_PATH;
}

export function ensureModelProxyDaemonDir(): void {
	ensureSupersetHomeDirExists();
	if (!existsSync(MODEL_PROXY_DIR)) {
		mkdirSync(MODEL_PROXY_DIR, {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
	}
}

function isManifest(value: unknown): value is ModelProxyDaemonManifest {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.pid === "number" &&
		typeof record.endpoint === "string" &&
		typeof record.controlToken === "string" &&
		typeof record.workspaceToken === "string" &&
		typeof record.startedAt === "number" &&
		typeof record.protocolVersion === "number"
	);
}

export function writeModelProxyManifest(
	manifest: ModelProxyDaemonManifest,
): void {
	ensureModelProxyDaemonDir();
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`, {
		encoding: "utf-8",
		mode: SUPERSET_SENSITIVE_FILE_MODE,
	});
}

export function readModelProxyManifest(): ModelProxyDaemonManifest | null {
	try {
		if (!existsSync(MANIFEST_PATH)) return null;
		const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as unknown;
		return isManifest(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function removeModelProxyManifest(): void {
	try {
		if (existsSync(MANIFEST_PATH)) unlinkSync(MANIFEST_PATH);
	} catch {
		// Best-effort cleanup.
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
