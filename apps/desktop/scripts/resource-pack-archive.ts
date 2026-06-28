import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import { zipSync } from "fflate";
import type { PackFileManifest } from "../src/main/lib/pack-system/types";

export interface BuiltPackArchive {
	archive: {
		format: "zip";
		path: "pack.zip";
		sha256: string;
		size: number;
	};
	files: PackFileManifest[];
}

function sha256Bytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export async function buildPackArchive(
	versionRoot: string,
): Promise<BuiltPackArchive> {
	const filePaths = await fg("**/*", {
		cwd: versionRoot,
		dot: true,
		onlyFiles: true,
		ignore: ["manifest.json", "pack.zip"],
	});
	const files: PackFileManifest[] = [];
	const archiveEntries: Record<string, Uint8Array> = {};

	for (const path of filePaths.sort()) {
		const absolutePath = join(versionRoot, path);
		const entry = await stat(absolutePath);
		const bytes = await readFile(absolutePath);
		archiveEntries[path] = bytes;
		files.push({
			path,
			size: entry.size,
			sha256: sha256Bytes(bytes),
			...(entry.mode & 0o111 ? { executable: true } : {}),
		});
	}

	const archiveBytes = zipSync(archiveEntries, { level: 6 });
	await writeFile(join(versionRoot, "pack.zip"), archiveBytes, { mode: 0o600 });

	return {
		archive: {
			format: "zip",
			path: "pack.zip",
			size: archiveBytes.byteLength,
			sha256: sha256Bytes(archiveBytes),
		},
		files,
	};
}
