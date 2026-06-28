import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	EMPTY_PACK_MANIFEST_INDEX,
	loadPackManifestIndex,
	resolveEmbeddedPackManifestIndexPath,
} from "./manifest-index";
import type { PackManifestIndex } from "./types";

const tempDirs: string[] = [];

function makeIndex(version = "1.0.0"): PackManifestIndex {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-26T00:00:00.000Z",
		packs: {
			"trellis-runtime": [
				{
					schemaVersion: 1,
					packId: "trellis-runtime",
					version,
					downloadUrl: `https://cdn.superset.sh/packs/trellis-runtime/${version}/`,
					files: [
						{
							path: "node_modules/@mindfoldhq/trellis/bin/trellis.js",
							size: 12,
							sha256:
								"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
						},
					],
				},
			],
		},
	};
}

async function writeIndex(
	path: string,
	index: PackManifestIndex,
): Promise<void> {
	await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "superset-pack-index-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
	);
});

describe("loadPackManifestIndex", () => {
	it("loads manifest index JSON from env before other sources", async () => {
		const dir = await makeTempDir();
		const pathIndex = makeIndex("1.0.0");
		const embeddedIndex = makeIndex("2.0.0");
		const envIndex = makeIndex("3.0.0");
		const path = join(dir, "index.json");
		const embeddedPath = join(dir, "embedded.json");
		await writeIndex(path, pathIndex);
		await writeIndex(embeddedPath, embeddedIndex);

		expect(
			loadPackManifestIndex(
				{
					SUPERSET_PACK_MANIFEST_INDEX_JSON: JSON.stringify(envIndex),
					SUPERSET_PACK_MANIFEST_INDEX_PATH: path,
				},
				embeddedPath,
			),
		).toEqual(envIndex);
	});

	it("loads manifest index path from env before embedded resources", async () => {
		const dir = await makeTempDir();
		const pathIndex = makeIndex("1.0.0");
		const embeddedIndex = makeIndex("2.0.0");
		const path = join(dir, "index.json");
		const embeddedPath = join(dir, "embedded.json");
		await writeIndex(path, pathIndex);
		await writeIndex(embeddedPath, embeddedIndex);

		expect(
			loadPackManifestIndex(
				{
					SUPERSET_PACK_MANIFEST_INDEX_PATH: path,
				},
				embeddedPath,
			),
		).toEqual(pathIndex);
	});

	it("loads embedded manifest index when env overrides are absent", async () => {
		const dir = await makeTempDir();
		const embeddedIndex = makeIndex("2.0.0");
		const embeddedPath = join(dir, "embedded.json");
		await writeIndex(embeddedPath, embeddedIndex);

		expect(loadPackManifestIndex({}, embeddedPath)).toEqual(embeddedIndex);
	});

	it("returns an empty index when no source exists", () => {
		expect(loadPackManifestIndex({}, "/missing/pack-index.json")).toEqual(
			EMPTY_PACK_MANIFEST_INDEX,
		);
	});
});

describe("resolveEmbeddedPackManifestIndexPath", () => {
	it("resolves the packaged resource path", () => {
		expect(
			resolveEmbeddedPackManifestIndexPath({
				appPath: "/app",
				bundleDir: "/app/dist/main",
				isPackaged: true,
				nodeEnv: "production",
				resourcesPath: "/app/Contents/Resources",
			}),
		).toBe(
			"/app/Contents/Resources/resources/pack-system/pack-manifest-index.json",
		);
	});

	it("resolves the development source resource path", () => {
		expect(
			resolveEmbeddedPackManifestIndexPath({
				appPath: "/repo/apps/desktop",
				bundleDir: "/repo/apps/desktop/dist/main",
				isPackaged: false,
				nodeEnv: "development",
				resourcesPath: "/unused",
			}),
		).toBe(
			"/repo/apps/desktop/src/resources/pack-system/pack-manifest-index.json",
		);
	});
});
