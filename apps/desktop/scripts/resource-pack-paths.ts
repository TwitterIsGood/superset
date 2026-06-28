import { join, resolve } from "node:path";

const appDir = resolve(import.meta.dirname, "..");

export const defaultResourcePackTempRoot = join(appDir, ".tmp");

export const defaultResourcePackOutDir = join(
	defaultResourcePackTempRoot,
	"resource-packs",
);

export const defaultResourcePackAppIndexOut = join(
	appDir,
	"dist",
	"resources",
	"pack-system",
	"pack-manifest-index.json",
);

export const legacyDistResourcePackDirs = [
	join(appDir, "dist", "resource-packs"),
	join(appDir, "dist", "resource-packs-test"),
];
