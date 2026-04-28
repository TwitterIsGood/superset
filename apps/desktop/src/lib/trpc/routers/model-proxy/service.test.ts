import { beforeAll, describe, expect, mock, test } from "bun:test";
import { ProxyAgent } from "undici";
import {
	modelProviderModels,
	modelProviders,
} from "../../../../../../../packages/local-db/src/schema/schema";

mock.module("@superset/local-db", () => ({
	modelProviderModels,
	modelProviders,
}));
mock.module("main/lib/local-db", () => ({
	localDb: {},
}));

type ServiceModule = typeof import("./service");

let service: ServiceModule;

beforeAll(async () => {
	service = await import("./service");
});

describe("model proxy daemon token", () => {
	test("uses the fixed local proxy API key", async () => {
		const { MODEL_PROXY_WORKSPACE_TOKEN } = await import(
			"main/lib/model-proxy-daemon/types"
		);
		expect(MODEL_PROXY_WORKSPACE_TOKEN).toBe("superset-local-model-proxy");
	});
});

describe("createProviderFetchOptions", () => {
	test("returns the original options when no proxy URL is configured", () => {
		const init: RequestInit = { method: "GET" };

		expect(service.createProviderFetchOptions({ init })).toBe(init);
		expect(service.createProviderFetchOptions({ init, proxyUrl: "  " })).toBe(
			init,
		);
	});

	test("adds an undici proxy dispatcher for HTTP and HTTPS proxy URLs", () => {
		const httpOptions = service.createProviderFetchOptions({
			proxyUrl: "http://127.0.0.1:7890",
			init: { method: "POST" },
		});
		const httpsOptions = service.createProviderFetchOptions({
			proxyUrl: "https://proxy.example.test",
			init: { method: "POST" },
		});

		expect(httpOptions.dispatcher).toBeInstanceOf(ProxyAgent);
		expect(httpsOptions.dispatcher).toBeInstanceOf(ProxyAgent);
		expect(httpOptions.method).toBe("POST");
	});

	test("rejects unsupported proxy URL schemes", () => {
		expect(() =>
			service.createProviderFetchOptions({
				proxyUrl: "socks5://127.0.0.1:1080",
				init: {},
			}),
		).toThrow("Unsupported proxy URL scheme");
	});
});
