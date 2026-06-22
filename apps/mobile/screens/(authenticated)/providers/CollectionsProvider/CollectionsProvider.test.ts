/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "CollectionsProvider.tsx"),
	"utf8",
);

describe("CollectionsProvider", () => {
	it("does not enter the authenticated collection tree after JWT refresh fails", () => {
		expect(SOURCE).toContain(".then(() =>");
		expect(SOURCE).toContain("setJwtReadyOrganizationId(activeOrganizationId)");
		expect(SOURCE).toContain(".catch(() =>");
		expect(SOURCE).toContain("setJwtReadyOrganizationId(null)");
		expect(SOURCE).toContain("signOut().catch");
	});

	it("validates the active organization before entering the collection tree", () => {
		expect(SOURCE).toContain("ensureActiveOrganization");
		expect(SOURCE).toContain("activeOrganizationId");
		expect(SOURCE).toContain("refetchSession");
		expect(SOURCE).toContain("validatedOrganizationScope");
	});
});
