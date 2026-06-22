/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "organization.ts"), "utf8");

describe("mobile auth organization helper", () => {
	it("repairs stale active organizations before refreshing JWT state", () => {
		expect(SOURCE).toContain("apiClient.user.myOrganizations.query()");
		expect(SOURCE).toContain("organizations.some");
		expect(SOURCE).toContain("authClient.organization.setActive");
		expect(SOURCE).toContain("await refreshJwt()");
		expect(SOURCE).toContain("await refetchSession?.()");
	});
});
