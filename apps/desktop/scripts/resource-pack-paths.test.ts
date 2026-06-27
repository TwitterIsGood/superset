import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import {
	defaultResourcePackAppIndexOut,
	defaultResourcePackOutDir,
	legacyDistResourcePackDirs,
} from "./resource-pack-paths";

const appDir = resolve(import.meta.dirname, "..");

describe("resource pack script paths", () => {
	test("keeps local pack outputs outside the Electron dist tree by default", () => {
		expect(defaultResourcePackOutDir).toBe(
			join(appDir, ".tmp", "resource-packs"),
		);
		expect(defaultResourcePackOutDir).not.toContain(
			join("dist", "resource-packs"),
		);
	});

	test("keeps the embedded app index in dist resources", () => {
		expect(defaultResourcePackAppIndexOut).toBe(
			join(
				appDir,
				"dist",
				"resources",
				"pack-system",
				"pack-manifest-index.json",
			),
		);
	});

	test("tracks legacy dist pack directories for dev cleanup", () => {
		expect(legacyDistResourcePackDirs).toEqual([
			join(appDir, "dist", "resource-packs"),
			join(appDir, "dist", "resource-packs-test"),
		]);
	});
});
