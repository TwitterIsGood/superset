/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "SignInScreen.tsx"), "utf8");

describe("SignInScreen", () => {
	it("primes the mobile JWT after email sign-in succeeds", () => {
		expect(SOURCE).toContain('from "@/lib/auth/client"');
		expect(SOURCE).toContain("signInWithEmail");
		expect(SOURCE).toContain("const result = await signInWithEmail");
		expect(SOURCE).toContain("await refetchSession()");
		expect(SOURCE).toContain('router.replace("/(authenticated)/(home)")');
	});

	it("exposes stable automation targets for email sign-in", () => {
		expect(SOURCE).toContain('testID="sign-in-email-input"');
		expect(SOURCE).toContain('testID="sign-in-password-input"');
		expect(SOURCE).toContain('testID="sign-in-email-button"');
		expect(SOURCE).toContain('accessibilityLabel="Sign in with email"');
	});

	it("disables associated-domain autofill for localhost dev login", () => {
		expect(SOURCE).toContain("shouldDisableAssociatedDomainAutofill");
		expect(SOURCE).toContain('env.EXPO_PUBLIC_API_URL.includes("localhost")');
		expect(SOURCE).toContain('"none"');
		expect(SOURCE).toContain('"off"');
		expect(SOURCE).toContain("autoComplete={");
	});
});
