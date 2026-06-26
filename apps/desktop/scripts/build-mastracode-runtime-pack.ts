import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import fg from "fast-glob";
import { MASTRACODE_RUNTIME_PACK_ID } from "../src/lib/pack-system/pack-ids";
import {
	type PackFileManifest,
	type PackManifestIndex,
	packManifestIndexSchema,
	packManifestSchema,
} from "../src/main/lib/pack-system/types";
import {
	getDuckdbNodeBindingsPackageName,
	getMastracodeRuntimeNativePackageNames,
	MASTRA_MEMORY_RUNTIME_ENTRY,
	MASTRACODE_PACKAGE_NAME,
	MASTRACODE_RUNTIME_ENTRY,
	mastracodeRuntimeSeedPackageNames,
	shouldIncludeMastracodeRuntimeDependency,
} from "./mastracode-runtime-pack-dependencies";

const require = createRequire(import.meta.url);
const appDir = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(appDir, "..", "..");
const defaultOutDir = join(appDir, "dist", "resource-packs");
const RESOURCE_PACK_BASE_URL_ENV = "SUPERSET_RESOURCE_PACK_BASE_URL";
const NON_RUNTIME_DIR_NAMES = new Set([
	".github",
	"__tests__",
	"doc",
	"docs",
	"test",
	"tests",
]);

interface BuildArgs {
	appIndexOut?: string;
	downloadUrl?: string;
	minAppVersion?: string;
	outDir: string;
	version?: string;
}

type PackageJson = {
	dependencies?: Record<string, string>;
	name?: string;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	version?: string;
};

type RuntimePackage = {
	name: string;
	root: string;
	targetRelativePath: string;
	version: string;
};

function fail(message: string): never {
	console.error(`[build:mastracode-pack] ${message}`);
	process.exit(1);
}

function parseArgs(): BuildArgs {
	const parsed: BuildArgs = { outDir: defaultOutDir };
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

function readPackageJson(packageRoot: string): PackageJson {
	return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
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

function packageTargetPath(versionRoot: string, packageName: string): string {
	return join(versionRoot, "node_modules", ...packageName.split("/"));
}

function nestedPackageTargetPath(
	parentTargetRelativePath: string,
	packageName: string,
): string {
	return join(
		parentTargetRelativePath,
		"node_modules",
		...packageName.split("/"),
	);
}

function dependencyNames(packageJson: PackageJson): Array<{
	name: string;
	required: boolean;
}> {
	const required = Object.keys(packageJson.dependencies ?? {}).map((name) => ({
		name,
		required: true,
	}));
	const optional = Object.keys(packageJson.optionalDependencies ?? {}).map(
		(name) => ({ name, required: false }),
	);
	const peer = Object.keys(packageJson.peerDependencies ?? {}).map((name) => ({
		name,
		required: packageJson.peerDependenciesMeta?.[name]?.optional !== true,
	}));
	return [...required, ...optional, ...peer];
}

function collectRuntimePackages(rootPackageName: string): RuntimePackage[] {
	const rootPackageRoot = resolvePackageRoot(rootPackageName, [
		appDir,
		workspaceRoot,
	]);
	const queue: Array<{
		ancestors: string[];
		followDependencies: boolean;
		name: string;
		parentTargetRelativePath: string | null;
		paths: string[];
		required: boolean;
	}> = [
		{
			ancestors: [],
			followDependencies: false,
			name: rootPackageName,
			parentTargetRelativePath: null,
			paths: [rootPackageRoot, appDir, workspaceRoot],
			required: true,
		},
		...mastracodeRuntimeSeedPackageNames.map((name) => ({
			ancestors: [],
			followDependencies: true,
			name,
			parentTargetRelativePath: null,
			paths: [rootPackageRoot, appDir, workspaceRoot],
			required: true,
		})),
	];
	const packages = new Map<string, RuntimePackage>();
	const hoistedByName = new Map<string, RuntimePackage>();
	const nativePackageNames = new Set(getMastracodeRuntimeNativePackageNames());

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		if (!current) continue;

		let root: string;
		try {
			root = resolvePackageRoot(current.name, current.paths);
		} catch (error) {
			if (current.required || nativePackageNames.has(current.name)) {
				throw error;
			}
			continue;
		}

		const packageJson = readPackageJson(root);
		const name = current.name;
		const version = packageJson.version ?? "0.0.0";
		const hoisted = hoistedByName.get(name);
		const targetRelativePath =
			hoisted && hoisted.root !== root
				? current.parentTargetRelativePath
					? nestedPackageTargetPath(current.parentTargetRelativePath, name)
					: packageTargetPath("", name).replace(/^\//, "")
				: (hoisted?.targetRelativePath ??
					packageTargetPath("", name).replace(/^\//, ""));
		const existing = packages.get(targetRelativePath);
		if (existing) {
			continue;
		}

		const packageInfo = { name, root, targetRelativePath, version };
		packages.set(targetRelativePath, packageInfo);
		if (!hoisted) {
			hoistedByName.set(name, packageInfo);
		}

		const ancestryKey = `${name}@${root}`;
		if (current.ancestors.includes(ancestryKey)) {
			continue;
		}
		const ancestors = [...current.ancestors, ancestryKey];
		const dependencies = current.followDependencies
			? dependencyNames(packageJson)
			: [];
		for (const dependency of dependencies) {
			if (!shouldIncludeMastracodeRuntimeDependency(dependency.name)) {
				continue;
			}
			queue.push({
				ancestors,
				followDependencies: true,
				name: dependency.name,
				parentTargetRelativePath: targetRelativePath,
				paths: [root, appDir, workspaceRoot],
				required: dependency.required,
			});
		}
	}

	const targetDuckdbBinding = getDuckdbNodeBindingsPackageName();
	if (!packages.has(targetDuckdbBinding)) {
		const targetRoot = resolvePackageRoot(targetDuckdbBinding, [
			appDir,
			workspaceRoot,
		]);
		const packageJson = readPackageJson(targetRoot);
		const targetRelativePath = packageTargetPath(
			"",
			targetDuckdbBinding,
		).replace(/^\//, "");
		packages.set(targetRelativePath, {
			name: packageJson.name ?? targetDuckdbBinding,
			root: targetRoot,
			targetRelativePath,
			version: packageJson.version ?? "0.0.0",
		});
	}

	return [...packages.values()].sort((left, right) =>
		left.targetRelativePath.localeCompare(right.targetRelativePath),
	);
}

async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	hash.update(await readFile(path));
	return hash.digest("hex");
}

async function copyRuntimePackage(args: {
	packageInfo: RuntimePackage;
	versionRoot: string;
}): Promise<void> {
	const target = join(args.versionRoot, args.packageInfo.targetRelativePath);
	await rm(target, { recursive: true, force: true });
	await mkdir(dirname(target), { recursive: true });
	await cp(args.packageInfo.root, target, {
		recursive: true,
		dereference: true,
		filter: (sourcePath) =>
			!sourcePath.includes(`${join("node_modules", ".cache")}`),
	});
}

function getTargetArchSet(targetArch: string): Set<string> {
	if (targetArch === "universal") {
		return new Set(["arm64", "x64"]);
	}
	return new Set([targetArch]);
}

async function removePathIfExists(path: string): Promise<boolean> {
	if (!existsSync(path)) return false;
	await rm(path, { force: true, recursive: true });
	return true;
}

async function pruneNonRuntimeFiles(root: string): Promise<number> {
	let removedCount = 0;
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			if (NON_RUNTIME_DIR_NAMES.has(entry.name)) {
				if (await removePathIfExists(path)) removedCount += 1;
				continue;
			}
			removedCount += await pruneNonRuntimeFiles(path);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".map")) {
			await unlink(path);
			removedCount += 1;
		}
	}
	return removedCount;
}

async function pruneOnnxRuntimeNode(args: {
	nodeModulesDir: string;
	targetArch: string;
	targetPlatform: string;
}): Promise<number> {
	let removedCount = 0;
	const napiRoot = join(
		args.nodeModulesDir,
		"onnxruntime-node",
		"bin",
		"napi-v3",
	);
	if (!existsSync(napiRoot)) return removedCount;

	const targetArchSet = getTargetArchSet(args.targetArch);
	for (const platformEntry of await readdir(napiRoot, {
		withFileTypes: true,
	})) {
		if (!platformEntry.isDirectory()) continue;
		const platformPath = join(napiRoot, platformEntry.name);
		if (platformEntry.name !== args.targetPlatform) {
			if (await removePathIfExists(platformPath)) removedCount += 1;
			continue;
		}

		for (const archEntry of await readdir(platformPath, {
			withFileTypes: true,
		})) {
			if (!archEntry.isDirectory()) continue;
			if (!targetArchSet.has(archEntry.name)) {
				if (await removePathIfExists(join(platformPath, archEntry.name))) {
					removedCount += 1;
				}
			}
		}
	}

	return removedCount;
}

async function prunePackPayload(versionRoot: string): Promise<void> {
	const nodeModulesDir = join(versionRoot, "node_modules");
	const targetArch = process.env.TARGET_ARCH ?? process.arch;
	const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
	const removedNonRuntimeFiles = await pruneNonRuntimeFiles(versionRoot);
	const removedOnnxPayloads = await pruneOnnxRuntimeNode({
		nodeModulesDir,
		targetArch,
		targetPlatform,
	});
	console.log(
		`[build:mastracode-pack] pruned ${removedNonRuntimeFiles} non-runtime file/dir(s) and ${removedOnnxPayloads} ONNX payload path(s) for ${targetPlatform}/${targetArch}`,
	);
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function defaultDownloadUrl(version: string): string {
	const baseUrl =
		process.env[RESOURCE_PACK_BASE_URL_ENV]?.trim() ||
		"https://cdn.superset.sh/packs";
	return new URL(
		`${MASTRACODE_RUNTIME_PACK_ID}/${version}/`,
		ensureTrailingSlash(baseUrl),
	).href;
}

async function buildManifest(args: {
	downloadUrl: string;
	minAppVersion?: string;
	version: string;
	versionRoot: string;
}) {
	const filePaths = await fg("**/*", {
		cwd: args.versionRoot,
		dot: true,
		onlyFiles: true,
		ignore: ["manifest.json"],
	});
	const files: PackFileManifest[] = [];
	for (const path of filePaths.sort()) {
		const absolutePath = join(args.versionRoot, path);
		const entry = await stat(absolutePath);
		files.push({
			path,
			size: entry.size,
			sha256: await sha256File(absolutePath),
			...(entry.mode & 0o111 ? { executable: true } : {}),
		});
	}

	return packManifestSchema.parse({
		schemaVersion: 1,
		packId: MASTRACODE_RUNTIME_PACK_ID,
		version: args.version,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl,
		files,
		executeHint: {
			runtime: "node",
			entry: MASTRACODE_RUNTIME_ENTRY,
			args: [MASTRA_MEMORY_RUNTIME_ENTRY],
		},
	});
}

async function readExistingAppIndex(
	path: string | undefined,
): Promise<PackManifestIndex | null> {
	if (!path || !existsSync(path)) return null;
	return packManifestIndexSchema.parse(
		JSON.parse(await readFile(path, "utf8")),
	);
}

async function main() {
	const args = parseArgs();
	const mastracodeRoot = resolvePackageRoot(MASTRACODE_PACKAGE_NAME, [
		appDir,
		workspaceRoot,
	]);
	const mastracodePackage = readPackageJson(mastracodeRoot);
	const baseVersion = args.version ?? mastracodePackage.version;
	if (!baseVersion) fail("Could not determine MastraCode runtime pack version");
	const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
	const targetArch = process.env.TARGET_ARCH ?? process.arch;
	const version = `${baseVersion}-${targetPlatform}-${targetArch}`;

	const packRoot = join(args.outDir, MASTRACODE_RUNTIME_PACK_ID);
	const versionRoot = join(packRoot, version);
	await rm(versionRoot, { recursive: true, force: true });
	await mkdir(versionRoot, { recursive: true });

	const runtimePackages = collectRuntimePackages(MASTRACODE_PACKAGE_NAME);
	for (const packageInfo of runtimePackages) {
		await copyRuntimePackage({ packageInfo, versionRoot });
	}
	await prunePackPayload(versionRoot);

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
				packId: MASTRACODE_RUNTIME_PACK_ID,
				latest: version,
				versions: [version],
				generatedAt,
			},
			null,
			2,
		)}\n`,
	);

	const existingAppIndex = await readExistingAppIndex(args.appIndexOut);
	const appIndex = packManifestIndexSchema.parse({
		schemaVersion: 1,
		generatedAt,
		packs: {
			...(existingAppIndex?.packs ?? {}),
			[MASTRACODE_RUNTIME_PACK_ID]: [manifest],
		},
	});
	const appIndexJson = `${JSON.stringify(appIndex, null, 2)}\n`;
	const packAppIndexPath = join(args.outDir, "pack-manifest-index.json");
	await writeFile(packAppIndexPath, appIndexJson);
	if (args.appIndexOut) {
		await mkdir(dirname(args.appIndexOut), { recursive: true });
		await writeFile(args.appIndexOut, appIndexJson);
	}

	const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
	console.log("# MastraCode Runtime Pack");
	console.log(`- Base Version: ${baseVersion}`);
	console.log(`- Pack Version: ${version}`);
	console.log(`- Packages: ${runtimePackages.length}`);
	console.log(`- Files: ${manifest.files.length}`);
	console.log(`- Bytes: ${totalBytes}`);
	console.log(`- DuckDB binding: ${getDuckdbNodeBindingsPackageName()}`);
	console.log(`- Output: ${relative(process.cwd(), versionRoot)}`);
	console.log(`- App index: ${relative(process.cwd(), packAppIndexPath)}`);
	if (args.appIndexOut) {
		console.log(
			`- Embedded index: ${relative(process.cwd(), args.appIndexOut)}`,
		);
	}
}

void main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
