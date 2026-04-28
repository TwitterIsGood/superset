import { MODEL_PROXY_HOST, MODEL_PROXY_PORT } from "shared/model-proxy";

export { MODEL_PROXY_HOST, MODEL_PROXY_PORT };

export const MODEL_PROXY_PROTOCOL_VERSION = 1;
export const MODEL_PROXY_SERVICE = "superset-model-proxy";
export const MODEL_PROXY_IDENTITY_PATH = "/.well-known/superset-model-proxy";
export const MODEL_PROXY_WORKSPACE_TOKEN = "superset-local-model-proxy";

export function modelProxyEndpoint(): string {
	return `http://${MODEL_PROXY_HOST}:${MODEL_PROXY_PORT}`;
}

export interface ModelProxyDaemonManifest {
	pid: number;
	endpoint: string;
	controlToken: string;
	workspaceToken: string;
	startedAt: number;
	protocolVersion: number;
	service: typeof MODEL_PROXY_SERVICE;
}

export interface ModelProxyDaemonHealth {
	ok: true;
	pid: number;
	startedAt: number;
	port: number;
	protocolVersion: number;
}

export interface ModelProxyDaemonIdentity {
	service: typeof MODEL_PROXY_SERVICE;
	protocolVersion: number;
	pid: number;
	startedAt: number;
	port: number;
}
