import { spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	linkSync,
	openSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { openRotatingLogFd } from "main/lib/host-service-utils";
import type {
	ModelProxyStatus,
	ModelProxyStatusCode,
} from "shared/model-proxy";
import {
	ensureModelProxyDaemonDir,
	isProcessAlive,
	modelProxyLogPath,
	modelProxySpawnLockPath,
	readModelProxyManifest,
	removeModelProxyControlState,
	removeModelProxyManifest,
	removeModelProxySpawnLock,
} from "./manifest";
import {
	MODEL_PROXY_IDENTITY_PATH,
	MODEL_PROXY_PORT,
	MODEL_PROXY_PROTOCOL_VERSION,
	MODEL_PROXY_SERVICE,
	MODEL_PROXY_WORKSPACE_TOKEN,
	type ModelProxyDaemonHealth,
	type ModelProxyDaemonIdentity,
	type ModelProxyDaemonManifest,
	modelProxyEndpoint,
} from "./types";

const START_TIMEOUT_MS = process.env.NODE_ENV === "test" ? 250 : 10_000;
const HEALTH_TIMEOUT_MS = process.env.NODE_ENV === "test" ? 100 : 1_500;
const HEALTH_POLL_INTERVAL_MS = process.env.NODE_ENV === "test" ? 10 : 200;
const SPAWN_LOCK_TIMEOUT_MS = 10_000;
const MAX_DAEMON_LOG_BYTES = 5 * 1024 * 1024;

interface SpawnLockMetadata {
	ownerId: string;
	createdAt: number;
}

interface HealthProbeResult {
	status: "healthy" | "unauthorized" | "protocol_mismatch" | "unavailable";
	health?: ModelProxyDaemonHealth;
	lastError?: string;
}

interface PortProbeResult {
	status: "free" | "superset" | "other" | "timeout";
	identity?: ModelProxyDaemonIdentity;
	lastError?: string;
}

function endpoint(): string {
	return modelProxyEndpoint();
}

function manifestMatchesConfiguredPort(
	manifest: ModelProxyDaemonManifest,
): boolean {
	return manifest.endpoint === endpoint();
}

function createStatus({
	statusCode,
	lastError,
	port = null,
}: {
	statusCode: ModelProxyStatusCode;
	lastError?: string;
	port?: number | null;
}): ModelProxyStatus {
	return {
		running: false,
		statusCode,
		baseUrl: null,
		port,
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
		statusCode: "running",
		baseUrl: manifest.endpoint,
		port: health.port,
		tokenConfigured: manifest.workspaceToken.length > 0,
		enabledProviderCount: 0,
		aggregatedModelCount: 0,
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
		typeof record.protocolVersion === "number"
	);
}

function isIdentity(value: unknown): value is ModelProxyDaemonIdentity {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		record.service === MODEL_PROXY_SERVICE &&
		typeof record.protocolVersion === "number" &&
		typeof record.pid === "number" &&
		typeof record.startedAt === "number" &&
		typeof record.port === "number"
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function errorCauseCode(error: unknown): string | undefined {
	if (!(error instanceof Error) || !("cause" in error)) return undefined;
	const cause = error.cause;
	if (typeof cause !== "object" || cause === null) return undefined;
	const code = (cause as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function createSpawnLockMetadata(): SpawnLockMetadata {
	return {
		ownerId: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		createdAt: Date.now(),
	};
}

function parseSpawnLockMetadata(raw: string): SpawnLockMetadata | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		const record = parsed as Record<string, unknown>;
		if (
			typeof record.ownerId !== "string" ||
			typeof record.createdAt !== "number"
		) {
			return null;
		}
		return { ownerId: record.ownerId, createdAt: record.createdAt };
	} catch {
		const createdAt = Number.parseInt(raw, 10);
		return Number.isNaN(createdAt) ? null : { ownerId: "legacy", createdAt };
	}
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
		const ownedDaemon = await this.findOwnedSupersetDaemon();
		if (ownedDaemon) {
			const stopped = await this.stopKnownSupersetDaemon(ownedDaemon.pid);
			if (!stopped) {
				return createStatus({
					statusCode: "health_unavailable",
					lastError: `Timed out stopping Superset model proxy daemon ${ownedDaemon.pid}`,
					port: ownedDaemon.port,
				});
			}
		} else {
			const portProbe = await this.probePortIdentity();
			if (portProbe.status !== "free")
				return this.statusFromPortProbe(portProbe);
		}
		removeModelProxyControlState();
		return this.start();
	}

	async status(): Promise<ModelProxyStatus> {
		return this.discover({ allowCleanup: true });
	}

	async getBaseUrl(): Promise<string | null> {
		const status = await this.status();
		return status.baseUrl;
	}

	getWorkspaceToken(): string {
		return MODEL_PROXY_WORKSPACE_TOKEN;
	}

	private async startInner(): Promise<ModelProxyStatus> {
		const existing = await this.discover({ allowCleanup: true });
		if (existing.running || existing.statusCode !== "stopped") return existing;

		if (!this.acquireSpawnLock()) {
			return this.waitForHealthyDaemon();
		}

		try {
			const adoptedAfterLock = await this.discover({ allowCleanup: true });
			if (
				adoptedAfterLock.running ||
				adoptedAfterLock.statusCode !== "stopped"
			) {
				return adoptedAfterLock;
			}
			const spawnStatus = this.spawnDaemon();
			if (spawnStatus) return spawnStatus;
			return this.waitForHealthyDaemon();
		} finally {
			this.releaseSpawnLock();
		}
	}

	private async discover({
		allowCleanup,
	}: {
		allowCleanup: boolean;
	}): Promise<ModelProxyStatus> {
		const manifest = readModelProxyManifest();
		if (manifest) {
			const manifestStatus = await this.statusFromManifest({
				manifest,
				allowCleanup,
			});
			if (manifestStatus.statusCode !== "stopped") return manifestStatus;
		}
		return this.statusFromPortProbe(await this.probePortIdentity());
	}

	private async statusFromManifest({
		manifest,
		allowCleanup,
	}: {
		manifest: ModelProxyDaemonManifest;
		allowCleanup: boolean;
	}): Promise<ModelProxyStatus> {
		if (manifest.protocolVersion !== MODEL_PROXY_PROTOCOL_VERSION) {
			const portProbe = await this.probePortIdentity();
			if (portProbe.status === "free") {
				if (allowCleanup) removeModelProxyManifest();
				return createStatus({ statusCode: "stopped" });
			}
			return this.statusFromPortProbe(portProbe);
		}
		if (!manifestMatchesConfiguredPort(manifest)) {
			return createStatus({
				statusCode: "health_unavailable",
				lastError: `Manifest endpoint ${manifest.endpoint} does not match ${endpoint()}`,
				port: MODEL_PROXY_PORT,
			});
		}
		if (!isProcessAlive(manifest.pid)) {
			if (allowCleanup) removeModelProxyManifest();
			const portProbe = await this.probePortIdentity();
			return this.statusFromPortProbe(portProbe);
		}
		const health = await this.fetchHealth(manifest);
		if (health.status === "healthy" && health.health) {
			return statusFromHealth(health.health, manifest);
		}
		if (!isProcessAlive(manifest.pid)) {
			if (allowCleanup) removeModelProxyManifest();
			return createStatus({ statusCode: "stopped" });
		}
		const identity = await this.probePortIdentity();
		if (health.status === "unauthorized") {
			return createStatus({
				statusCode: "manifest_token_mismatch",
				lastError: "Superset model proxy rejected the saved control token",
				port:
					identity.status === "superset" && identity.identity
						? identity.identity.port
						: MODEL_PROXY_PORT,
			});
		}
		if (health.status === "protocol_mismatch") {
			return createStatus({
				statusCode: "protocol_mismatch",
				lastError: health.lastError,
				port: MODEL_PROXY_PORT,
			});
		}
		if (identity.status === "free") {
			if (allowCleanup) removeModelProxyManifest();
			return createStatus({ statusCode: "stopped" });
		}
		if (identity.status === "superset" && identity.identity) {
			return createStatus({
				statusCode: "health_unavailable",
				lastError:
					health.lastError ??
					"Superset model proxy is alive but did not pass health checks",
				port: identity.identity.port,
			});
		}
		if (identity.status === "other") return this.statusFromPortProbe(identity);
		return createStatus({
			statusCode: "health_unavailable",
			lastError:
				health.lastError ??
				"Model proxy daemon is alive but not responding to health checks",
			port: MODEL_PROXY_PORT,
		});
	}

	private statusFromPortProbe(probe: PortProbeResult): ModelProxyStatus {
		if (probe.status === "free") return createStatus({ statusCode: "stopped" });
		if (probe.status === "timeout") {
			return createStatus({
				statusCode: "health_unavailable",
				lastError: probe.lastError ?? `Timed out probing ${endpoint()}`,
				port: MODEL_PROXY_PORT,
			});
		}
		if (probe.status === "superset" && probe.identity) {
			if (probe.identity.protocolVersion !== MODEL_PROXY_PROTOCOL_VERSION) {
				return createStatus({
					statusCode: "protocol_mismatch",
					lastError: `Superset model proxy protocol ${probe.identity.protocolVersion} does not match app protocol ${MODEL_PROXY_PROTOCOL_VERSION}`,
					port: probe.identity.port,
				});
			}
			return createStatus({
				statusCode: "port_occupied_by_superset",
				lastError:
					"A Superset model proxy is running but this app cannot authenticate to it",
				port: probe.identity.port,
			});
		}
		return createStatus({
			statusCode: "port_occupied_by_other",
			lastError:
				probe.lastError ??
				`Port ${MODEL_PROXY_PORT} is used by another local service`,
			port: MODEL_PROXY_PORT,
		});
	}

	private async fetchHealth(
		manifest: ModelProxyDaemonManifest,
	): Promise<HealthProbeResult> {
		if (!manifestMatchesConfiguredPort(manifest)) {
			return { status: "unavailable", lastError: "Manifest port mismatch" };
		}
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
		try {
			const response = await fetch(`${manifest.endpoint}/health`, {
				signal: controller.signal,
				headers: { authorization: `Bearer ${manifest.controlToken}` },
			});
			if (response.status === 401 || response.status === 403) {
				return { status: "unauthorized" };
			}
			if (!response.ok) {
				return {
					status: "unavailable",
					lastError: `Health check returned HTTP ${response.status}`,
				};
			}
			const parsed = (await response.json()) as unknown;
			if (!isHealth(parsed)) {
				return {
					status: "unavailable",
					lastError: "Malformed health response",
				};
			}
			if (parsed.protocolVersion !== MODEL_PROXY_PROTOCOL_VERSION) {
				return {
					status: "protocol_mismatch",
					lastError: `Daemon protocol ${parsed.protocolVersion} does not match app protocol ${MODEL_PROXY_PROTOCOL_VERSION}`,
				};
			}
			if (parsed.port !== MODEL_PROXY_PORT) {
				return { status: "unavailable", lastError: "Health port mismatch" };
			}
			return { status: "healthy", health: parsed };
		} catch (error) {
			return { status: "unavailable", lastError: errorMessage(error) };
		} finally {
			clearTimeout(timeout);
		}
	}

	private async probePortIdentity(): Promise<PortProbeResult> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
		try {
			const response = await fetch(
				`${endpoint()}${MODEL_PROXY_IDENTITY_PATH}`,
				{
					signal: controller.signal,
				},
			);
			if (!response.ok) {
				return {
					status: "other",
					lastError: `Identity probe returned HTTP ${response.status}`,
				};
			}
			const parsed = (await response.json()) as unknown;
			if (!isIdentity(parsed)) {
				return { status: "other", lastError: "Malformed identity response" };
			}
			return { status: "superset", identity: parsed };
		} catch (error) {
			const message = errorMessage(error);
			const code = errorCauseCode(error);
			if (code === "ECONNREFUSED") return { status: "free" };
			if (message.includes("abort")) {
				return { status: "timeout", lastError: message };
			}
			return { status: "other", lastError: message };
		} finally {
			clearTimeout(timeout);
		}
	}

	private async findOwnedSupersetDaemon(): Promise<ModelProxyDaemonIdentity | null> {
		const manifest = readModelProxyManifest();
		if (!manifest || !isProcessAlive(manifest.pid)) return null;
		if (!manifestMatchesConfiguredPort(manifest)) return null;
		const health = await this.fetchHealth(manifest);
		if (health.status !== "healthy" || !health.health) return null;
		if (health.health.pid !== manifest.pid) return null;
		return {
			service: MODEL_PROXY_SERVICE,
			protocolVersion: health.health.protocolVersion,
			pid: health.health.pid,
			startedAt: health.health.startedAt,
			port: health.health.port,
		};
	}

	private async stopKnownSupersetDaemon(pid: number): Promise<boolean> {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			return !isProcessAlive(pid);
		}
		const deadline = Date.now() + START_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (!isProcessAlive(pid)) return true;
			await sleep(HEALTH_POLL_INTERVAL_MS);
		}
		return !isProcessAlive(pid);
	}

	private spawnDaemon(): ModelProxyStatus | null {
		const daemonScript = this.getDaemonScriptPath();
		if (!existsSync(daemonScript)) {
			return createStatus({
				statusCode: "script_missing",
				lastError: `Model proxy daemon script not found: ${daemonScript}`,
				port: MODEL_PROXY_PORT,
			});
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
		} catch (error) {
			return createStatus({
				statusCode: "health_unavailable",
				lastError: `Failed to spawn model proxy daemon: ${errorMessage(error)}`,
				port: MODEL_PROXY_PORT,
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
		if (!child) {
			return createStatus({
				statusCode: "health_unavailable",
				lastError: "Failed to spawn model proxy daemon",
				port: MODEL_PROXY_PORT,
			});
		}
		child.unref();
		return null;
	}

	private getDaemonScriptPath(): string {
		return join(app.getAppPath(), "dist", "main", "model-proxy.js");
	}

	private async waitForHealthyDaemon(): Promise<ModelProxyStatus> {
		const deadline = Date.now() + START_TIMEOUT_MS;
		let lastStatus = createStatus({ statusCode: "starting" });
		while (Date.now() < deadline) {
			lastStatus = await this.discover({ allowCleanup: true });
			if (lastStatus.running) return lastStatus;
			if (
				lastStatus.statusCode !== "stopped" &&
				lastStatus.statusCode !== "health_unavailable"
			) {
				return lastStatus;
			}
			await sleep(HEALTH_POLL_INTERVAL_MS);
		}
		return {
			...lastStatus,
			statusCode: "spawn_timeout",
			lastError:
				lastStatus.lastError ??
				`Model proxy daemon did not become healthy at ${endpoint()}`,
		};
	}

	private acquireSpawnLock(): boolean {
		ensureModelProxyDaemonDir();
		const lockPath = modelProxySpawnLockPath();
		return (
			this.tryCreateSpawnLock(lockPath) || this.tryStealStaleSpawnLock(lockPath)
		);
	}

	private tryCreateSpawnLock(lockPath: string): boolean {
		let lockFd: number | null = null;
		try {
			lockFd = openSync(lockPath, "wx", 0o600);
			writeSync(lockFd, `${JSON.stringify(createSpawnLockMetadata())}\n`);
			return true;
		} catch {
			return false;
		} finally {
			if (lockFd !== null) {
				try {
					closeSync(lockFd);
				} catch {
					// Best-effort cleanup.
				}
			}
		}
	}

	private tryStealStaleSpawnLock(
		lockPath: string,
		afterStaleLinkForTest?: () => void,
	): boolean {
		let observedStat: ReturnType<typeof statSync>;
		let observedMetadata: SpawnLockMetadata | null;
		try {
			observedStat = statSync(lockPath);
			observedMetadata = parseSpawnLockMetadata(
				readFileSync(lockPath, "utf-8"),
			);
		} catch {
			return false;
		}
		const createdAt = observedMetadata?.createdAt ?? observedStat.mtimeMs;
		if (Date.now() - createdAt < SPAWN_LOCK_TIMEOUT_MS) return false;

		const stalePath = `${lockPath}.stale.${process.pid}.${Date.now()}.${Math.random()
			.toString(36)
			.slice(2)}`;
		try {
			linkSync(lockPath, stalePath);
		} catch {
			return false;
		}
		afterStaleLinkForTest?.();
		try {
			const currentStat = statSync(lockPath);
			const staleStat = statSync(stalePath);
			if (
				currentStat.dev !== observedStat.dev ||
				currentStat.ino !== observedStat.ino ||
				staleStat.dev !== observedStat.dev ||
				staleStat.ino !== observedStat.ino ||
				staleStat.nlink !== 2
			) {
				return false;
			}
			unlinkSync(lockPath);
			return this.tryCreateSpawnLock(lockPath);
		} catch {
			return false;
		} finally {
			try {
				unlinkSync(stalePath);
			} catch {
				// Best-effort cleanup.
			}
		}
	}

	private releaseSpawnLock(): void {
		removeModelProxySpawnLock();
	}
}

export const modelProxyDaemonManager = new ModelProxyDaemonManager();
