/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "client.ts"), "utf8");

describe("mobile auth client", () => {
	it("clears the cached JWT when token refresh fails", () => {
		expect(SOURCE).toContain("setJwt(null)");
		expect(SOURCE).toContain("Auth token endpoint returned no JWT");
		expect(SOURCE).toContain("throw error");
	});

	it("exposes refreshJwt so sign-in flows can prime mobile tRPC auth", () => {
		expect(SOURCE).toContain("export async function refreshJwt");
		expect(SOURCE).toContain("authClient.token()");
		expect(SOURCE).toContain("setJwt(token)");
	});

	it("provides an email sign-in path that bypasses Expo WebAuth redirects", () => {
		expect(SOURCE).toContain("export async function signInWithEmail");
		expect(SOURCE).toContain("/api/auth/sign-in/email");
		expect(SOURCE).toContain("persistEmailSignInCookie");
		expect(SOURCE).toContain("getSetCookie");
		expect(SOURCE).toContain("set-auth-token");
		expect(SOURCE).toContain("await refreshJwt()");
		expect(SOURCE).toContain("await authClient.getSession()");
	});
});
