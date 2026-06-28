import { existsSync } from "node:fs";
import {
	chmod,
	cp,
	mkdir,
	readdir,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { TRELLIS_RUNTIME_PACK_ID } from "../src/lib/pack-system/pack-ids";
import { packManifestSchema } from "../src/main/lib/pack-system/types";
import { buildPackArchive } from "./resource-pack-archive";
import { writeMergedResourcePackAppIndex } from "./resource-pack-index";
import { defaultResourcePackOutDir } from "./resource-pack-paths";
import { trellisRuntimePackResourceCopies } from "./trellis-runtime-pack-dependencies";

const require = createRequire(import.meta.url);
const appDir = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(appDir, "..", "..");
const RESOURCE_PACK_BASE_URL_ENV = "SUPERSET_RESOURCE_PACK_BASE_URL";

interface BuildArgs {
	appIndexOut?: string;
	downloadUrl?: string;
	minAppVersion?: string;
	outDir: string;
	version?: string;
}

function fail(message: string): never {
	console.error(`[build:trellis-pack] ${message}`);
	process.exit(1);
}

function parseArgs(): BuildArgs {
	const parsed: BuildArgs = { outDir: defaultResourcePackOutDir };
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
			case "--app-index-out":
				parsed.appIndexOut = resolve(readValue());
				break;
			case "--download-url":
				parsed.downloadUrl = readValue();
				break;
			case "--min-app-version":
				parsed.minAppVersion = readValue();
				break;
			case "--out-dir":
				parsed.outDir = resolve(readValue());
				break;
			case "--version":
				parsed.version = readValue();
				break;
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}
	return parsed;
}

function readPackageJson(packageRoot: string): {
	name?: string;
	version?: string;
} {
	return JSON.parse(
		readFileSync(join(packageRoot, "package.json"), "utf8"),
	) as {
		name?: string;
		version?: string;
	};
}

function readFileSync(path: string): string {
	return require("node:fs").readFileSync(path, "utf8") as string;
}

function packageNameFromNodeModulesPath(path: string): string {
	const segments = path.split("/");
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex < 0 || nodeModulesIndex === segments.length - 1) {
		fail(`Cannot infer package name from ${path}`);
	}
	const first = segments[nodeModulesIndex + 1];
	if (!first) fail(`Cannot infer package name from ${path}`);
	if (first.startsWith("@")) {
		const second = segments[nodeModulesIndex + 2];
		if (!second) fail(`Cannot infer scoped package name from ${path}`);
		return `${first}/${second}`;
	}
	return first;
}

function packageNamesInNodeModulesPath(path: string): string[] {
	const names: string[] = [];
	const segments = path.split("/");
	for (let index = 0; index < segments.length; index += 1) {
		if (segments[index] !== "node_modules") continue;
		const first = segments[index + 1];
		if (!first) continue;
		if (first.startsWith("@")) {
			const second = segments[index + 2];
			if (second) names.push(`${first}/${second}`);
			index += 2;
		} else {
			names.push(first);
			index += 1;
		}
	}
	return names;
}

function findPackageRootFromEntry(
	packageName: string,
	entryPath: string,
): string | null {
	let dir = dirname(entryPath);
	while (dir !== dirname(dir)) {
		const packageJsonPath = join(dir, "package.json");
		if (existsSync(packageJsonPath)) {
			const packageJson = readPackageJson(dir);
			if (packageJson.name === packageName) return dir;
		}
		dir = dirname(dir);
	}
	return null;
}

function resolvePackageRoot(packageName: string, paths: string[]): string {
	try {
		const packageJsonPath = require.resolve(`${packageName}/package.json`, {
			paths,
		});
		return dirname(packageJsonPath);
	} catch {
		const entryPath = require.resolve(packageName, { paths });
		const root = findPackageRootFromEntry(packageName, entryPath);
		if (root) return root;
		throw new Error(`Could not find package root for ${packageName}`);
	}
}

function resolveCopySource(from: string, trellisRoot: string): string {
	const names = packageNamesInNodeModulesPath(from);
	const packageName = packageNameFromNodeModulesPath(from);
	const parentPackageName = names.length > 1 ? names.at(-2) : null;
	const searchPaths = [trellisRoot, appDir, workspaceRoot];

	if (parentPackageName) {
		const parentRoot = resolvePackageRoot(parentPackageName, searchPaths);
		return resolvePackageRoot(packageName, [parentRoot, ...searchPaths]);
	}

	return resolvePackageRoot(packageName, searchPaths);
}

async function copyRuntimeModule(args: {
	from: string;
	to: string;
	trellisRoot: string;
	versionRoot: string;
}): Promise<void> {
	const source = resolveCopySource(args.from, args.trellisRoot);
	const target = join(args.versionRoot, args.to);
	await rm(target, { recursive: true, force: true });
	await mkdir(dirname(target), { recursive: true });
	await cp(source, target, {
		recursive: true,
		dereference: true,
		filter: (sourcePath) =>
			!sourcePath.includes(`${join("node_modules", ".cache")}`),
	});
}

async function pruneFigletFonts(versionRoot: string): Promise<number> {
	const figletRoot = join(versionRoot, "node_modules", "figlet");
	const fontDirs = [
		{
			dir: join(figletRoot, "fonts"),
			keep: new Set(["Rebel.flf"]),
		},
		{
			dir: join(figletRoot, "importable-fonts"),
			keep: new Set(["Rebel.js", "Rebel.d.ts"]),
		},
	];
	let removedCount = 0;

	for (const { dir, keep } of fontDirs) {
		if (!existsSync(dir)) continue;
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (keep.has(entry.name)) continue;
			if (entry.isDirectory()) {
				await rm(path, { force: true, recursive: true });
				removedCount += 1;
				continue;
			}
			if (entry.isFile()) {
				await unlink(path);
				removedCount += 1;
			}
		}
	}

	return removedCount;
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function defaultDownloadUrl(version: string): string {
	const baseUrl =
		process.env[RESOURCE_PACK_BASE_URL_ENV]?.trim() ||
		"https://cdn.superset.sh/packs";
	return new URL(
		`${TRELLIS_RUNTIME_PACK_ID}/${version}/`,
		ensureTrailingSlash(baseUrl),
	).href;
}

async function buildManifest(args: {
	downloadUrl: string;
	minAppVersion?: string;
	version: string;
	versionRoot: string;
}) {
	const { archive, files } = await buildPackArchive(args.versionRoot);

	return packManifestSchema.parse({
		schemaVersion: 1,
		packId: TRELLIS_RUNTIME_PACK_ID,
		version: args.version,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl,
		archive,
		files,
		executeHint: {
			runtime: "node",
			entry: "node_modules/@mindfoldhq/trellis/bin/trellis.js",
		},
	});
}

async function main() {
	const args = parseArgs();
	const trellisRoot = resolvePackageRoot("@mindfoldhq/trellis", [
		appDir,
		workspaceRoot,
	]);
	const trellisPackage = readPackageJson(trellisRoot);
	const version = args.version ?? trellisPackage.version;
	if (!version) fail("Could not determine Trellis runtime pack version");

	const packRoot = join(args.outDir, TRELLIS_RUNTIME_PACK_ID);
	const versionRoot = join(packRoot, version);
	await rm(versionRoot, { recursive: true, force: true });
	await mkdir(versionRoot, { recursive: true });

	for (const copySpec of trellisRuntimePackResourceCopies) {
		await copyRuntimeModule({
			from: copySpec.from,
			to: copySpec.to,
			trellisRoot,
			versionRoot,
		});
	}
	const prunedFigletFonts = await pruneFigletFonts(versionRoot);
	if (prunedFigletFonts > 0) {
		console.log(
			`[build:trellis-pack] pruned ${prunedFigletFonts} unused figlet font file(s)`,
		);
	}

	const trellisBin = join(
		versionRoot,
		"node_modules",
		"@mindfoldhq",
		"trellis",
		"bin",
		"trellis.js",
	);
	if (existsSync(trellisBin)) {
		await chmod(trellisBin, 0o755);
	}

	const manifest = await buildManifest({
		version,
		versionRoot,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl ?? defaultDownloadUrl(version),
	});
	await writeFile(
		join(versionRoot, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);

	const generatedAt = new Date().toISOString();
	await writeFile(
		join(packRoot, "manifest.json"),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				packId: TRELLIS_RUNTIME_PACK_ID,
				latest: version,
				versions: [version],
				generatedAt,
			},
			null,
			2,
		)}\n`,
	);

	await writeMergedResourcePackAppIndex({
		appIndexOut: args.appIndexOut,
		generatedAt,
		manifest,
		outDir: args.outDir,
		packId: TRELLIS_RUNTIME_PACK_ID,
	});

	console.log("# Trellis Runtime Pack");
	console.log(`- Version: ${version}`);
	console.log(`- Files: ${manifest.files.length}`);
	console.log(`- Output: ${relative(process.cwd(), versionRoot)}`);
	console.log(
		`- App index: ${relative(process.cwd(), join(args.outDir, "pack-manifest-index.json"))}`,
	);
	if (args.appIndexOut) {
		console.log(
			`- Embedded index: ${relative(process.cwd(), args.appIndexOut)}`,
		);
	}
}

void main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
