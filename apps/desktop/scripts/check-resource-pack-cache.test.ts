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
	checkResourcePackCache,
	parseCheckResourcePackCacheArgs,
} from "./check-resource-pack-cache";

const tempDirs: string[] = [];

function createPackCache(args: {
	baseUrl?: string;
	includeCli?: boolean;
	omitArchive?: boolean;
}): { appIndexOut: string; packDir: string } {
	const root = mkdtempSync(join(tmpdir(), "superset-pack-cache-"));
	tempDirs.push(root);
	const packDir = join(root, "resource-packs");
	const appIndexOut = join(
		root,
		"resources",
		"pack-system",
		"pack-manifest-index.json",
	);
	const baseUrl = args.baseUrl ?? "https://cdn.example.test/packs/";
	const packIds = [
		"trellis-runtime",
		"claude-agent-runtime",
		"mastracode-runtime",
		...(args.includeCli ? ["superset-cli-runtime"] : []),
	];
	const packs: Record<string, unknown[]> = {};

	for (const packId of packIds) {
		const version =
			packId === "trellis-runtime" ? "1.0.0" : `1.0.0-darwin-arm64`;
		const versionRoot = join(packDir, packId, version);
		mkdirSync(versionRoot, { recursive: true });
		writeFileSync(join(versionRoot, "pack.zip"), "zip");
		const manifest = {
			schemaVersion: 1,
			packId,
			version,
			downloadUrl: `${baseUrl}${packId}/${version}/`,
			...(args.omitArchive
				? {}
				: {
						archive: {
							format: "zip",
							path: "pack.zip",
							sha256:
								"4a70fe9aa6436e02c2dea340fbd1e352e4ef2d8ce6ca52ad25d4b95471fc8bf2",
							size: 3,
						},
					}),
			files: [
				{
					path: "small.txt",
					sha256:
						"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
					size: 5,
				},
			],
		};
		writeFileSync(join(versionRoot, "manifest.json"), JSON.stringify(manifest));
		packs[packId] = [manifest];
	}

	writeFileSync(
		join(packDir, "pack-manifest-index.json"),
		JSON.stringify({ schemaVersion: 1, packs }),
	);

	return { appIndexOut, packDir };
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

describe("parseCheckResourcePackCacheArgs", () => {
	test("parses cache options", () => {
		expect(
			parseCheckResourcePackCacheArgs([
				"--pack-dir=/tmp/packs",
				"--app-index-out",
				"/tmp/app-index.json",
				"--base-url",
				"https://cdn.example.test/packs",
				"--bundle-cli=false",
			]),
		).toMatchObject({
			baseUrl: "https://cdn.example.test/packs",
			bundleCli: false,
		});
	});
});

describe("checkResourcePackCache", () => {
	test("restores required app index for bundled-cli builds", async () => {
		const { appIndexOut, packDir } = createPackCache({});

		const result = await checkResourcePackCache({
			appIndexOut,
			baseUrl: "https://cdn.example.test/packs",
			bundleCli: true,
			packDir,
		});

		expect(result.packs.map((pack) => pack.packId)).toEqual([
			"trellis-runtime",
			"claude-agent-runtime",
			"mastracode-runtime",
		]);
		expect(existsSync(appIndexOut)).toBe(true);
		expect(readFileSync(appIndexOut, "utf8")).toContain("trellis-runtime");
	});

	test("requires cli pack when bundled cli is disabled", async () => {
		const { appIndexOut, packDir } = createPackCache({});

		await expect(
			checkResourcePackCache({
				appIndexOut,
				baseUrl: "https://cdn.example.test/packs",
				bundleCli: false,
				packDir,
			}),
		).rejects.toThrow("missing superset-cli-runtime manifest");
	});

	test("accepts cli pack when bundled cli is disabled", async () => {
		const { appIndexOut, packDir } = createPackCache({ includeCli: true });

		const result = await checkResourcePackCache({
			appIndexOut,
			baseUrl: "https://cdn.example.test/packs",
			bundleCli: false,
			packDir,
		});

		expect(result.packs.map((pack) => pack.packId)).toContain(
			"superset-cli-runtime",
		);
	});

	test("rejects cache generated for a different public base URL", async () => {
		const { appIndexOut, packDir } = createPackCache({
			baseUrl: "https://old.example.test/packs/",
		});

		await expect(
			checkResourcePackCache({
				appIndexOut,
				baseUrl: "https://cdn.example.test/packs",
				bundleCli: true,
				packDir,
			}),
		).rejects.toThrow("does not match");
	});

	test("rejects legacy cache without archive metadata", async () => {
		const { appIndexOut, packDir } = createPackCache({ omitArchive: true });

		await expect(
			checkResourcePackCache({
				appIndexOut,
				baseUrl: "https://cdn.example.test/packs",
				bundleCli: true,
				packDir,
			}),
		).rejects.toThrow("missing archive metadata");
	});
});
