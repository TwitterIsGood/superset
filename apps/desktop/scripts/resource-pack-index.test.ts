import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PackManifest } from "../src/main/lib/pack-system/types";
import { writeMergedResourcePackAppIndex } from "./resource-pack-index";

const tempDirs: string[] = [];
const sha256 =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function createManifest(packId: string, version: string): PackManifest {
	return {
		schemaVersion: 1,
		packId,
		version,
		downloadUrl: `https://cdn.example.test/packs/${packId}/${version}/`,
		archive: {
			format: "zip",
			path: "pack.zip",
			sha256,
			size: 1,
		},
		files: [
			{
				path: "file.txt",
				sha256,
				size: 0,
			},
		],
	};
}

function createTempDir(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-pack-index-"));
	tempDirs.push(root);
	return root;
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

describe("writeMergedResourcePackAppIndex", () => {
	test("merges a pack into the default and embedded app indexes", async () => {
		const outDir = createTempDir();
		const appIndexOut = join(outDir, "embedded", "pack-manifest-index.json");
		const existingManifest = createManifest("trellis-runtime", "1.0.0");
		mkdirSync(join(outDir, "embedded"), { recursive: true });
		writeFileSync(
			appIndexOut,
			JSON.stringify({
				schemaVersion: 1,
				packs: {
					"trellis-runtime": [existingManifest],
				},
			}),
		);

		await writeMergedResourcePackAppIndex({
			appIndexOut,
			generatedAt: "2026-06-27T00:00:00.000Z",
			manifest: createManifest("claude-agent-runtime", "1.0.0-darwin-arm64"),
			outDir,
			packId: "claude-agent-runtime",
		});

		const defaultIndex = JSON.parse(
			readFileSync(join(outDir, "pack-manifest-index.json"), "utf8"),
		);
		const embeddedIndex = JSON.parse(readFileSync(appIndexOut, "utf8"));
		expect(Object.keys(defaultIndex.packs).sort()).toEqual([
			"claude-agent-runtime",
			"trellis-runtime",
		]);
		expect(embeddedIndex).toEqual(defaultIndex);
	});
});
