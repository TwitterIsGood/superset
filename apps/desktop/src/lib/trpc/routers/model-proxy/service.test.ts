import { describe, expect, test } from "bun:test";
import { ProxyAgent } from "undici";
import { createProviderFetchOptions, ModelProxyService } from "./service";

describe("ModelProxyService", () => {
	test("uses the fixed local proxy API key", () => {
		expect(new ModelProxyService().getToken()).toBe(
			"superset-local-model-proxy",
		);
	});
});

describe("createProviderFetchOptions", () => {
	test("returns the original options when no proxy URL is configured", () => {
		const init: RequestInit = { method: "GET" };

		expect(createProviderFetchOptions({ init })).toBe(init);
		expect(createProviderFetchOptions({ init, proxyUrl: "  " })).toBe(init);
	});

	test("adds an undici proxy dispatcher for HTTP and HTTPS proxy URLs", () => {
		const httpOptions = createProviderFetchOptions({
			proxyUrl: "http://127.0.0.1:7890",
			init: { method: "POST" },
		});
		const httpsOptions = createProviderFetchOptions({
			proxyUrl: "https://proxy.example.test",
			init: { method: "POST" },
		});

		expect(httpOptions.dispatcher).toBeInstanceOf(ProxyAgent);
		expect(httpsOptions.dispatcher).toBeInstanceOf(ProxyAgent);
		expect(httpOptions.method).toBe("POST");
	});

	test("rejects unsupported proxy URL schemes", () => {
		expect(() =>
			createProviderFetchOptions({
				proxyUrl: "socks5://127.0.0.1:1080",
				init: {},
			}),
		).toThrow("Unsupported proxy URL scheme");
	});
});
