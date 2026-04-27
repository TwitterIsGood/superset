import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	ensureModelProxyDaemonDir,
	modelProxyControlTokenPath,
	readModelProxyManifest,
	removeModelProxyManifest,
	writeModelProxyManifest,
} from "main/lib/model-proxy-daemon/manifest";
import {
	MODEL_PROXY_HOST,
	MODEL_PROXY_PORT,
	MODEL_PROXY_PROTOCOL_VERSION,
	MODEL_PROXY_WORKSPACE_TOKEN,
} from "main/lib/model-proxy-daemon/types";
import { ModelProxyDaemonServer } from "./server";

function readOrCreateControlToken(): string {
	ensureModelProxyDaemonDir();
	const tokenPath = modelProxyControlTokenPath();
	if (existsSync(tokenPath)) {
		const token = readFileSync(tokenPath, "utf-8").trim();
		if (token) return token;
	}
	const token = randomBytes(32).toString("base64url");
	writeFileSync(tokenPath, `${token}\n`, { encoding: "utf-8", mode: 0o600 });
	return token;
}

async function main(): Promise<void> {
	const controlToken = readOrCreateControlToken();
	const startedAt = Date.now();
	const server = new ModelProxyDaemonServer(
		controlToken,
		MODEL_PROXY_WORKSPACE_TOKEN,
		startedAt,
	);
	await server.start();
	writeModelProxyManifest({
		pid: process.pid,
		endpoint: `http://${MODEL_PROXY_HOST}:${MODEL_PROXY_PORT}`,
		controlToken,
		workspaceToken: MODEL_PROXY_WORKSPACE_TOKEN,
		startedAt,
		protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
	});
	console.log(
		`[model-proxy-daemon] listening on ${MODEL_PROXY_HOST}:${MODEL_PROXY_PORT}`,
	);

	const shutdown = (signal: NodeJS.Signals) => {
		console.log(`[model-proxy-daemon] received ${signal}, shutting down`);
		void server
			.stop()
			.catch((error) => {
				console.error("[model-proxy-daemon] failed to stop cleanly", error);
			})
			.finally(() => {
				const manifest = readModelProxyManifest();
				if (manifest?.pid === process.pid) removeModelProxyManifest();
				process.exit(0);
			});
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

main().catch((error) => {
	console.error("[model-proxy-daemon] fatal startup error", error);
	process.exit(1);
});
