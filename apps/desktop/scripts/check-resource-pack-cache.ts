import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	CLAUDE_AGENT_RUNTIME_PACK_ID,
	MASTRACODE_RUNTIME_PACK_ID,
	SUPERSET_CLI_RUNTIME_PACK_ID,
	TRELLIS_RUNTIME_PACK_ID,
} from "../src/lib/pack-system/pack-ids";
import {
	type PackId,
	packManifestIndexSchema,
	packManifestSchema,
} from "../src/main/lib/pack-system/types";
import {
	defaultResourcePackAppIndexOut,
	defaultResourcePackOutDir,
} from "./resource-pack-paths";

const RESOURCE_PACK_BASE_URL_ENV = "SUPERSET_RESOURCE_PACK_BASE_URL";

export interface CheckResourcePackCacheArgs {
	appIndexOut: string;
	baseUrl: string;
	bundleCli: boolean;
	packDir: string;
}

export interface CheckResourcePackCacheResult {
	copiedAppIndexOut: string;
	packs: Array<{
		archivePath: string;
		packId: PackId;
		version: string;
	}>;
}

function fail(message: string): never {
	throw new Error(`[resource-pack-cache] ${message}`);
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === "") return fallback;
	if (value === "true") return true;
	if (value === "false") return false;
	fail(`Expected boolean value, got ${value}`);
}

function readRequiredValue(
	args: string[],
	index: number,
	flag: string,
): string {
	const value = args[index + 1];
	if (!value) fail(`${flag} requires a value`);
	return value;
}

export function parseCheckResourcePackCacheArgs(
	args: string[] = process.argv.slice(2),
): CheckResourcePackCacheArgs {
	const parsed: CheckResourcePackCacheArgs = {
		appIndexOut: defaultResourcePackAppIndexOut,
		baseUrl:
			process.env[RESOURCE_PACK_BASE_URL_ENV]?.trim() ||
			"https://cdn.superset.sh/packs",
		bundleCli: parseBoolean(process.env.BUNDLE_CLI, true),
		packDir: defaultResourcePackOutDir,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const [flag, inlineValue] = arg.split("=", 2);
		const readValue = () => {
			if (inlineValue) return inlineValue;
			const value = readRequiredValue(args, index, flag);
			index += 1;
			return value;
		};

		switch (flag) {
			case "--app-index-out":
				parsed.appIndexOut = resolve(readValue());
				break;
			case "--base-url":
				parsed.baseUrl = readValue();
				break;
			case "--bundle-cli":
				parsed.bundleCli = parseBoolean(readValue(), parsed.bundleCli);
				break;
			case "--pack-dir":
				parsed.packDir = resolve(readValue());
				break;
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}

	return parsed;
}

function getRequiredPackIds(bundleCli: boolean): PackId[] {
	const packIds: PackId[] = [
		TRELLIS_RUNTIME_PACK_ID,
		CLAUDE_AGENT_RUNTIME_PACK_ID,
		MASTRACODE_RUNTIME_PACK_ID,
	];
	if (!bundleCli) {
		packIds.push(SUPERSET_CLI_RUNTIME_PACK_ID);
	}
	return packIds;
}

export async function checkResourcePackCache(
	args: CheckResourcePackCacheArgs,
): Promise<CheckResourcePackCacheResult> {
	const packIndexPath = join(args.packDir, "pack-manifest-index.json");
	if (!existsSync(packIndexPath)) {
		fail(`missing cached ${packIndexPath}`);
	}

	const expectedBaseUrl = ensureTrailingSlash(args.baseUrl);
	const packIndex = packManifestIndexSchema.parse(
		JSON.parse(await readFile(packIndexPath, "utf8")),
	);
	const packs: CheckResourcePackCacheResult["packs"] = [];

	for (const packId of getRequiredPackIds(args.bundleCli)) {
		const manifestSummary = packIndex.packs[packId]?.[0];
		if (!manifestSummary) {
			fail(`missing ${packId} manifest in ${packIndexPath}`);
		}
		if (!manifestSummary.downloadUrl.startsWith(expectedBaseUrl)) {
			fail(
				`${packId} downloadUrl ${manifestSummary.downloadUrl} does not match ${expectedBaseUrl}`,
			);
		}
		if (!manifestSummary.archive?.path || !manifestSummary.archive.sha256) {
			fail(`${packId} cached manifest is missing archive metadata`);
		}

		const versionRoot = join(args.packDir, packId, manifestSummary.version);
		const manifestPath = join(versionRoot, "manifest.json");
		const archivePath = join(versionRoot, manifestSummary.archive.path);
		if (!existsSync(manifestPath)) {
			fail(`${packId} manifest.json is missing at ${manifestPath}`);
		}
		if (!existsSync(archivePath)) {
			fail(`${packId} archive is missing at ${archivePath}`);
		}

		const manifest = packManifestSchema.parse(
			JSON.parse(await readFile(manifestPath, "utf8")),
		);
		if (manifest.packId !== packId) {
			fail(
				`${manifestPath} contains packId ${manifest.packId}, expected ${packId}`,
			);
		}
		if (manifest.version !== manifestSummary.version) {
			fail(
				`${packId} version mismatch: index=${manifestSummary.version}, manifest=${manifest.version}`,
			);
		}
		if (manifest.archive?.sha256 !== manifestSummary.archive.sha256) {
			fail(`${packId} archive hash mismatch between index and manifest`);
		}

		packs.push({
			archivePath,
			packId,
			version: manifest.version,
		});
	}

	await mkdir(dirname(args.appIndexOut), { recursive: true });
	await copyFile(packIndexPath, args.appIndexOut);

	return {
		copiedAppIndexOut: args.appIndexOut,
		packs,
	};
}

if (import.meta.main) {
	checkResourcePackCache(parseCheckResourcePackCacheArgs())
		.then((result) => {
			const versions = result.packs
				.map((pack) => `${pack.packId}@${pack.version}`)
				.join(", ");
			console.log(
				`[resource-pack-cache] restored ${result.packs.length} resource pack(s): ${versions}`,
			);
			console.log(
				`[resource-pack-cache] embedded index: ${result.copiedAppIndexOut}`,
			);
		})
		.catch((error) => {
			console.log(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
