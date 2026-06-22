/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "useOrganizations.ts"),
	"utf8",
);

describe("useOrganizations", () => {
	it("prefers API organizations over stale Electric organization rows", () => {
		expect(SOURCE).toContain("fallbackOrganizations.length > 0");
		expect(SOURCE).toContain(": (organizations ?? [])");
		expect(SOURCE).toContain("sessionActiveOrganizationId");
		expect(SOURCE).toContain("effectiveOrganizations.some");
		expect(SOURCE).toContain(": effectiveOrganizations[0]?.id");
	});
});
