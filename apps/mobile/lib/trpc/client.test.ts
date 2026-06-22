/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "client.ts"), "utf8");

describe("mobile tRPC client", () => {
	it("sends tRPC queries as uncached requests", () => {
		expect(SOURCE).toContain('methodOverride: "POST"');
		expect(SOURCE).toContain("noStoreFetch");
		expect(SOURCE).toContain(
			'"Cache-Control", "no-store, no-cache, max-age=0"',
		);
		expect(SOURCE).toContain('"Pragma", "no-cache"');
		expect(SOURCE).toContain('cache: "no-store"');
	});

	it("authenticates with the mobile JWT instead of relying only on cookies", () => {
		expect(SOURCE).toContain("getAuthorizationHeader");
		expect(SOURCE).toContain("refreshJwt().catch(() => null)");
		expect(SOURCE).toContain('headers.set("Authorization", authorization)');
		expect(SOURCE).toContain("jwt ? { Authorization");
		expect(SOURCE).toContain("Bearer");
		expect(SOURCE).toContain("Cookie: cookies");
	});
});
