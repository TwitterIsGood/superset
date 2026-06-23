/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";

process.env.EXPO_PUBLIC_API_URL = "http://localhost:3001";
process.env.EXPO_PUBLIC_ELECTRIC_URL = "http://localhost:3012";
process.env.EXPO_PUBLIC_POSTHOG_KEY = "test-posthog-key";

const { parseMobileEnv } = await import("./env");

const baseEnv = {
	NODE_ENV: "development",
	EXPO_PUBLIC_API_URL: "http://bj1.v.lhb.ink:63001",
	EXPO_PUBLIC_ELECTRIC_URL: "http://bj1.v.lhb.ink:63012",
	EXPO_PUBLIC_WEB_URL: "http://bj1.v.lhb.ink:63000",
	EXPO_PUBLIC_POSTHOG_KEY: "test-posthog-key",
};

describe("parseMobileEnv", () => {
	test("accepts the approved HTTP public service URLs", () => {
		expect(parseMobileEnv(baseEnv)).toMatchObject(baseEnv);
	});

	test("does not require PostHog for mobile startup", () => {
		const envWithoutPostHog: Record<string, unknown> = { ...baseEnv };
		delete envWithoutPostHog.EXPO_PUBLIC_POSTHOG_KEY;

		const parsedEnvWithoutPostHog = parseMobileEnv(envWithoutPostHog);
		expect(parsedEnvWithoutPostHog).toMatchObject({
			EXPO_PUBLIC_API_URL: baseEnv.EXPO_PUBLIC_API_URL,
			EXPO_PUBLIC_ELECTRIC_URL: baseEnv.EXPO_PUBLIC_ELECTRIC_URL,
			EXPO_PUBLIC_WEB_URL: baseEnv.EXPO_PUBLIC_WEB_URL,
		});
		expect(parsedEnvWithoutPostHog).not.toHaveProperty(
			"EXPO_PUBLIC_POSTHOG_KEY",
		);

		const parsedEnvWithEmptyPostHog = parseMobileEnv({
			...envWithoutPostHog,
			EXPO_PUBLIC_POSTHOG_KEY: "",
		});
		expect(parsedEnvWithEmptyPostHog.EXPO_PUBLIC_POSTHOG_KEY).toBeUndefined();
	});

	test("allows http only for local development hosts", () => {
		expect(
			parseMobileEnv({
				...baseEnv,
				EXPO_PUBLIC_API_URL: "http://localhost:3001",
				EXPO_PUBLIC_ELECTRIC_URL: "http://127.0.0.1:3012",
				EXPO_PUBLIC_WEB_URL: "http://[::1]:3000",
			}),
		).toMatchObject({
			EXPO_PUBLIC_API_URL: "http://localhost:3001",
			EXPO_PUBLIC_ELECTRIC_URL: "http://127.0.0.1:3012",
			EXPO_PUBLIC_WEB_URL: "http://[::1]:3000",
		});
	});

	test("rejects unapproved http public hosts before iOS ATS blocks the request", () => {
		expect(() =>
			parseMobileEnv({
				...baseEnv,
				EXPO_PUBLIC_API_URL: "http://example.com:63001",
			}),
		).toThrow("Mobile HTTP URLs are only allowed for approved hosts");
	});
});
