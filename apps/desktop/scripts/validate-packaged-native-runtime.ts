/**
 * Validate that the packaged app contains unpacked runtime files.
 *
 * Source-tree checks are not enough: CI can cache a materialized node_modules
 * directory whose packages exist but whose Electron ABI `.node` bindings were
 * never rebuilt, or can omit a JS-only package required by an externalized
 * host-service dependency. This guard runs against app.asar.unpacked after
 * electron-builder has copied and pruned files.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getRequiredPackagedRuntimeFiles } from "../runtime-dependencies";

type ValidatePackagedNativeRuntimeOptions = {
	appOutDir: string;
	targetArch?: string;
	targetPlatform?: string;
};

type ValidatePackagedNativeRuntimeResult = {
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
}: {
	appOutDir: string;
	missingFiles: string[];
	nodeModulesDir?: string;
}): string {
	return [
		"[validate:packaged-native-runtime] Packaged runtime files are missing.",
		`App output: ${appOutDir}`,
		nodeModulesDir ? `Packaged node_modules: ${nodeModulesDir}` : null,
		...missingFiles.map((file) => `Missing: ${file}`),
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
	}).map((file) => file.relativePath);
	const missingFiles = requiredFiles.filter(
		(relativePath) => !existsSync(join(nodeModulesDir, relativePath)),
	);

	if (missingFiles.length > 0) {
		throw new Error(
			formatMissingNativeRuntimeError({
				appOutDir,
				missingFiles,
				nodeModulesDir,
			}),
		);
	}

	console.log(
		`[validate:packaged-native-runtime] OK: ${requiredFiles.length} packaged runtime file(s) present`,
	);

	return { missingFiles, nodeModulesDir, requiredFiles };
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
