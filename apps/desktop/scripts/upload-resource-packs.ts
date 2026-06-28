import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import {
	hasObjectStorageObject,
	isObjectStorageConfigured,
	putObjectStorageObject,
} from "@superset/trpc/capability-artifact-storage";
import fg from "fast-glob";
import {
	type PackManifest,
	packManifestIndexSchema,
} from "../src/main/lib/pack-system/types";
import { defaultResourcePackOutDir } from "./resource-pack-paths";

interface UploadArgs {
	includeLooseFiles: boolean;
	packDir: string;
	prefix: string;
	skipExisting: boolean;
}

function fail(message: string): never {
	console.error(`[upload:resource-packs] ${message}`);
	process.exit(1);
}

export function parseResourcePackUploadArgs(
	argv = process.argv.slice(2),
): UploadArgs {
	const parsed: UploadArgs = {
		includeLooseFiles: false,
		packDir: defaultResourcePackOutDir,
		prefix: "packs",
		skipExisting: false,
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
			case "--pack-dir":
				parsed.packDir = resolve(readValue());
				break;
			case "--prefix":
				parsed.prefix = readValue().replace(/^\/+|\/+$/g, "");
				break;
			case "--skip-existing":
				parsed.skipExisting = readValue() !== "false";
				break;
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}
	return parsed;
}

function contentTypeFor(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".json":
			return "application/json";
		case ".zip":
			return "application/zip";
		case ".js":
		case ".mjs":
		case ".cjs":
			return "text/javascript";
		case ".md":
			return "text/markdown";
		case ".txt":
		case ".yaml":
		case ".yml":
			return "text/plain";
		default:
			return "application/octet-stream";
	}
}

function addManifestUploadFiles(files: Set<string>, pack: PackManifest): void {
	files.add(`${pack.packId}/manifest.json`);
	files.add(`${pack.packId}/${pack.version}/manifest.json`);
	if (pack.archive) {
		files.add(`${pack.packId}/${pack.version}/${pack.archive.path}`);
		return;
	}

	for (const file of pack.files) {
		files.add(`${pack.packId}/${pack.version}/${file.path}`);
	}
}

export async function collectResourcePackUploadFiles(args: {
	includeLooseFiles: boolean;
	packDir: string;
}): Promise<string[]> {
	if (args.includeLooseFiles) {
		return (
			await fg("**/*", {
				cwd: args.packDir,
				dot: true,
				onlyFiles: true,
			})
		).sort();
	}

	const index = packManifestIndexSchema.parse(
		JSON.parse(
			await readFile(join(args.packDir, "pack-manifest-index.json"), "utf8"),
		),
	);
	const files = new Set<string>(["pack-manifest-index.json"]);
	for (const packVersions of Object.values(index.packs)) {
		for (const pack of packVersions) {
			addManifestUploadFiles(files, pack);
		}
	}
	return [...files].sort();
}

async function main() {
	const args = parseResourcePackUploadArgs();
	if (!isObjectStorageConfigured()) {
		fail("Object storage is not configured. Set SUPERSET_OBJECT_STORAGE_*.");
	}

	const files = await collectResourcePackUploadFiles({
		includeLooseFiles: args.includeLooseFiles,
		packDir: args.packDir,
	});
	if (files.length === 0) {
		fail(`No resource pack files found in ${args.packDir}`);
	}

	let totalBytes = 0;
	let uploadedFiles = 0;
	let skippedFiles = 0;
	for (const file of files.sort()) {
		const key = `${args.prefix}/${file}`;
		if (args.skipExisting && (await hasObjectStorageObject(key))) {
			skippedFiles += 1;
			continue;
		}
		const body = await readFile(join(args.packDir, file));
		totalBytes += body.byteLength;
		await putObjectStorageObject({
			key,
			body,
			contentType: contentTypeFor(file),
		});
		uploadedFiles += 1;
	}

	console.log("# Resource Pack Upload");
	console.log(`- Files: ${files.length}`);
	console.log(`- Uploaded files: ${uploadedFiles}`);
	console.log(`- Skipped existing files: ${skippedFiles}`);
	console.log(`- Uploaded bytes: ${totalBytes}`);
	console.log(`- Prefix: ${args.prefix}`);
	console.log(`- Source: ${relative(process.cwd(), args.packDir)}`);
	console.log(`- Include loose files: ${args.includeLooseFiles}`);
}

if (import.meta.main) {
	void main().catch((error) => {
		fail(error instanceof Error ? error.message : String(error));
	});
}
