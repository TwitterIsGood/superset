import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PackManifestIndex, packManifestIndexSchema } from "./types";

const PACK_MANIFEST_INDEX_JSON_ENV = "SUPERSET_PACK_MANIFEST_INDEX_JSON";
const PACK_MANIFEST_INDEX_PATH_ENV = "SUPERSET_PACK_MANIFEST_INDEX_PATH";
export const PACK_MANIFEST_INDEX_RESOURCE_PATH = join(
	"resources",
	"pack-system",
	"pack-manifest-index.json",
);

export const EMPTY_PACK_MANIFEST_INDEX: PackManifestIndex = {
	schemaVersion: 1,
	packs: {},
};

function parseManifestIndexJson(
	raw: string,
	source: string,
): PackManifestIndex {
	const parsed = JSON.parse(raw);
	const result = packManifestIndexSchema.safeParse(parsed);
	if (!result.success) {
		throw new Error(
			`Invalid pack manifest index from ${source}: ${result.error.message}`,
		);
	}
	return result.data;
}

export function loadPackManifestIndex(
	env: NodeJS.ProcessEnv = process.env,
	embeddedManifestPath: string | null = null,
): PackManifestIndex {
	const manifestJson = env[PACK_MANIFEST_INDEX_JSON_ENV]?.trim();
	if (manifestJson) {
		return parseManifestIndexJson(manifestJson, PACK_MANIFEST_INDEX_JSON_ENV);
	}

	const manifestPath = env[PACK_MANIFEST_INDEX_PATH_ENV]?.trim();
	if (manifestPath) {
		return parseManifestIndexJson(
			readFileSync(manifestPath, "utf8"),
			manifestPath,
		);
	}

	if (embeddedManifestPath && existsSync(embeddedManifestPath)) {
		return parseManifestIndexJson(
			readFileSync(embeddedManifestPath, "utf8"),
			embeddedManifestPath,
		);
	}

	return EMPTY_PACK_MANIFEST_INDEX;
}

export function resolveEmbeddedPackManifestIndexPath(options: {
	appPath: string;
	bundleDir: string;
	isPackaged: boolean;
	nodeEnv: string | undefined;
	resourcesPath: string;
}): string | null {
	if (options.isPackaged) {
		return join(options.resourcesPath, PACK_MANIFEST_INDEX_RESOURCE_PATH);
	}

	if (options.nodeEnv === "development") {
		return join(
			options.appPath,
			"src",
			"resources",
			"pack-system",
			"pack-manifest-index.json",
		);
	}

	const candidates = [
		join(
			options.bundleDir,
			"..",
			"resources",
			"pack-system",
			"pack-manifest-index.json",
		),
		join(
			options.appPath,
			"dist",
			"resources",
			"pack-system",
			"pack-manifest-index.json",
		),
		join(
			options.appPath,
			"src",
			"resources",
			"pack-system",
			"pack-manifest-index.json",
		),
	];

	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
