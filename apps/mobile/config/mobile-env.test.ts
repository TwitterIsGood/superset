/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	getIosAtsExceptionDomains,
	getPublicHttpHosts,
	MOBILE_PROFILE_DEFAULTS,
	resolveMobileEnv,
	toExpoPublicEnv,
} from "./mobile-env";

describe("mobile environment profiles", () => {
	test("resolves the online canary profile to the public Mac mini endpoints", () => {
		const env = resolveMobileEnv({
			SUPERSET_MOBILE_PROFILE: "online-canary",
		});

		expect(env).toMatchObject({
			EXPO_PUBLIC_SUPERSET_PROFILE: "online-canary",
			EXPO_PUBLIC_API_URL: "http://bj1.v.lhb.ink:63001",
			EXPO_PUBLIC_ELECTRIC_URL: "http://bj1.v.lhb.ink:63012",
			EXPO_PUBLIC_WEB_URL: "http://bj1.v.lhb.ink:63000",
			EXPO_PUBLIC_RELAY_URL: "http://bj1.v.lhb.ink:63013",
		});
	});

	test("allows explicit env values to override profile defaults", () => {
		const env = resolveMobileEnv({
			SUPERSET_MOBILE_PROFILE: "online-canary",
			EXPO_PUBLIC_API_URL: "https://api.example.test",
		});

		expect(env.EXPO_PUBLIC_API_URL).toBe("https://api.example.test");
		expect(env.EXPO_PUBLIC_ELECTRIC_URL).toBe("http://bj1.v.lhb.ink:63012");
	});

	test("keeps PostHog optional and omits the key from exported env when unset", () => {
		const env = resolveMobileEnv({
			SUPERSET_MOBILE_PROFILE: "online-canary",
		});
		const publicEnv = toExpoPublicEnv(env);

		expect(env.EXPO_PUBLIC_POSTHOG_KEY).toBeUndefined();
		expect(publicEnv.EXPO_PUBLIC_POSTHOG_KEY).toBeUndefined();
		expect(env.EXPO_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
	});

	test("generates ATS exception domains only for approved non-local HTTP hosts", () => {
		const onlineEnv = resolveMobileEnv({
			SUPERSET_MOBILE_PROFILE: "online-canary",
		});
		expect(getPublicHttpHosts(onlineEnv)).toEqual(["bj1.v.lhb.ink"]);
		expect(getIosAtsExceptionDomains(onlineEnv)).toEqual({
			"bj1.v.lhb.ink": {
				NSExceptionAllowsInsecureHTTPLoads: true,
				NSIncludesSubdomains: true,
			},
		});

		const localEnv = resolveMobileEnv({
			SUPERSET_MOBILE_PROFILE: "development",
		});
		expect(getPublicHttpHosts(localEnv)).toEqual([]);
		expect(getIosAtsExceptionDomains(localEnv)).toEqual({});
	});

	test("rejects arbitrary public HTTP before iOS ATS blocks the request", () => {
		expect(() =>
			resolveMobileEnv({
				SUPERSET_MOBILE_PROFILE: "online-canary",
				EXPO_PUBLIC_API_URL: "http://example.com:63001",
			}),
		).toThrow("Mobile HTTP URLs are only allowed for approved hosts");
	});

	test("keeps EAS online profiles aligned with resolver defaults", () => {
		const easJson = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "eas.json"), "utf8"),
		) as {
			build: Record<string, { env?: Record<string, string> }>;
		};

		for (const profile of ["online-canary", "production"] as const) {
			const env = easJson.build[profile]?.env;
			expect(env).toBeDefined();
			expect(env).toMatchObject(MOBILE_PROFILE_DEFAULTS[profile]);
		}

		expect(easJson.build.preview.env).toMatchObject(
			MOBILE_PROFILE_DEFAULTS["online-canary"],
		);
	});
});
