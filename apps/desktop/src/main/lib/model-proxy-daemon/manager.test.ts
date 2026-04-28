import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ModelProxyDaemonManager as ModelProxyDaemonManagerType } from "./manager";
import {
	ensureModelProxyDaemonDir,
	modelProxyManifestPath,
	modelProxySpawnLockPath,
	removeModelProxyControlState,
	removeModelProxyDaemonDirForTest,
	writeModelProxyManifest,
} from "./manifest";
import {
	MODEL_PROXY_IDENTITY_PATH,
	MODEL_PROXY_PROTOCOL_VERSION,
	MODEL_PROXY_SERVICE,
	MODEL_PROXY_WORKSPACE_TOKEN,
} from "./types";

mock.module("electron", () => ({
	app: {
		getAppPath: () => "/tmp/superset-test-app",
	},
}));

mock.module("main/lib/host-service-utils", () => ({
	openRotatingLogFd: () => -1,
}));

const originalFetch = globalThis.fetch;
const originalKill = process.kill;
let killCalls: Array<{ pid: number; signal?: NodeJS.Signals | 0 }> = [];
let ModelProxyDaemonManager: typeof ModelProxyDaemonManagerType;

function installFetch(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
	globalThis.fetch = ((url: URL | RequestInfo, init?: RequestInit) =>
		handler(String(url), init)) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function manifest(
	overrides: Partial<Parameters<typeof writeModelProxyManifest>[0]> = {},
) {
	writeModelProxyManifest({
		service: MODEL_PROXY_SERVICE,
		pid: process.pid,
		endpoint: "http://127.0.0.1:39127",
		controlToken: "control",
		workspaceToken: MODEL_PROXY_WORKSPACE_TOKEN,
		startedAt: 100,
		protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
		...overrides,
	});
}

describe("ModelProxyDaemonManager", () => {
	beforeEach(async () => {
		({ ModelProxyDaemonManager } = await import("./manager"));
		removeModelProxyControlState();
		killCalls = [];
		process.kill = ((pid: number, signal?: NodeJS.Signals | 0) => {
			killCalls.push({ pid, signal });
			return true;
		}) as typeof process.kill;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.kill = originalKill;
		removeModelProxyDaemonDirForTest();
	});

	test("reports stopped when no manifest and no listener exist", async () => {
		installFetch(() => {
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("stopped");
		expect(status.baseUrl).toBeNull();
	});

	test("adopts a healthy manifest", async () => {
		manifest();
		installFetch((url, init) => {
			expect(url).toBe("http://127.0.0.1:39127/health");
			expect(init?.headers).toEqual({ authorization: "Bearer control" });
			return json({
				ok: true,
				pid: process.pid,
				startedAt: 100,
				port: 39127,
				protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
			});
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status).toMatchObject({
			running: true,
			statusCode: "running",
			baseUrl: "http://127.0.0.1:39127",
			enabledProviderCount: 0,
			aggregatedModelCount: 0,
		});
	});

	test("reports manifest token mismatch for live Superset listener", async () => {
		manifest();
		installFetch((url) => {
			if (url.endsWith("/health"))
				return json({ error: { message: "Unauthorized" } }, 401);
			if (url.endsWith(MODEL_PROXY_IDENTITY_PATH)) {
				return json({
					service: MODEL_PROXY_SERVICE,
					protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
					pid: process.pid,
					startedAt: 100,
					port: 39127,
				});
			}
			throw new Error(`Unexpected URL ${url}`);
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("manifest_token_mismatch");
	});

	test("reports unrelated port holder without killing it", async () => {
		installFetch(() => json({ service: "other" }));

		const status = await new ModelProxyDaemonManager().start();
		expect(status.statusCode).toBe("port_occupied_by_other");
		expect(killCalls).toEqual([]);
	});

	test("restart does not kill unrelated port holder", async () => {
		installFetch(() => json({ service: "other" }));

		const status = await new ModelProxyDaemonManager().restart();
		expect(status.statusCode).toBe("port_occupied_by_other");
		expect(killCalls).toEqual([]);
	});

	test("start reports missing daemon script without fallback port", async () => {
		rmSync("/tmp/superset-test-app", { recursive: true, force: true });
		installFetch(() => {
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().start();
		expect(status.statusCode).toBe("script_missing");
		expect(status.port).toBe(39127);
	});

	test("removes dead manifest before reporting stopped", async () => {
		manifest({ pid: 999_999_999 });
		process.kill = ((pid: number, signal?: NodeJS.Signals | 0) => {
			killCalls.push({ pid, signal });
			if (signal === 0) throw new Error("ESRCH");
			return true;
		}) as typeof process.kill;
		installFetch((url) => {
			if (url.endsWith("/health")) throw new Error("fetch failed");
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("stopped");
		expect(existsSync(modelProxyManifestPath())).toBe(false);
	});

	test("removes old-protocol manifest when health is unavailable and port is free", async () => {
		manifest({ protocolVersion: MODEL_PROXY_PROTOCOL_VERSION - 1 });
		installFetch(() => {
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("stopped");
		expect(existsSync(modelProxyManifestPath())).toBe(false);
	});

	test("removes PID-reused manifest when health is unavailable and port is free", async () => {
		manifest({ pid: process.pid });
		installFetch((url) => {
			if (url.endsWith("/health")) throw new Error("fetch failed");
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("stopped");
		expect(existsSync(modelProxyManifestPath())).toBe(false);
	});

	test("reports other port holder after non-adoptable old-protocol manifest", async () => {
		manifest({ protocolVersion: MODEL_PROXY_PROTOCOL_VERSION - 1 });
		installFetch(() => json({ service: "other" }));

		const status = await new ModelProxyDaemonManager().status();
		expect(status.statusCode).toBe("port_occupied_by_other");
		expect(existsSync(modelProxyManifestPath())).toBe(true);
	});

	test("fresh spawn lock blocks concurrent lock acquisition atomically", async () => {
		ensureModelProxyDaemonDir();
		const fd = openSync(modelProxySpawnLockPath(), "wx", 0o600);
		closeSync(fd);
		writeFileSync(
			modelProxySpawnLockPath(),
			JSON.stringify({ ownerId: "fresh", createdAt: Date.now() }),
		);
		installFetch(() => {
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});

		const status = await new ModelProxyDaemonManager().start();
		expect(status.statusCode).toBe("spawn_timeout");
		expect(fd).toBeGreaterThanOrEqual(0);
	});

	test("stale spawn lock recovery does not unlink a freshly recreated lock", () => {
		ensureModelProxyDaemonDir();
		const lockPath = modelProxySpawnLockPath();
		writeFileSync(
			lockPath,
			JSON.stringify({
				ownerId: "stale-owner",
				createdAt: Date.now() - 20_000,
			}),
		);
		const manager = new ModelProxyDaemonManager();
		const stealSpawnLock = (
			manager as unknown as {
				tryStealStaleSpawnLock: (
					path: string,
					afterLink: () => void,
				) => boolean;
			}
		).tryStealStaleSpawnLock.bind(manager);

		const acquired = stealSpawnLock(lockPath, () => {
			unlinkSync(lockPath);
			writeFileSync(
				lockPath,
				JSON.stringify({ ownerId: "fresh-owner", createdAt: Date.now() }),
			);
		});

		expect(acquired).toBe(false);
		expect(readFileSync(lockPath, "utf-8")).toContain("fresh-owner");
	});

	test("restart does not kill unauthenticated Superset identity mimic", async () => {
		installFetch((url) => {
			if (url.endsWith(MODEL_PROXY_IDENTITY_PATH)) {
				return json({
					service: MODEL_PROXY_SERVICE,
					protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
					pid: 54321,
					startedAt: 100,
					port: 39127,
				});
			}
			throw new Error(`Unexpected URL ${url}`);
		});

		const status = await new ModelProxyDaemonManager().restart();
		expect(status.statusCode).toBe("port_occupied_by_superset");
		expect(killCalls).toEqual([]);
	});

	test("restart kills only daemon corroborated by manifest and authenticated health", async () => {
		manifest({ pid: 12345 });
		const scriptPath = join("/tmp/superset-test-app", "dist", "main");
		mkdirSync(scriptPath, { recursive: true });
		writeFileSync(join(scriptPath, "model-proxy.js"), "");
		let healthCalls = 0;
		installFetch((url) => {
			if (url.endsWith("/health")) {
				healthCalls += 1;
				if (healthCalls > 1) {
					throw Object.assign(
						new Error("connect ECONNREFUSED 127.0.0.1:39127"),
						{
							cause: { code: "ECONNREFUSED" },
						},
					);
				}
				return json({
					ok: true,
					pid: 12345,
					startedAt: 100,
					port: 39127,
					protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
				});
			}
			throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:39127"), {
				cause: { code: "ECONNREFUSED" },
			});
		});
		process.kill = ((pid: number, signal?: NodeJS.Signals | 0) => {
			killCalls.push({ pid, signal });
			if (pid === 12345 && signal === 0) return true;
			if (pid === 12345 && signal === "SIGTERM") return true;
			throw new Error("ESRCH");
		}) as typeof process.kill;

		await new ModelProxyDaemonManager().restart();
		expect(killCalls).toContainEqual({ pid: 12345, signal: "SIGTERM" });
	});
});
