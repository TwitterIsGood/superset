import { describe, expect, test } from "bun:test";
import { getJwtExpiresAt, looksLikeJwt } from "./authJwt";

function base64UrlEncode(value: string): string {
	return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("auth JWT helpers", () => {
	test("detects compact JWT tokens", () => {
		expect(looksLikeJwt("header.payload.signature")).toBe(true);
		expect(looksLikeJwt("desktop-session-token")).toBe(false);
		expect(looksLikeJwt("header.payload.")).toBe(false);
	});

	test("reads exp from a JWT payload", () => {
		const exp = 1_770_000_000;
		const token = [
			base64UrlEncode(JSON.stringify({ alg: "none" })),
			base64UrlEncode(JSON.stringify({ exp })),
			"signature",
		].join(".");

		expect(getJwtExpiresAt(token)).toBe(new Date(exp * 1000).toISOString());
	});

	test("falls back to a future expiry for non-decodable tokens", () => {
		const before = Date.now();
		const expiresAt = Date.parse(
			getJwtExpiresAt(`bad.${base64UrlEncode("{}")}.signature`),
		);
		const after = Date.now();

		expect(expiresAt).toBeGreaterThan(before + 50 * 60 * 1000);
		expect(expiresAt).toBeLessThan(after + 60 * 60 * 1000);
	});
});
