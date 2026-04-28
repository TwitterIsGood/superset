import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MODEL_PROXY_IDENTITY_PATH } from "main/lib/model-proxy-daemon/types";
import type { ModelProxyDaemonServer as ModelProxyDaemonServerType } from "./server";

mock.module("lib/trpc/routers/model-proxy/storage", () => ({
	listProvidersForProxy: async () => [],
}));

let ModelProxyDaemonServer: typeof ModelProxyDaemonServerType;

beforeEach(async () => {
	({ ModelProxyDaemonServer } = await import("./server"));
});

async function request(
	server: ModelProxyDaemonServerType,
	options: {
		method: string;
		url: string;
		headers?: Record<string, string>;
	},
) {
	const request = new EventEmitter() as IncomingMessage;
	request.method = options.method;
	request.url = options.url;
	request.headers = options.headers ?? {};
	const response = new EventEmitter() as ServerResponse & {
		statusCodeValue?: number;
		headersValue?: Record<string, string>;
		bodyValue?: string;
	};
	response.writeHead = ((status: number, headers: Record<string, string>) => {
		response.statusCodeValue = status;
		response.headersValue = headers;
		return response;
	}) as ServerResponse["writeHead"];
	response.end = ((body?: string) => {
		response.bodyValue = body;
		response.emit("finish");
		return response;
	}) as ServerResponse["end"];

	await (
		server as unknown as {
			handleRequest: (
				request: IncomingMessage,
				response: ServerResponse,
			) => Promise<void>;
		}
	).handleRequest(request, response);

	return {
		status: response.statusCodeValue,
		body: response.bodyValue ? JSON.parse(response.bodyValue) : undefined,
	};
}

describe("ModelProxyDaemonServer", () => {
	test("exposes unauthenticated non-secret identity", async () => {
		const server = new ModelProxyDaemonServer(
			"control-secret",
			"workspace-secret",
			123,
		);

		const response = await request(server, {
			method: "GET",
			url: MODEL_PROXY_IDENTITY_PATH,
		});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			service: "superset-model-proxy",
			protocolVersion: 1,
			pid: process.pid,
			startedAt: 123,
			port: 39127,
		});
		expect(JSON.stringify(response.body)).not.toContain("control-secret");
		expect(JSON.stringify(response.body)).not.toContain("workspace-secret");
	});

	test("keeps health protected by control token", async () => {
		const server = new ModelProxyDaemonServer(
			"control-secret",
			"workspace-secret",
			456,
		);

		const unauthorized = await request(server, {
			method: "GET",
			url: "/health",
		});
		expect(unauthorized.status).toBe(401);

		const authorized = await request(server, {
			method: "GET",
			url: "/health",
			headers: { authorization: "Bearer control-secret" },
		});
		expect(authorized.status).toBe(200);
		expect(authorized.body.ok).toBe(true);
		expect(authorized.body.protocolVersion).toBe(1);
		expect(authorized.body.enabledProviderCount).toBeUndefined();
		expect(authorized.body.aggregatedModelCount).toBeUndefined();
	});
});
