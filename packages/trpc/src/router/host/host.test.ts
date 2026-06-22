/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "host.ts"), "utf8");

describe("host router relay-aware mobile presence", () => {
	test("corrects host.list online state with relay directory when KV is available", () => {
		expect(SOURCE).toContain('const RELAY_TTL_KEY = "relay:tunnel-ttl"');
		expect(SOURCE).toContain("listRelayConnectedHostIds");
		expect(SOURCE).toContain("relayDirectoryRedis.zrange");
		expect(SOURCE).toContain("Date.now()");
		expect(SOURCE).toContain("{ byScore: true }");
		expect(SOURCE).toContain("row.isOnline &&");
		expect(SOURCE).toContain("row.organizationId");
		expect(SOURCE).toContain("row.machineId");
	});

	test("falls back to stored v2 host presence when relay directory is unavailable", () => {
		expect(SOURCE).toContain("if (!relayDirectoryRedis) return null");
		expect(SOURCE).toContain(
			'console.warn("[host.list] relay directory read failed:", error)',
		);
		expect(SOURCE).toContain("if (!row.isOnline) return false");
		expect(SOURCE).toContain("if (relayConnectedHostIds === null) return true");
	});

	test("probes the current relay when the directory misses an otherwise-online host", () => {
		expect(SOURCE).toContain("probeRelayConnectedHostIds");
		expect(SOURCE).toContain("getBearerToken(ctx.headers)");
		expect(SOURCE).toContain("_whoowns");
		expect(SOURCE).toContain("env.RELAY_URL");
		expect(SOURCE).toContain("AbortSignal.timeout(1000)");
		expect(SOURCE).toContain("relayProbedHostIds.has(routingKey)");
	});
});
