import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import {
	isObjectStorageConfigured,
	putObjectStorageObject,
} from "@superset/trpc/capability-artifact-storage";
import fg from "fast-glob";

interface UploadArgs {
	packDir: string;
	prefix: string;
}

function fail(message: string): never {
	console.error(`[upload:resource-packs] ${message}`);
	process.exit(1);
}

function parseArgs(): UploadArgs {
	const parsed: UploadArgs = {
		packDir: resolve("dist", "resource-packs"),
		prefix: "packs",
	};
	const args = process.argv.slice(2);
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const [flag, inlineValue] = arg.split("=", 2);
		const readValue = () => {
			if (inlineValue) return inlineValue;
			const value = args[index + 1];
			if (!value) fail(`${flag} requires a value`);
			index += 1;
			return value;
		};

		switch (flag) {
			case "--pack-dir":
				parsed.packDir = resolve(readValue());
				break;
			case "--prefix":
				parsed.prefix = readValue().replace(/^\/+|\/+$/g, "");
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

async function main() {
	const args = parseArgs();
	if (!isObjectStorageConfigured()) {
		fail("Object storage is not configured. Set SUPERSET_OBJECT_STORAGE_*.");
	}

	const files = await fg("**/*", {
		cwd: args.packDir,
		dot: true,
		onlyFiles: true,
	});
	if (files.length === 0) {
		fail(`No resource pack files found in ${args.packDir}`);
	}

	let totalBytes = 0;
	for (const file of files.sort()) {
		const body = await readFile(join(args.packDir, file));
		totalBytes += body.byteLength;
		const key = `${args.prefix}/${file}`;
		await putObjectStorageObject({
			key,
			body,
			contentType: contentTypeFor(file),
		});
	}

	console.log("# Resource Pack Upload");
	console.log(`- Files: ${files.length}`);
	console.log(`- Bytes: ${totalBytes}`);
	console.log(`- Prefix: ${args.prefix}`);
	console.log(`- Source: ${relative(process.cwd(), args.packDir)}`);
}

void main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
