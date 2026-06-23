/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "superset-online.sh"), {
	encoding: "utf8",
});

describe("superset online public URL defaults", () => {
	test("uses the configured public HTTP domain by default", () => {
		expect(SOURCE).toMatch(
			/PUBLIC_SCHEME="\$\{SUPERSET_PUBLIC_SCHEME:-http\}"/,
		);
		expect(SOURCE).toMatch(
			/PUBLIC_API_URL="\$\{SUPERSET_PUBLIC_API_URL:-\$\{PUBLIC_SCHEME\}:\/\/\$\{PUBLIC_DOMAIN\}:63001\}"/,
		);
		expect(SOURCE).not.toContain('PUBLIC_API_URL="http://bj1.v.lhb.ink');
	});

	test("syncs only mobile public URL keys into apps/mobile/.env.local", () => {
		expect(SOURCE).toContain("write_mobile_env_file");
		expect(SOURCE).toContain("SUPERSET_MOBILE_PROFILE");
		expect(SOURCE).toContain("EXPO_PUBLIC_SUPERSET_PROFILE");
		expect(SOURCE).toContain("EXPO_PUBLIC_API_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_ELECTRIC_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_WEB_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_RELAY_URL");
		expect(SOURCE).not.toContain("EXPO_PUBLIC_POSTHOG_KEY=");
	});
});
