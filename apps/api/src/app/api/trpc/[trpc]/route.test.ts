import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "route.ts"), "utf8");

describe("api tRPC route", () => {
	it("accepts POST transport for query procedures", () => {
		expect(SOURCE).toContain("allowMethodOverride: true");
	});
});
