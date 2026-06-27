import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectResourcePackUploadFiles } from "./upload-resource-packs";

const tempDirs: string[] = [];

function createPackDir(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-pack-upload-"));
	tempDirs.push(root);
	const versionRoot = join(root, "trellis-runtime", "1.0.0");
	mkdirSync(versionRoot, { recursive: true });
	writeFileSync(join(root, "pack-manifest-index.json"), "");
	writeFileSync(join(root, "trellis-runtime", "manifest.json"), "");
	writeFileSync(join(versionRoot, "manifest.json"), "");
	writeFileSync(join(versionRoot, "pack.zip"), "zip");
	writeFileSync(join(versionRoot, "small.txt"), "small");
	writeFileSync(join(versionRoot, "large.bin"), "large");
	writeFileSync(
		join(root, "pack-manifest-index.json"),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				packs: {
					"trellis-runtime": [
						{
							packId: "trellis-runtime",
							version: "1.0.0",
							downloadUrl:
								"https://cdn.example.test/packs/trellis-runtime/1.0.0/",
							archive: {
								format: "zip",
								path: "pack.zip",
								size: 3,
								sha256:
									"4a70fe9aa6436e02c2dea340fbd1e352e4ef2d8ce6ca52ad25d4b95471fc8bf2",
							},
							files: [
								{
									path: "small.txt",
									size: 5,
									sha256:
										"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
								},
								{
									path: "large.bin",
									size: 5,
									sha256:
										"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
								},
							],
						},
					],
				},
			},
			null,
			2,
		)}\n`,
	);
	return root;
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

describe("collectResourcePackUploadFiles", () => {
	test("uploads only manifests and archives by default", async () => {
		const packDir = createPackDir();

		await expect(
			collectResourcePackUploadFiles({
				includeLooseFiles: false,
				packDir,
			}),
		).resolves.toEqual([
			"pack-manifest-index.json",
			"trellis-runtime/1.0.0/manifest.json",
			"trellis-runtime/1.0.0/pack.zip",
			"trellis-runtime/manifest.json",
		]);
	});

	test("can include loose files for fallback validation", async () => {
		const packDir = createPackDir();

		await expect(
			collectResourcePackUploadFiles({
				includeLooseFiles: true,
				packDir,
			}),
		).resolves.toEqual([
			"pack-manifest-index.json",
			"trellis-runtime/1.0.0/large.bin",
			"trellis-runtime/1.0.0/manifest.json",
			"trellis-runtime/1.0.0/pack.zip",
			"trellis-runtime/1.0.0/small.txt",
			"trellis-runtime/manifest.json",
		]);
	});
});
