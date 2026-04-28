export const MODEL_PROXY_PROTOCOL_VERSION = 1;
export const MODEL_PROXY_HOST = "127.0.0.1";
export const MODEL_PROXY_PORT = 39127;
export const MODEL_PROXY_WORKSPACE_TOKEN = "superset-local-model-proxy";

export interface ModelProxyDaemonManifest {
	pid: number;
	endpoint: string;
	controlToken: string;
	workspaceToken: string;
	startedAt: number;
	protocolVersion: number;
}

export interface ModelProxyDaemonHealth {
	ok: true;
	pid: number;
	startedAt: number;
	port: number;
	protocolVersion: number;
	enabledProviderCount: number;
	aggregatedModelCount: number;
}
