import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PackManager } from "./pack-manager";
import {
	type PackManifest,
	type PackManifestIndex,
	type PackStatus,
	packManifestIndexSchema,
} from "./types";

const TEST_PACK_ID = "demo-pack";
const TEST_VERSION = "1.0.0";
const ENCODER = new TextEncoder();

function sha256(data: Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

function makeManifest(content: string): PackManifest {
	const bytes = ENCODER.encode(content);
	return {
		packId: TEST_PACK_ID,
		version: TEST_VERSION,
		downloadUrl: "https://packs.example.test/demo-pack/1.0.0/",
		files: [
			{
				path: "bin/tool",
				size: bytes.byteLength,
				sha256: sha256(bytes),
				executable: true,
			},
		],
		executeHint: {
			runtime: "node",
			entry: "bin/tool",
		},
	};
}

function makeIndex(manifest: PackManifest): PackManifestIndex {
	return {
		schemaVersion: 1,
		packs: {
			[manifest.packId]: [manifest],
		},
	};
}

function packFilePath(homeDir: string): string {
	return join(homeDir, "packs", TEST_PACK_ID, TEST_VERSION, "bin", "tool");
}

function readHeader(
	headers: HeadersInit | undefined,
	name: string,
): string | null {
	if (!headers) return null;
	if (headers instanceof Headers) return headers.get(name);
	if (Array.isArray(headers)) {
		return (
			headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ??
			null
		);
	}
	return (
		Object.entries(headers).find(
			([key]) => key.toLowerCase() === name.toLowerCase(),
		)?.[1] ?? null
	);
}

describe("PackManager", () => {
	let homeDir: string;

	beforeEach(async () => {
		homeDir = await mkdtemp(join(tmpdir(), "superset-pack-manager-test-"));
	});

	afterEach(() => {
		if (homeDir && existsSync(homeDir)) {
			rmSync(homeDir, { recursive: true, force: true });
		}
	});

	test("rejects unsafe manifest file paths", () => {
		const unsafeManifest = {
			...makeManifest("hello"),
			files: [
				{
					path: "../outside",
					size: 5,
					sha256: sha256("hello"),
				},
			],
		};

		const result = packManifestIndexSchema.safeParse(makeIndex(unsafeManifest));

		expect(result.success).toBe(false);
	});

	test("returns installed from a verified cache without downloading", async () => {
		const content = "cached runtime";
		const manifest = makeManifest(content);
		const targetPath = packFilePath(homeDir);
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, content);
		const manager = new PackManager({
			homeDir,
			manifestIndex: makeIndex(manifest),
			fetchImpl: async () => {
				throw new Error("fetch should not be called for a valid cache");
			},
		});

		const resolution = await manager.resolvePack(TEST_PACK_ID);

		expect(resolution.ok).toBe(true);
		if (resolution.ok) {
			expect(resolution.path).toBe(
				join(homeDir, "packs", TEST_PACK_ID, TEST_VERSION),
			);
			expect(resolution.executeHint?.entry).toBe("bin/tool");
		}
		expect(readFileSync(targetPath, "utf8")).toBe(content);
	});

	test("downloads and verifies a missing pack", async () => {
		const content = "downloaded runtime";
		const manifest = makeManifest(content);
		const statuses: PackStatus[] = [];
		const manager = new PackManager({
			homeDir,
			manifestIndex: makeIndex(manifest),
			fetchImpl: async (url) => {
				expect(url).toBe("https://packs.example.test/demo-pack/1.0.0/bin/tool");
				return new Response(ENCODER.encode(content), { status: 200 });
			},
		});
		manager.onStatusChange((status) => statuses.push(status));

		const resolution = await manager.resolvePack(TEST_PACK_ID);

		expect(resolution.ok).toBe(true);
		expect(readFileSync(packFilePath(homeDir), "utf8")).toBe(content);
		expect(
			statuses.some(
				(status) =>
					status.status === "downloading" &&
					status.progress?.bytesDownloaded === manifest.files[0].size,
			),
		).toBe(true);
		expect(statuses.at(-1)?.status).toBe("installed");
	});

	test("replaces a corrupt cache after hash verification fails", async () => {
		const content = "correct runtime";
		const manifest = makeManifest(content);
		const targetPath = packFilePath(homeDir);
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, "corrupt runtime");
		let fetchCount = 0;
		const manager = new PackManager({
			homeDir,
			manifestIndex: makeIndex(manifest),
			fetchImpl: async () => {
				fetchCount += 1;
				return new Response(ENCODER.encode(content), { status: 200 });
			},
		});

		const resolution = await manager.resolvePack(TEST_PACK_ID);

		expect(resolution.ok).toBe(true);
		expect(fetchCount).toBe(1);
		expect(readFileSync(targetPath, "utf8")).toBe(content);
	});

	test("resumes a partial temp download with an HTTP Range request", async () => {
		const content = "resumable runtime";
		const manifest = makeManifest(content);
		const targetPath = packFilePath(homeDir);
		const tempPath = `${targetPath}.download`;
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(tempPath, content.slice(0, 4));
		const observedRanges: string[] = [];
		const manager = new PackManager({
			homeDir,
			manifestIndex: makeIndex(manifest),
			fetchImpl: async (_url, init) => {
				const range = readHeader(init?.headers, "range");
				if (range) observedRanges.push(range);
				return new Response(ENCODER.encode(content.slice(4)), { status: 206 });
			},
		});

		const resolution = await manager.resolvePack(TEST_PACK_ID);

		expect(resolution.ok).toBe(true);
		expect(observedRanges).toEqual(["bytes=4-"]);
		expect(readFileSync(targetPath, "utf8")).toBe(content);
	});
});
