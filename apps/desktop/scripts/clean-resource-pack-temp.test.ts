import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cleanResourcePackTemp,
	collectResourcePackTempTargets,
} from "./clean-resource-pack-temp";

const tempDirs: string[] = [];

function createTempDir(): string {
	const tempDir = mkdtempSync(join(tmpdir(), "superset-pack-temp-clean-"));
	tempDirs.push(tempDir);
	return tempDir;
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

describe("cleanResourcePackTemp", () => {
	test("collects generated pack temp directories without collecting reports", () => {
		const tempRoot = createTempDir();
		const generated = [
			"resource-packs",
			"all-pack-archive-check",
			"native-pack-version-check",
			"mastracode-pack-check",
			"claude-agent-pack-linux-x64-check",
			"cli-pack-devdep-check",
		];
		for (const name of generated) {
			mkdirSync(join(tempRoot, name), { recursive: true });
		}
		mkdirSync(join(tempRoot, "runtime-performance-reports"), {
			recursive: true,
		});
		mkdirSync(join(tempRoot, "build-stats"), { recursive: true });

		expect(
			collectResourcePackTempTargets({ tempRoot }).map((path) =>
				path.replace(`${tempRoot}/`, ""),
			),
		).toEqual(generated.sort());
	});

	test("removes only generated pack temp directories", () => {
		const tempRoot = createTempDir();
		const packDir = join(tempRoot, "mastracode-pack-check");
		const reportDir = join(tempRoot, "runtime-performance-reports");
		mkdirSync(packDir, { recursive: true });
		mkdirSync(reportDir, { recursive: true });
		writeFileSync(join(packDir, "pack.zip"), "zip");
		writeFileSync(join(reportDir, "report.json"), "{}");

		const result = cleanResourcePackTemp({ tempRoot });

		expect(result.removed).toEqual([packDir]);
		expect(existsSync(packDir)).toBe(false);
		expect(existsSync(reportDir)).toBe(true);
	});

	test("supports dry run", () => {
		const tempRoot = createTempDir();
		const packDir = join(tempRoot, "resource-pack-cache-smoke");
		mkdirSync(packDir, { recursive: true });

		const result = cleanResourcePackTemp({ dryRun: true, tempRoot });

		expect(result.removed).toEqual([packDir]);
		expect(existsSync(packDir)).toBe(true);
	});
});
