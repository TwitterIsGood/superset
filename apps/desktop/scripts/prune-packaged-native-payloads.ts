import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

type PruneTarget = {
	appOutDir: string;
	targetArch: string;
	targetPlatform: string;
};

export type NativePayloadPruneResult = {
	nodeModulesDir: string | null;
	removedPaths: string[];
};

const builderArchNames: Record<number, string> = {
	0: "ia32",
	1: "x64",
	2: "armv7l",
	3: "arm64",
	4: "universal",
};

export function normalizeBuilderArch(arch: unknown): string {
	if (typeof arch === "number") {
		return builderArchNames[arch] ?? String(arch);
	}

	const archText = String(arch);
	const numericArch = Number(archText);
	if (Number.isInteger(numericArch) && builderArchNames[numericArch]) {
		return builderArchNames[numericArch];
	}

	return archText;
}

function normalizeTargetPlatform(platform: string): string {
	if (platform === "mac" || platform === "macos") return "darwin";
	if (platform === "windows") return "win32";
	return platform;
}

function getTargetArchSet(targetArch: string): Set<string> {
	if (targetArch === "universal") {
		return new Set(["arm64", "x64"]);
	}

	return new Set([targetArch]);
}

function resolvePackagedNodeModulesDir(appOutDir: string): string | null {
	const candidates = [
		join(
			appOutDir,
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		),
		join(appOutDir, "resources", "app.asar.unpacked", "node_modules"),
	];
	for (const appBundleDir of listDirectories(appOutDir).filter((entry) =>
		entry.endsWith(".app"),
	)) {
		candidates.push(
			join(
				appOutDir,
				appBundleDir,
				"Contents",
				"Resources",
				"app.asar.unpacked",
				"node_modules",
			),
		);
	}

	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function listDirectories(path: string): string[] {
	if (!existsSync(path)) return [];

	return readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

function removePath(
	nodeModulesDir: string,
	path: string,
	removedPaths: string[],
): void {
	if (!existsSync(path)) return;

	removedPaths.push(relative(nodeModulesDir, path));
	rmSync(path, { force: true, recursive: true });
}

function removeFilesByExtension(
	nodeModulesDir: string,
	rootPath: string,
	extension: string,
	removedPaths: string[],
): void {
	if (!existsSync(rootPath)) return;

	for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
		const path = join(rootPath, entry.name);
		if (entry.isDirectory()) {
			removeFilesByExtension(nodeModulesDir, path, extension, removedPaths);
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(extension)) {
			removedPaths.push(relative(nodeModulesDir, path));
			unlinkSync(path);
		}
	}
}

function pruneOnnxRuntimeNode(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const napiRoot = join(nodeModulesDir, "onnxruntime-node", "bin", "napi-v3");
	for (const platformDir of listDirectories(napiRoot)) {
		const platformPath = join(napiRoot, platformDir);
		if (platformDir !== targetPlatform) {
			removePath(nodeModulesDir, platformPath, removedPaths);
			continue;
		}

		for (const archDir of listDirectories(platformPath)) {
			if (!targetArchSet.has(archDir)) {
				removePath(nodeModulesDir, join(platformPath, archDir), removedPaths);
			}
		}
	}
}

function getKoffiTargetTriplets(
	targetPlatform: string,
	targetArchSet: Set<string>,
): Set<string> {
	const triplets = new Set<string>();

	for (const arch of targetArchSet) {
		if (targetPlatform === "linux") {
			const linuxArch = arch === "armv7l" ? "armhf" : arch;
			triplets.add(`linux_${linuxArch}`);
			triplets.add(`musl_${linuxArch}`);
			continue;
		}

		const koffiArch = arch === "armv7l" ? "armhf" : arch;
		triplets.add(`${targetPlatform}_${koffiArch}`);
	}

	return triplets;
}

function pruneKoffi(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const koffiRoot = join(nodeModulesDir, "koffi");
	const nativeRoot = join(koffiRoot, "build", "koffi");
	const targetTriplets = getKoffiTargetTriplets(targetPlatform, targetArchSet);

	for (const tripletDir of listDirectories(nativeRoot)) {
		if (!targetTriplets.has(tripletDir)) {
			removePath(nodeModulesDir, join(nativeRoot, tripletDir), removedPaths);
		}
	}

	for (const buildOnlyDir of ["doc", "src", "vendor"]) {
		removePath(nodeModulesDir, join(koffiRoot, buildOnlyDir), removedPaths);
	}
}

function getNodePtyTargetPrebuilds(
	targetPlatform: string,
	targetArchSet: Set<string>,
): Set<string> {
	const prebuilds = new Set<string>();
	for (const arch of targetArchSet) {
		prebuilds.add(`${targetPlatform}-${arch}`);
	}
	return prebuilds;
}

function pruneNodePty(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const nodePtyRoot = join(nodeModulesDir, "node-pty");
	const prebuildsRoot = join(nodePtyRoot, "prebuilds");
	const targetPrebuilds = getNodePtyTargetPrebuilds(
		targetPlatform,
		targetArchSet,
	);

	for (const prebuildDir of listDirectories(prebuildsRoot)) {
		if (!targetPrebuilds.has(prebuildDir)) {
			removePath(
				nodeModulesDir,
				join(prebuildsRoot, prebuildDir),
				removedPaths,
			);
		}
	}

	const hasTargetPrebuild = [...targetPrebuilds].some((prebuildDir) =>
		existsSync(join(prebuildsRoot, prebuildDir)),
	);

	if (targetPlatform !== "linux" && hasTargetPrebuild) {
		removePath(nodeModulesDir, join(nodePtyRoot, "build"), removedPaths);
	}

	if (targetPlatform !== "win32") {
		removePath(nodeModulesDir, join(nodePtyRoot, "deps"), removedPaths);
		removePath(nodeModulesDir, join(nodePtyRoot, "third_party"), removedPaths);
	}

	removeFilesByExtension(nodeModulesDir, nodePtyRoot, ".pdb", removedPaths);
}

function getAstGrepTargetPackages(
	targetPlatform: string,
	targetArchSet: Set<string>,
): Set<string> {
	const packages = new Set<string>();
	for (const arch of targetArchSet) {
		if (targetPlatform === "darwin") {
			packages.add(`napi-darwin-${arch}`);
			continue;
		}
		if (targetPlatform === "linux") {
			packages.add(`napi-linux-${arch}-gnu`);
			continue;
		}
		if (targetPlatform === "win32") {
			packages.add(`napi-win32-${arch}-msvc`);
		}
	}
	return packages;
}

function pruneAstGrep(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const astGrepRoot = join(nodeModulesDir, "@ast-grep");
	const targetPackages = getAstGrepTargetPackages(
		targetPlatform,
		targetArchSet,
	);

	for (const packageDir of listDirectories(astGrepRoot)) {
		if (!packageDir.startsWith("napi-")) {
			continue;
		}
		if (!targetPackages.has(packageDir)) {
			removePath(nodeModulesDir, join(astGrepRoot, packageDir), removedPaths);
		}
	}
}

function getLibsqlTargetPackages(
	targetPlatform: string,
	targetArchSet: Set<string>,
): Set<string> {
	const packages = new Set<string>();
	for (const arch of targetArchSet) {
		if (targetPlatform === "darwin") {
			packages.add(`darwin-${arch}`);
			continue;
		}
		if (targetPlatform === "linux") {
			packages.add(`linux-${arch}-gnu`);
			continue;
		}
		if (targetPlatform === "win32") {
			packages.add(`win32-${arch}-msvc`);
		}
	}
	return packages;
}

function pruneLibsql(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const libsqlRoot = join(nodeModulesDir, "@libsql");
	const targetPackages = getLibsqlTargetPackages(targetPlatform, targetArchSet);

	for (const packageDir of listDirectories(libsqlRoot)) {
		if (!targetPackages.has(packageDir)) {
			removePath(nodeModulesDir, join(libsqlRoot, packageDir), removedPaths);
		}
	}
}

function getParcelWatcherTargetPackages(
	targetPlatform: string,
	targetArchSet: Set<string>,
): Set<string> {
	const packages = new Set<string>();
	for (const arch of targetArchSet) {
		if (targetPlatform === "darwin") {
			packages.add(`watcher-darwin-${arch}`);
			continue;
		}
		if (targetPlatform === "linux") {
			packages.add(`watcher-linux-${arch}-glibc`);
			continue;
		}
		if (targetPlatform === "win32") {
			packages.add(`watcher-win32-${arch}`);
		}
	}
	return packages;
}

function pruneParcelWatcher(
	nodeModulesDir: string,
	targetPlatform: string,
	targetArchSet: Set<string>,
	removedPaths: string[],
): void {
	const parcelRoot = join(nodeModulesDir, "@parcel");
	const watcherRoot = join(parcelRoot, "watcher");
	const targetPackages = getParcelWatcherTargetPackages(
		targetPlatform,
		targetArchSet,
	);

	for (const packageDir of listDirectories(parcelRoot)) {
		if (!packageDir.startsWith("watcher-")) {
			continue;
		}
		if (!targetPackages.has(packageDir)) {
			removePath(nodeModulesDir, join(parcelRoot, packageDir), removedPaths);
		}
	}

	const hasTargetPackage = [...targetPackages].some((packageDir) =>
		existsSync(join(parcelRoot, packageDir)),
	);
	if (hasTargetPackage) {
		removePath(nodeModulesDir, join(watcherRoot, "build"), removedPaths);
	}
}

function pruneBetterSqlite3(
	nodeModulesDir: string,
	removedPaths: string[],
): void {
	const betterSqliteRoot = join(nodeModulesDir, "better-sqlite3");
	removePath(nodeModulesDir, join(betterSqliteRoot, "deps"), removedPaths);
	removePath(nodeModulesDir, join(betterSqliteRoot, "src"), removedPaths);
}

export async function prunePackagedNativePayloads({
	appOutDir,
	targetArch,
	targetPlatform,
}: PruneTarget): Promise<NativePayloadPruneResult> {
	const nodeModulesDir = resolvePackagedNodeModulesDir(appOutDir);
	if (!nodeModulesDir) {
		console.warn(
			`[prune:native-payloads] packaged node_modules not found under ${appOutDir}; skipping`,
		);
		return { nodeModulesDir: null, removedPaths: [] };
	}

	const normalizedPlatform = normalizeTargetPlatform(targetPlatform);
	const normalizedArch = normalizeBuilderArch(targetArch);
	const targetArchSet = getTargetArchSet(normalizedArch);
	const removedPaths: string[] = [];

	pruneOnnxRuntimeNode(
		nodeModulesDir,
		normalizedPlatform,
		targetArchSet,
		removedPaths,
	);
	pruneKoffi(nodeModulesDir, normalizedPlatform, targetArchSet, removedPaths);
	pruneNodePty(nodeModulesDir, normalizedPlatform, targetArchSet, removedPaths);
	pruneAstGrep(nodeModulesDir, normalizedPlatform, targetArchSet, removedPaths);
	pruneLibsql(nodeModulesDir, normalizedPlatform, targetArchSet, removedPaths);
	pruneParcelWatcher(
		nodeModulesDir,
		normalizedPlatform,
		targetArchSet,
		removedPaths,
	);
	pruneBetterSqlite3(nodeModulesDir, removedPaths);

	console.log(
		`[prune:native-payloads] ${normalizedPlatform}/${normalizedArch}: removed ${removedPaths.length} non-target native payload path(s)`,
	);

	return { nodeModulesDir, removedPaths };
}

if (import.meta.main) {
	const appOutDir = process.argv[2];
	if (!appOutDir) {
		console.error(
			"Usage: bun run scripts/prune-packaged-native-payloads.ts <app-out-dir>",
		);
		process.exit(1);
	}

	await prunePackagedNativePayloads({
		appOutDir,
		targetArch: process.env.TARGET_ARCH ?? process.arch,
		targetPlatform: process.env.TARGET_PLATFORM ?? process.platform,
	});
}
