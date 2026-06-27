import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cleanStaleViteCache,
	computeBareImportFingerprint,
	computeViteCacheKey,
} from "./clean-stale-vite-cache";

const tempDirs: string[] = [];

function createTempDir(): string {
	const tempDir = mkdtempSync(join(tmpdir(), "superset-vite-cache-test-"));
	tempDirs.push(tempDir);
	return tempDir;
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

describe("cleanStaleViteCache", () => {
	test("keeps the Vite optimizer cache when dependency inputs are unchanged", () => {
		const tempDir = createTempDir();
		const cacheDir = join(tempDir, ".vite");
		const markerPath = join(cacheDir, ".superset-cache-key");
		const inputPath = join(tempDir, "package.json");
		const cacheFile = join(cacheDir, "deps/current.js");

		writeFileSync(inputPath, '{"dependencies":{"react":"19.0.0"}}');
		const expectedKey = computeViteCacheKey([inputPath]);
		mkdirSync(join(cacheDir, "deps"), { recursive: true });
		writeFileSync(markerPath, `${expectedKey}\n`);
		writeFileSync(cacheFile, "export default 1;");

		const result = cleanStaleViteCache({
			cacheDir,
			inputPaths: [inputPath],
			markerPath,
		});

		expect(result.removed).toBe(false);
		expect(existsSync(cacheFile)).toBe(true);
		expect(readFileSync(markerPath, "utf8")).toBe(`${expectedKey}\n`);
	});

	test("removes stale optimizer output when dependency inputs change", () => {
		const tempDir = createTempDir();
		const cacheDir = join(tempDir, ".vite");
		const markerPath = join(cacheDir, ".superset-cache-key");
		const inputPath = join(tempDir, "package.json");
		const staleCacheFile = join(cacheDir, "deps/removed-package.js");

		writeFileSync(inputPath, '{"dependencies":{"react":"19.0.0"}}');
		mkdirSync(join(cacheDir, "deps"), { recursive: true });
		writeFileSync(markerPath, "old-cache-key\n");
		writeFileSync(staleCacheFile, "export default 1;");

		const result = cleanStaleViteCache({
			cacheDir,
			inputPaths: [inputPath],
			markerPath,
		});

		expect(result.removed).toBe(true);
		expect(existsSync(staleCacheFile)).toBe(false);
		expect(readFileSync(markerPath, "utf8")).toBe(`${result.cacheKey}\n`);
	});

	test("removes legacy resource pack outputs from dist even when cache is current", () => {
		const tempDir = createTempDir();
		const cacheDir = join(tempDir, ".vite");
		const markerPath = join(cacheDir, ".superset-cache-key");
		const inputPath = join(tempDir, "package.json");
		const legacyPackDir = join(tempDir, "dist", "resource-packs");
		const legacyPackFile = join(legacyPackDir, "trellis-runtime/manifest.json");

		writeFileSync(inputPath, '{"dependencies":{"react":"19.0.0"}}');
		const expectedKey = computeViteCacheKey([inputPath]);
		mkdirSync(join(cacheDir, "deps"), { recursive: true });
		writeFileSync(markerPath, `${expectedKey}\n`);
		mkdirSync(join(legacyPackDir, "trellis-runtime"), { recursive: true });
		writeFileSync(legacyPackFile, "{}");

		const result = cleanStaleViteCache({
			cacheDir,
			inputPaths: [inputPath],
			legacyResourcePackDirs: [legacyPackDir],
			markerPath,
		});

		expect(result.removed).toBe(false);
		expect(result.removedLegacyResourcePackDirs).toEqual([legacyPackDir]);
		expect(existsSync(legacyPackDir)).toBe(false);
	});

	test("removes stale optimizer output when renderer bare imports change", () => {
		const tempDir = createTempDir();
		const cacheDir = join(tempDir, ".vite");
		const markerPath = join(cacheDir, ".superset-cache-key");
		const inputPath = join(tempDir, "package.json");
		const sourceDir = join(tempDir, "src");
		const sourcePath = join(sourceDir, "component.tsx");
		const staleCacheFile = join(cacheDir, "deps/react-icons_pi.js");

		writeFileSync(inputPath, '{"dependencies":{"react-icons":"5.0.0"}}');
		mkdirSync(sourceDir, { recursive: true });
		writeFileSync(
			sourcePath,
			'import { PiTextAa } from "react-icons/pi";\nexport const x = PiTextAa;\n',
		);
		mkdirSync(join(cacheDir, "deps"), { recursive: true });
		writeFileSync(
			markerPath,
			`${computeViteCacheKey([inputPath], [computeBareImportFingerprint([sourceDir])])}\n`,
		);
		writeFileSync(staleCacheFile, "export default 1;");

		writeFileSync(
			sourcePath,
			'import { ALargeSmall } from "lucide-react";\nexport const x = ALargeSmall;\n',
		);
		const result = cleanStaleViteCache({
			cacheDir,
			inputPaths: [inputPath],
			inputFingerprints: [computeBareImportFingerprint([sourceDir])],
			markerPath,
		});

		expect(result.removed).toBe(true);
		expect(existsSync(staleCacheFile)).toBe(false);
		expect(readFileSync(markerPath, "utf8")).toBe(`${result.cacheKey}\n`);
	});
});
