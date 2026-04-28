import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	modelProxyControlTokenPath,
	modelProxyDaemonDir,
	modelProxyManifestPath,
	readModelProxyManifest,
	removeModelProxyDaemonDirForTest,
	writeModelProxyManifest,
} from "./manifest";
import {
	MODEL_PROXY_PROTOCOL_VERSION,
	MODEL_PROXY_SERVICE,
	MODEL_PROXY_WORKSPACE_TOKEN,
} from "./types";

describe("model proxy daemon manifest", () => {
	afterEach(() => {
		removeModelProxyDaemonDirForTest();
	});

	test("uses global per-user control paths", () => {
		expect(modelProxyDaemonDir()).toBe(
			join(homedir(), ".superset", "daemons", "model-proxy", "port-39127"),
		);
		expect(modelProxyManifestPath()).toBe(
			join(modelProxyDaemonDir(), "daemon-manifest.json"),
		);
		expect(modelProxyControlTokenPath()).toBe(
			join(modelProxyDaemonDir(), "daemon-control.token"),
		);
	});

	test("round trips valid manifests", () => {
		writeModelProxyManifest({
			service: MODEL_PROXY_SERVICE,
			pid: process.pid,
			endpoint: "http://127.0.0.1:39127",
			controlToken: "control",
			workspaceToken: MODEL_PROXY_WORKSPACE_TOKEN,
			startedAt: 123,
			protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
		});

		expect(readModelProxyManifest()).toEqual({
			service: MODEL_PROXY_SERVICE,
			pid: process.pid,
			endpoint: "http://127.0.0.1:39127",
			controlToken: "control",
			workspaceToken: MODEL_PROXY_WORKSPACE_TOKEN,
			startedAt: 123,
			protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
		});
	});
});
