/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const config = require("./metro.config.js") as {
	resolver?: { blockList?: RegExp | RegExp[] };
};

function metroBlockList(): RegExp[] {
	const blockList = config.resolver?.blockList;
	if (!blockList) return [];
	return Array.isArray(blockList) ? blockList : [blockList];
}

function isBlocked(filePath: string): boolean {
	return metroBlockList().some((matcher) => matcher.test(filePath));
}

describe("mobile Metro runtime path block list", () => {
	test("blocks volatile runtime paths without blocking package build entries", () => {
		const monorepoRoot = path.resolve(import.meta.dir, "../..");

		expect(
			isBlocked(path.join(monorepoRoot, "superset-dev-data", "host.db-wal")),
		).toBe(true);
		expect(isBlocked(path.join(monorepoRoot, ".trellis", "workflow.md"))).toBe(
			true,
		);
		expect(
			isBlocked(path.join(monorepoRoot, "apps", "mobile", "build", "index.js")),
		).toBe(true);

		expect(
			isBlocked(
				path.join(
					monorepoRoot,
					"node_modules",
					".bun",
					"expo-router@56.2.5",
					"node_modules",
					"expo-router",
					"build",
					"qualified-entry.js",
				),
			),
		).toBe(false);
		expect(isBlocked(path.join(import.meta.dir, "app", "_layout.tsx"))).toBe(
			false,
		);
	});
});
