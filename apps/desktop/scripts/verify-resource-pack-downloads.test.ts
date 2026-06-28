import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parseVerifyResourcePackDownloadsArgs,
	verifyResourcePackDownloads,
} from "./verify-resource-pack-downloads";

const ORIGINAL_FETCH = globalThis.fetch;
const tempDirs: string[] = [];

function createPackIndex(): {
	archiveHash: string;
	indexPath: string;
	smallHash: string;
} {
	const root = mkdtempSync(join(tmpdir(), "superset-pack-verify-"));
	tempDirs.push(root);
	const archiveHash =
		"4a70fe9aa6436e02c2dea340fbd1e352e4ef2d8ce6ca52ad25d4b95471fc8bf2";
	const smallHash =
		"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
	const indexPath = join(root, "pack-manifest-index.json");
	writeFileSync(
		indexPath,
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
								sha256: archiveHash,
							},
							files: [
								{
									path: "small.txt",
									size: 5,
									sha256: smallHash,
								},
								{
									path: "large.bin",
									size: 2_000_000,
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
	return { archiveHash, indexPath, smallHash };
}

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

describe("parseVerifyResourcePackDownloadsArgs", () => {
	test("parses verification options", () => {
		expect(
			parseVerifyResourcePackDownloadsArgs([
				"--index",
				"dist/resource-packs/pack-manifest-index.json",
				"--max-hash-bytes=128",
				"--include-loose-files=true",
				"--retries",
				"5",
			]),
		).toMatchObject({
			includeLooseFiles: true,
			maxHashBytes: 128,
			retries: 5,
		});
	});
});

describe("verifyResourcePackDownloads", () => {
	test("verifies remote manifests and archive by default", async () => {
		const { archiveHash, indexPath, smallHash } = createPackIndex();
		const calls: Array<{ method: string; url: string }> = [];
		globalThis.fetch = async (input, init) => {
			const url = input.toString();
			const method = init?.method ?? "GET";
			calls.push({ method, url });

			if (url.endsWith("/manifest.json")) {
				return Response.json({
					packId: "trellis-runtime",
					version: "1.0.0",
					downloadUrl: "https://cdn.example.test/packs/trellis-runtime/1.0.0/",
					archive: {
						format: "zip",
						path: "pack.zip",
						size: 3,
						sha256: archiveHash,
					},
					files: [{ path: "small.txt", size: 5, sha256: smallHash }],
				});
			}
			if (method === "HEAD" && url.endsWith("/pack.zip")) {
				return new Response(null, {
					headers: { "content-length": "3" },
					status: 200,
				});
			}
			if (method === "GET" && url.endsWith("/pack.zip")) {
				return new Response("zip", { status: 200 });
			}
			if (method === "HEAD" && url.endsWith("/small.txt")) {
				return new Response(null, {
					headers: { "content-length": "5" },
					status: 200,
				});
			}
			if (method === "GET" && url.endsWith("/small.txt")) {
				return new Response("hello", { status: 200 });
			}
			if (method === "HEAD" && url.endsWith("/large.bin")) {
				return new Response(null, {
					headers: { "content-length": "2000000" },
					status: 200,
				});
			}
			return new Response(null, { status: 404 });
		};

		const result = await verifyResourcePackDownloads({
			includeLooseFiles: false,
			indexPath,
			maxHashBytes: 1024,
			retries: 0,
		});

		expect(result).toMatchObject({
			packs: 1,
		});
		expect(result.files).toHaveLength(1);
		expect(result.files.map((file) => file.hashChecked)).toEqual([true]);
		expect(calls).toEqual([
			{
				method: "GET",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/manifest.json",
			},
			{
				method: "HEAD",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/pack.zip",
			},
			{
				method: "GET",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/pack.zip",
			},
		]);
	});

	test("can verify loose files when requested", async () => {
		const { archiveHash, indexPath, smallHash } = createPackIndex();
		const calls: Array<{ method: string; url: string }> = [];
		globalThis.fetch = async (input, init) => {
			const url = input.toString();
			const method = init?.method ?? "GET";
			calls.push({ method, url });

			if (url.endsWith("/manifest.json")) {
				return Response.json({
					packId: "trellis-runtime",
					version: "1.0.0",
					downloadUrl: "https://cdn.example.test/packs/trellis-runtime/1.0.0/",
					archive: {
						format: "zip",
						path: "pack.zip",
						size: 3,
						sha256: archiveHash,
					},
					files: [{ path: "small.txt", size: 5, sha256: smallHash }],
				});
			}
			if (method === "HEAD" && url.endsWith("/pack.zip")) {
				return new Response(null, {
					headers: { "content-length": "3" },
					status: 200,
				});
			}
			if (method === "GET" && url.endsWith("/pack.zip")) {
				return new Response("zip", { status: 200 });
			}
			if (method === "HEAD" && url.endsWith("/small.txt")) {
				return new Response(null, {
					headers: { "content-length": "5" },
					status: 200,
				});
			}
			if (method === "GET" && url.endsWith("/small.txt")) {
				return new Response("hello", { status: 200 });
			}
			if (method === "HEAD" && url.endsWith("/large.bin")) {
				return new Response(null, {
					headers: { "content-length": "2000000" },
					status: 200,
				});
			}
			return new Response(null, { status: 404 });
		};

		const result = await verifyResourcePackDownloads({
			includeLooseFiles: true,
			indexPath,
			maxHashBytes: 1024,
			retries: 0,
		});

		expect(result.files).toHaveLength(3);
		expect(result.files.map((file) => file.hashChecked)).toEqual([
			true,
			true,
			false,
		]);
		expect(calls).toEqual([
			{
				method: "GET",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/manifest.json",
			},
			{
				method: "HEAD",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/pack.zip",
			},
			{
				method: "GET",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/pack.zip",
			},
			{
				method: "HEAD",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/small.txt",
			},
			{
				method: "GET",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/small.txt",
			},
			{
				method: "HEAD",
				url: "https://cdn.example.test/packs/trellis-runtime/1.0.0/large.bin",
			},
		]);
	});

	test("fails when remote content length does not match the manifest", async () => {
		const { indexPath, smallHash } = createPackIndex();
		globalThis.fetch = async (input, init) => {
			const url = input.toString();
			const method = init?.method ?? "GET";
			if (url.endsWith("/manifest.json")) {
				return Response.json({
					packId: "trellis-runtime",
					version: "1.0.0",
					downloadUrl: "https://cdn.example.test/packs/trellis-runtime/1.0.0/",
					files: [{ path: "small.txt", size: 5, sha256: smallHash }],
				});
			}
			if (method === "HEAD") {
				return new Response(null, {
					headers: { "content-length": "6" },
					status: 200,
				});
			}
			return new Response("hello", { status: 200 });
		};

		await expect(
			verifyResourcePackDownloads({
				includeLooseFiles: true,
				indexPath,
				maxHashBytes: 1024,
				retries: 0,
			}),
		).rejects.toThrow("Content length mismatch");
	});
});
