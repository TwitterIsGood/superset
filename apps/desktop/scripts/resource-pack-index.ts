import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type PackId,
	type PackManifest,
	type PackManifestIndex,
	packManifestIndexSchema,
} from "../src/main/lib/pack-system/types";

async function readExistingAppIndex(
	path: string,
): Promise<PackManifestIndex | null> {
	if (!existsSync(path)) return null;
	return packManifestIndexSchema.parse(
		JSON.parse(await readFile(path, "utf8")),
	);
}

export async function writeMergedResourcePackAppIndex(args: {
	appIndexOut?: string;
	generatedAt: string;
	manifest: PackManifest;
	outDir: string;
	packId: PackId;
}): Promise<PackManifestIndex> {
	const packAppIndexPath = join(args.outDir, "pack-manifest-index.json");
	const existingAppIndex = await readExistingAppIndex(
		args.appIndexOut ?? packAppIndexPath,
	);
	const appIndex = packManifestIndexSchema.parse({
		schemaVersion: 1,
		generatedAt: args.generatedAt,
		packs: {
			...(existingAppIndex?.packs ?? {}),
			[args.packId]: [args.manifest],
		},
	});
	const appIndexJson = `${JSON.stringify(appIndex, null, 2)}\n`;
	await writeFile(packAppIndexPath, appIndexJson);
	if (args.appIndexOut) {
		await mkdir(dirname(args.appIndexOut), { recursive: true });
		await writeFile(args.appIndexOut, appIndexJson);
	}
	return appIndex;
}
