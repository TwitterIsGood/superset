import { randomBytes } from "node:crypto";
import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
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
	MODEL_PROXY_SERVICE,
	MODEL_PROXY_WORKSPACE_TOKEN,
	modelProxyEndpoint,
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
	try {
		const tokenFd = openSync(tokenPath, "wx", 0o600);
		try {
			writeSync(tokenFd, `${token}\n`);
		} finally {
			closeSync(tokenFd);
		}
		return token;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "EEXIST") {
			const existingToken = readFileSync(tokenPath, "utf-8").trim();
			if (existingToken) return existingToken;
		}
		throw error;
	}
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
		endpoint: modelProxyEndpoint(),
		controlToken,
		workspaceToken: MODEL_PROXY_WORKSPACE_TOKEN,
		startedAt,
		protocolVersion: MODEL_PROXY_PROTOCOL_VERSION,
		service: MODEL_PROXY_SERVICE,
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
