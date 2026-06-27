import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { legacyDistResourcePackDirs } from "./resource-pack-paths";

export interface CleanStaleViteCacheOptions {
	cacheDir: string;
	inputPaths: string[];
	inputFingerprints?: string[];
	legacyResourcePackDirs?: string[];
	markerPath?: string;
}

export interface CleanStaleViteCacheResult {
	cacheKey: string;
	markerPath: string;
	removed: boolean;
	removedLegacyResourcePackDirs: string[];
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");

export const defaultViteCacheDir = resolve(desktopDir, "node_modules/.vite");
export const defaultViteCacheMarkerPath = resolve(
	defaultViteCacheDir,
	".superset-cache-key",
);

export const defaultViteCacheKeyInputPaths = [
	resolve(rootDir, "bun.lock"),
	resolve(desktopDir, "package.json"),
	resolve(rootDir, "packages/ui/package.json"),
	resolve(desktopDir, "electron.vite.config.ts"),
	resolve(desktopDir, "runtime-dependencies.ts"),
];

const sourceExtensions = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".mts",
]);

function hasSourceExtension(path: string): boolean {
	return [...sourceExtensions].some((extension) => path.endsWith(extension));
}

function readSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			if (
				entry.name === "node_modules" ||
				entry.name === "dist" ||
				entry.name === ".vite"
			) {
				continue;
			}
			files.push(...readSourceFiles(path));
			continue;
		}
		if (!entry.isFile() || !hasSourceExtension(path)) {
			continue;
		}
		if (statSync(path).size > 2 * 1024 * 1024) {
			continue;
		}
		files.push(path);
	}
	return files;
}

function isBareImportSpecifier(specifier: string): boolean {
	return (
		!specifier.startsWith(".") &&
		!specifier.startsWith("/") &&
		!specifier.startsWith("renderer/") &&
		!specifier.startsWith("@/")
	);
}

export function computeBareImportFingerprint(sourceRoots: string[]): string {
	const importSpecifiers = new Set<string>();
	const importFromRegex =
		/\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g;
	const sideEffectImportRegex = /\bimport\s+["']([^"']+)["']/g;
	const dynamicImportRegex = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

	for (const sourcePath of sourceRoots.flatMap(readSourceFiles).sort()) {
		const source = readFileSync(sourcePath, "utf8");
		for (const regex of [
			importFromRegex,
			sideEffectImportRegex,
			dynamicImportRegex,
		]) {
			regex.lastIndex = 0;
			let match = regex.exec(source);
			while (match) {
				const specifier = match[1];
				if (specifier && isBareImportSpecifier(specifier)) {
					importSpecifiers.add(specifier);
				}
				match = regex.exec(source);
			}
		}
	}

	return [...importSpecifiers].sort().join("\n");
}

export function computeViteCacheKey(
	inputPaths: string[],
	inputFingerprints: string[] = [],
): string {
	const hash = createHash("sha256");
	for (const inputPath of inputPaths) {
		hash.update(inputPath);
		hash.update("\0");
		hash.update(readFileSync(inputPath));
		hash.update("\0");
	}
	for (const inputFingerprint of inputFingerprints) {
		hash.update("fingerprint");
		hash.update("\0");
		hash.update(inputFingerprint);
		hash.update("\0");
	}
	return hash.digest("hex");
}

export function cleanStaleViteCache({
	cacheDir,
	inputPaths,
	inputFingerprints = [],
	legacyResourcePackDirs = legacyDistResourcePackDirs,
	markerPath = resolve(cacheDir, ".superset-cache-key"),
}: CleanStaleViteCacheOptions): CleanStaleViteCacheResult {
	const cacheKey = computeViteCacheKey(inputPaths, inputFingerprints);
	const previousCacheKey = existsSync(markerPath)
		? readFileSync(markerPath, "utf8").trim()
		: undefined;
	const shouldRemoveCache =
		existsSync(cacheDir) && previousCacheKey !== cacheKey;

	if (shouldRemoveCache) {
		rmSync(cacheDir, { recursive: true, force: true });
	}

	const removedLegacyResourcePackDirs: string[] = [];
	for (const legacyDir of legacyResourcePackDirs) {
		if (!existsSync(legacyDir)) continue;
		rmSync(legacyDir, { recursive: true, force: true });
		removedLegacyResourcePackDirs.push(legacyDir);
	}

	mkdirSync(dirname(markerPath), { recursive: true });
	writeFileSync(markerPath, `${cacheKey}\n`);

	return {
		cacheKey,
		markerPath,
		removed: shouldRemoveCache,
		removedLegacyResourcePackDirs,
	};
}

if (import.meta.main) {
	const result = cleanStaleViteCache({
		cacheDir: defaultViteCacheDir,
		inputPaths: defaultViteCacheKeyInputPaths,
		inputFingerprints: [
			computeBareImportFingerprint([
				resolve(desktopDir, "src/renderer"),
				resolve(rootDir, "packages/ui/src"),
			]),
		],
		markerPath: defaultViteCacheMarkerPath,
	});

	if (result.removed) {
		console.log(
			`[desktop] removed stale Vite optimizer cache at ${defaultViteCacheDir}`,
		);
	} else {
		console.log(
			`[desktop] Vite optimizer cache is current at ${defaultViteCacheDir}`,
		);
	}
	for (const legacyDir of result.removedLegacyResourcePackDirs) {
		console.log(
			`[desktop] removed legacy generated resource packs at ${legacyDir}`,
		);
	}
}
