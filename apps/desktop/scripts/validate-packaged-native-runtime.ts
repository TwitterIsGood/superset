/**
 * Validate that the packaged app contains unpacked runtime files.
 *
 * Source-tree checks are not enough: CI can cache a materialized node_modules
 * directory whose packages exist but whose Electron ABI `.node` bindings were
 * never rebuilt, or can omit a JS-only package required by an externalized
 * host-service dependency. This guard runs against app.asar.unpacked after
 * electron-builder has copied and pruned files.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getRequiredPackagedRuntimeFiles } from "../runtime-dependencies";

type ValidatePackagedNativeRuntimeOptions = {
	appOutDir: string;
	targetArch?: string;
	targetPlatform?: string;
};

type ValidatePackagedNativeRuntimeResult = {
	nonExecutableFiles: string[];
	missingFiles: string[];
	nodeModulesDir: string;
	requiredFiles: string[];
};

function listDirectories(path: string): string[] {
	if (!existsSync(path)) return [];
	return readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
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

function formatMissingNativeRuntimeError({
	appOutDir,
	missingFiles,
	nodeModulesDir,
	nonExecutableFiles = [],
}: {
	appOutDir: string;
	missingFiles: string[];
	nodeModulesDir?: string;
	nonExecutableFiles?: string[];
}): string {
	return [
		"[validate:packaged-native-runtime] Packaged runtime files are missing.",
		`App output: ${appOutDir}`,
		nodeModulesDir ? `Packaged node_modules: ${nodeModulesDir}` : null,
		...missingFiles.map((file) => `Missing: ${file}`),
		...nonExecutableFiles.map((file) => `Not executable: ${file}`),
		"Run `bun run --cwd apps/desktop install:deps`, then rebuild the package.",
	]
		.filter(Boolean)
		.join("\n");
}

export function validatePackagedNativeRuntime({
	appOutDir,
	targetArch,
	targetPlatform,
}: ValidatePackagedNativeRuntimeOptions): ValidatePackagedNativeRuntimeResult {
	const nodeModulesDir = resolvePackagedNodeModulesDir(appOutDir);
	if (!nodeModulesDir) {
		throw new Error(
			formatMissingNativeRuntimeError({
				appOutDir,
				missingFiles: ["app.asar.unpacked/node_modules"],
			}),
		);
	}

	const requiredFiles = getRequiredPackagedRuntimeFiles({
		targetArch,
		targetPlatform,
	});
	const requiredFilePaths = requiredFiles.map((file) => file.relativePath);
	const missingFiles = requiredFiles.filter(
		(file) => !existsSync(join(nodeModulesDir, file.relativePath)),
	);
	const nonExecutableFiles = requiredFiles.filter((file) => {
		if (!file.mustBeExecutable) return false;
		const absolutePath = join(nodeModulesDir, file.relativePath);
		return (
			existsSync(absolutePath) && (statSync(absolutePath).mode & 0o111) === 0
		);
	});

	if (missingFiles.length > 0 || nonExecutableFiles.length > 0) {
		throw new Error(
			formatMissingNativeRuntimeError({
				appOutDir,
				missingFiles: missingFiles.map((file) => file.relativePath),
				nodeModulesDir,
				nonExecutableFiles: nonExecutableFiles.map((file) => file.relativePath),
			}),
		);
	}

	console.log(
		`[validate:packaged-native-runtime] OK: ${requiredFiles.length} packaged runtime file(s) present`,
	);

	return {
		missingFiles: [],
		nodeModulesDir,
		nonExecutableFiles: [],
		requiredFiles: requiredFilePaths,
	};
}

if (import.meta.main) {
	const appOutDir = process.argv[2] ?? "release";
	try {
		validatePackagedNativeRuntime({
			appOutDir,
			targetArch: process.env.TARGET_ARCH ?? process.arch,
			targetPlatform: process.env.TARGET_PLATFORM ?? process.platform,
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
