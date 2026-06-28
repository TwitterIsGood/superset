import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
	type PackArchiveManifest,
	type PackFileManifest,
	type PackManifest,
	packManifestIndexSchema,
	packManifestSchema,
} from "../src/main/lib/pack-system/types";
import { defaultResourcePackOutDir } from "./resource-pack-paths";

interface VerifyArgs {
	includeLooseFiles: boolean;
	indexPath: string;
	maxHashBytes: number;
	retries: number;
}

interface VerifiedFile {
	hashChecked: boolean;
	path: string;
	size: number;
	url: string;
}

export interface VerifyPackDownloadsResult {
	files: VerifiedFile[];
	packs: number;
}

const DEFAULT_MAX_HASH_BYTES = 1024 * 1024;

function fail(message: string): never {
	console.error(`[verify:resource-pack-downloads] ${message}`);
	process.exit(1);
}

export function parseVerifyResourcePackDownloadsArgs(
	argv: string[],
): VerifyArgs {
	const parsed: VerifyArgs = {
		includeLooseFiles: false,
		indexPath: resolve(defaultResourcePackOutDir, "pack-manifest-index.json"),
		maxHashBytes: DEFAULT_MAX_HASH_BYTES,
		retries: 3,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const [flag, inlineValue] = arg.split("=", 2);
		const readValue = () => {
			if (inlineValue) return inlineValue;
			const value = argv[index + 1];
			if (!value) fail(`${flag} requires a value`);
			index += 1;
			return value;
		};

		switch (flag) {
			case "--include-loose-files":
				parsed.includeLooseFiles = readValue() === "true";
				break;
			case "--index":
				parsed.indexPath = resolve(readValue());
				break;
			case "--max-hash-bytes": {
				const value = Number(readValue());
				if (!Number.isFinite(value) || value < 0) {
					fail("--max-hash-bytes must be a non-negative number");
				}
				parsed.maxHashBytes = value;
				break;
			}
			case "--retries": {
				const value = Number(readValue());
				if (!Number.isInteger(value) || value < 0) {
					fail("--retries must be a non-negative integer");
				}
				parsed.retries = value;
				break;
			}
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}

	return parsed;
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function packManifestUrl(pack: PackManifest): string {
	return new URL("manifest.json", ensureTrailingSlash(pack.downloadUrl)).href;
}

function packFileUrl(pack: PackManifest, file: PackFileManifest): string {
	return (
		file.downloadUrl ??
		new URL(file.path, ensureTrailingSlash(pack.downloadUrl)).href
	);
}

function packArchiveUrl(
	pack: PackManifest,
	archive: PackArchiveManifest,
): string {
	return (
		archive.downloadUrl ??
		new URL(archive.path, ensureTrailingSlash(pack.downloadUrl)).href
	);
}

async function fetchWithRetries(
	url: string,
	init: RequestInit,
	retries: number,
): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(url, init);
			if (response.ok) return response;
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}

		if (attempt < retries) {
			await new Promise((resolveDelay) =>
				setTimeout(resolveDelay, 250 * (attempt + 1)),
			);
		}
	}

	throw new Error(
		`${init.method ?? "GET"} ${url} failed after ${retries + 1} attempt(s): ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
}

async function verifyRemoteManifest(
	pack: PackManifest,
	retries: number,
): Promise<void> {
	const url = packManifestUrl(pack);
	const response = await fetchWithRetries(url, { method: "GET" }, retries);
	const remote = packManifestSchema.parse(await response.json());
	if (remote.packId !== pack.packId || remote.version !== pack.version) {
		throw new Error(
			`Remote manifest mismatch at ${url}: expected ${pack.packId}@${pack.version}, got ${remote.packId}@${remote.version}`,
		);
	}
}

function sha256Hex(data: Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}

async function verifyRemoteFile(args: {
	file: PackFileManifest;
	maxHashBytes: number;
	pack: PackManifest;
	retries: number;
}): Promise<VerifiedFile> {
	const url = packFileUrl(args.pack, args.file);
	const head = await fetchWithRetries(url, { method: "HEAD" }, args.retries);
	const contentLength = head.headers.get("content-length");
	if (contentLength !== null && Number(contentLength) !== args.file.size) {
		throw new Error(
			`Content length mismatch for ${url}: expected ${args.file.size}, got ${contentLength}`,
		);
	}

	if (args.file.size <= args.maxHashBytes) {
		const response = await fetchWithRetries(
			url,
			{ method: "GET" },
			args.retries,
		);
		const bytes = new Uint8Array(await response.arrayBuffer());
		const hash = sha256Hex(bytes);
		if (hash !== args.file.sha256) {
			throw new Error(
				`SHA256 mismatch for ${url}: expected ${args.file.sha256}, got ${hash}`,
			);
		}
		return {
			hashChecked: true,
			path: args.file.path,
			size: args.file.size,
			url,
		};
	}

	return {
		hashChecked: false,
		path: args.file.path,
		size: args.file.size,
		url,
	};
}

async function verifyRemoteArchive(args: {
	archive: PackArchiveManifest;
	maxHashBytes: number;
	pack: PackManifest;
	retries: number;
}): Promise<VerifiedFile> {
	const file: PackFileManifest = {
		path: args.archive.path,
		size: args.archive.size,
		sha256: args.archive.sha256,
		downloadUrl: packArchiveUrl(args.pack, args.archive),
	};
	return verifyRemoteFile({
		file,
		maxHashBytes: args.maxHashBytes,
		pack: args.pack,
		retries: args.retries,
	});
}

export async function verifyResourcePackDownloads(
	args: VerifyArgs,
): Promise<VerifyPackDownloadsResult> {
	const index = packManifestIndexSchema.parse(
		JSON.parse(await readFile(args.indexPath, "utf8")),
	);
	const files: VerifiedFile[] = [];

	for (const packVersions of Object.values(index.packs)) {
		for (const pack of packVersions) {
			await verifyRemoteManifest(pack, args.retries);
			if (pack.archive) {
				files.push(
					await verifyRemoteArchive({
						archive: pack.archive,
						maxHashBytes: args.maxHashBytes,
						pack,
						retries: args.retries,
					}),
				);
			}
			if (pack.archive && !args.includeLooseFiles) {
				continue;
			}
			for (const file of pack.files) {
				files.push(
					await verifyRemoteFile({
						file,
						maxHashBytes: args.maxHashBytes,
						pack,
						retries: args.retries,
					}),
				);
			}
		}
	}

	return {
		files,
		packs: Object.values(index.packs).reduce(
			(count, versions) => count + versions.length,
			0,
		),
	};
}

async function main() {
	const args = parseVerifyResourcePackDownloadsArgs(process.argv.slice(2));
	const result = await verifyResourcePackDownloads(args);
	const hashCheckedFiles = result.files.filter(
		(file) => file.hashChecked,
	).length;

	console.log("# Resource Pack Download Verification");
	console.log(`- Index: ${relative(process.cwd(), args.indexPath)}`);
	console.log(`- Packs: ${result.packs}`);
	console.log(`- Files: ${result.files.length}`);
	console.log(`- Hash-checked files: ${hashCheckedFiles}`);
	console.log(`- HEAD-only files: ${result.files.length - hashCheckedFiles}`);
	console.log(`- Include loose files: ${args.includeLooseFiles}`);
}

if (import.meta.main) {
	void main().catch((error) => {
		fail(error instanceof Error ? error.message : String(error));
	});
}
