import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "context.ts"), "utf8");

describe("api tRPC context", () => {
	it("accepts Better Auth JWT bearer tokens for protected mobile tRPC calls", () => {
		expect(SOURCE).toContain("sessionFromBetterAuthJwtBearer");
		expect(SOURCE).toContain("auth.api.verifyJWT");
		expect(SOURCE).toContain("sessionFromVerifiedFullSessionJwtBearer");
		expect(SOURCE).toContain("sessionFromJwtPayload");
		expect(SOURCE).toContain("sessionFromOAuthBearer");
	});

	it("guards both JWT/JWKS fallbacks against scoped control tokens", () => {
		const betterAuthStart = SOURCE.indexOf(
			"async function sessionFromBetterAuthJwtBearer",
		);
		const oauthStart = SOURCE.indexOf("async function sessionFromOAuthBearer");
		const resolveStart = SOURCE.indexOf(
			"async function resolveActiveOrganizationForSession",
		);

		expect(betterAuthStart).toBeGreaterThan(0);
		expect(oauthStart).toBeGreaterThan(betterAuthStart);
		expect(resolveStart).toBeGreaterThan(oauthStart);
		expect(SOURCE.slice(betterAuthStart, oauthStart)).toContain(
			"sessionFromVerifiedFullSessionJwtBearer",
		);
		expect(SOURCE.slice(oauthStart, resolveStart)).toContain(
			"sessionFromVerifiedFullSessionJwtBearer",
		);
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
