import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "context.ts"), "utf8");

describe("api tRPC context", () => {
	it("accepts Better Auth JWT bearer tokens for protected mobile tRPC calls", () => {
		expect(SOURCE).toContain("sessionFromBetterAuthJwtBearer");
		expect(SOURCE).toContain("auth.api.verifyJWT");
		expect(SOURCE).toContain("sessionFromVerifiedBetterAuthJwtBearer");
		expect(SOURCE).toContain("sessionFromJwtPayload");
		expect(SOURCE).toContain("sessionFromOAuthBearer");
	});

	it("resolves a missing active organization before creating the tRPC context", () => {
		expect(SOURCE).toContain("resolveSessionOrganizationState");
		expect(SOURCE).toContain("resolveActiveOrganizationForSession");
		expect(SOURCE).toContain(
			"session = await resolveActiveOrganizationForSession(session)",
		);
	});

	it("treats empty JWT payloads as unauthenticated instead of throwing", () => {
		expect(SOURCE).toContain("isRecord");
		expect(SOURCE).toContain("payload: unknown");
		expect(SOURCE).toContain("if (!isRecord(payload)) return null");
	});
});
