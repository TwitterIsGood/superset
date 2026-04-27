import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { ModelProxyStatus } from "shared/model-proxy";
import { openRotatingLogFd } from "main/lib/host-service-utils";
import {
	ensureModelProxyDaemonDir,
	isProcessAlive,
	modelProxyLogPath,
	modelProxySpawnLockPath,
	readModelProxyManifest,
	removeModelProxyManifest,
} from "./manifest";
import {
	MODEL_PROXY_HOST,
	MODEL_PROXY_PORT,
	MODEL_PROXY_PROTOCOL_VERSION,
	MODEL_PROXY_WORKSPACE_TOKEN,
	type ModelProxyDaemonHealth,
	type ModelProxyDaemonManifest,
} from "./types";

const START_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 1_500;
const HEALTH_POLL_INTERVAL_MS = 200;
const SPAWN_LOCK_TIMEOUT_MS = 10_000;
const MAX_DAEMON_LOG_BYTES = 5 * 1024 * 1024;

function endpoint(): string {
	return `http://${MODEL_PROXY_HOST}:${MODEL_PROXY_PORT}`;
}

function emptyStatus(lastError?: string): ModelProxyStatus {
	return {
		running: false,
		baseUrl: null,
		port: null,
		tokenConfigured: true,
		enabledProviderCount: 0,
		aggregatedModelCount: 0,
		lastError,
	};
}

function statusFromHealth(
	health: ModelProxyDaemonHealth,
	manifest: ModelProxyDaemonManifest,
): ModelProxyStatus {
	return {
		running: true,
		baseUrl: manifest.endpoint,
		port: health.port,
		tokenConfigured: manifest.workspaceToken.length > 0,
		enabledProviderCount: health.enabledProviderCount,
		aggregatedModelCount: health.aggregatedModelCount,
	};
}

function isHealth(value: unknown): value is ModelProxyDaemonHealth {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		record.ok === true &&
		typeof record.pid === "number" &&
		typeof record.startedAt === "number" &&
		typeof record.port === "number" &&
		typeof record.protocolVersion === "number" &&
		typeof record.enabledProviderCount === "number" &&
		typeof record.aggregatedModelCount === "number"
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ModelProxyDaemonManager {
	private startPromise: Promise<ModelProxyStatus> | null = null;

	async start(): Promise<ModelProxyStatus> {
		if (this.startPromise) return this.startPromise;
		this.startPromise = this.startInner().finally(() => {
			this.startPromise = null;
		});
		return this.startPromise;
	}

	ensureRunning(): Promise<ModelProxyStatus> {
		return this.start();
	}

	async restart(): Promise<ModelProxyStatus> {
		const manifest = readModelProxyManifest();
		if (manifest && isProcessAlive(manifest.pid)) {
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch (error) {
				return emptyStatus(
					`Failed to stop model proxy daemon: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			await this.waitForStop(manifest.pid);
		}
		removeModelProxyManifest();
		return this.start();
	}

	async status(): Promise<ModelProxyStatus> {
		const manifest = readModelProxyManifest();
		if (!manifest) return emptyStatus();
		const health = await this.fetchHealth(manifest);
		if (health) return statusFromHealth(health, manifest);
		if (!isProcessAlive(manifest.pid)) {
			removeModelProxyManifest();
			return emptyStatus();
		}
		return emptyStatus("Model proxy daemon is alive but not responding to health checks");
	}

	async getBaseUrl(): Promise<string | null> {
		const status = await this.status();
		return status.baseUrl;
	}

	getWorkspaceToken(): string {
		return MODEL_PROXY_WORKSPACE_TOKEN;
	}

	private async startInner(): Promise<ModelProxyStatus> {
		const existing = await this.tryAdopt();
		if (existing.running) return existing;

		if (!this.acquireSpawnLock()) {
			return this.waitForHealthyDaemon();
		}

		try {
			const adoptedAfterLock = await this.tryAdopt();
			if (adoptedAfterLock.running) return adoptedAfterLock;
			this.spawnDaemon();
			return this.waitForHealthyDaemon();
		} finally {
			this.releaseSpawnLock();
		}
	}

	private async tryAdopt(): Promise<ModelProxyStatus> {
		const manifest = readModelProxyManifest();
		if (!manifest) return emptyStatus();
		if (manifest.protocolVersion !== MODEL_PROXY_PROTOCOL_VERSION) {
			return emptyStatus("Model proxy daemon protocol version mismatch");
		}
		const health = await this.fetchHealth(manifest);
		if (health) return statusFromHealth(health, manifest);
		if (!isProcessAlive(manifest.pid)) {
			removeModelProxyManifest();
			return emptyStatus();
		}
		return emptyStatus("Existing model proxy daemon is not healthy");
	}

	private async fetchHealth(
		manifest: ModelProxyDaemonManifest,
	): Promise<ModelProxyDaemonHealth | null> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
		try {
			const response = await fetch(`${manifest.endpoint}/health`, {
				signal: controller.signal,
				headers: { authorization: `Bearer ${manifest.controlToken}` },
			});
			if (!response.ok) return null;
			const parsed = (await response.json()) as unknown;
			if (!isHealth(parsed)) return null;
			if (parsed.protocolVersion !== MODEL_PROXY_PROTOCOL_VERSION) return null;
			return parsed;
		} catch {
			return null;
		} finally {
			clearTimeout(timeout);
		}
	}

	private spawnDaemon(): void {
		const daemonScript = this.getDaemonScriptPath();
		if (!existsSync(daemonScript)) {
			throw new Error(`Model proxy daemon script not found: ${daemonScript}`);
		}

		const logFd = openRotatingLogFd(modelProxyLogPath(), MAX_DAEMON_LOG_BYTES);
		let child: ReturnType<typeof spawn> | null = null;
		try {
			child = spawn(process.execPath, [daemonScript], {
				detached: true,
				stdio: logFd >= 0 ? ["ignore", logFd, logFd] : "ignore",
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					NODE_ENV: process.env.NODE_ENV,
				},
			});
		} finally {
			if (logFd >= 0) {
				try {
					closeSync(logFd);
				} catch {
					// Best-effort cleanup.
				}
			}
		}
		if (!child) throw new Error("Failed to spawn model proxy daemon");
		child.unref();
	}

	private getDaemonScriptPath(): string {
		return join(app.getAppPath(), "dist", "main", "model-proxy.js");
	}

	private async waitForHealthyDaemon(): Promise<ModelProxyStatus> {
		const deadline = Date.now() + START_TIMEOUT_MS;
		let lastStatus = emptyStatus();
		while (Date.now() < deadline) {
			lastStatus = await this.tryAdopt();
			if (lastStatus.running) return lastStatus;
			await sleep(HEALTH_POLL_INTERVAL_MS);
		}
		return {
			...lastStatus,
			lastError:
				lastStatus.lastError ??
				`Model proxy daemon did not become healthy at ${endpoint()}`,
		};
	}

	private async waitForStop(pid: number): Promise<void> {
		const deadline = Date.now() + START_TIMEOUT_MS;
		while (Date.now() < deadline && isProcessAlive(pid)) {
			await sleep(HEALTH_POLL_INTERVAL_MS);
		}
	}

	private acquireSpawnLock(): boolean {
		ensureModelProxyDaemonDir();
		const lockPath = modelProxySpawnLockPath();
		try {
			if (existsSync(lockPath)) {
				const lockTime = Number.parseInt(readFileSync(lockPath, "utf-8"), 10);
				if (!Number.isNaN(lockTime) && Date.now() - lockTime < SPAWN_LOCK_TIMEOUT_MS) {
					return false;
				}
				unlinkSync(lockPath);
			}
			writeFileSync(lockPath, String(Date.now()), { encoding: "utf-8", mode: 0o600 });
			return true;
		} catch {
			return false;
		}
	}

	private releaseSpawnLock(): void {
		try {
			const lockPath = modelProxySpawnLockPath();
			if (existsSync(lockPath)) unlinkSync(lockPath);
		} catch {
			// Best-effort cleanup.
		}
	}
}

export const modelProxyDaemonManager = new ModelProxyDaemonManager();
