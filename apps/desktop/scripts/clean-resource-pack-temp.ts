import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	defaultResourcePackOutDir,
	defaultResourcePackTempRoot,
	legacyDistResourcePackDirs,
} from "./resource-pack-paths";

export interface CleanResourcePackTempOptions {
	dryRun?: boolean;
	extraTargets?: string[];
	tempRoot?: string;
}

export interface CleanResourcePackTempResult {
	removed: string[];
}

const generatedPackDirNamePatterns = [
	/^resource-packs$/,
	/^resource-pack-/,
	/-pack-/,
	/-pack$/,
	/^all-pack-/,
	/^native-pack-/,
	/^trellis-runtime-/,
	/^claude-agent-pack-/,
	/^claude-pack-/,
	/^mastracode-pack-/,
	/^cli-pack-/,
	/^superset-cli-pack-/,
];

function isGeneratedPackTempDir(name: string): boolean {
	return generatedPackDirNamePatterns.some((pattern) => pattern.test(name));
}

function existingDirectory(path: string): string | null {
	if (!existsSync(path)) return null;
	const stat = statSync(path);
	return stat.isDirectory() ? path : null;
}

export function collectResourcePackTempTargets({
	extraTargets = [],
	tempRoot = defaultResourcePackTempRoot,
}: CleanResourcePackTempOptions = {}): string[] {
	const targets = new Set<string>();

	for (const path of [
		...legacyDistResourcePackDirs,
		defaultResourcePackOutDir,
	]) {
		const directory = existingDirectory(path);
		if (directory) targets.add(directory);
	}

	if (existsSync(tempRoot)) {
		for (const entry of readdirSync(tempRoot, { withFileTypes: true })) {
			if (!entry.isDirectory() || !isGeneratedPackTempDir(entry.name)) continue;
			targets.add(join(tempRoot, entry.name));
		}
	}

	for (const path of extraTargets) {
		const directory = existingDirectory(resolve(path));
		if (directory) targets.add(directory);
	}

	return [...targets].sort();
}

export function cleanResourcePackTemp(
	options: CleanResourcePackTempOptions = {},
): CleanResourcePackTempResult {
	const targets = collectResourcePackTempTargets(options);
	if (!options.dryRun) {
		for (const target of targets) {
			rmSync(target, { force: true, recursive: true });
		}
	}
	return { removed: targets };
}

function parseArgs(argv: string[]): CleanResourcePackTempOptions {
	const options: CleanResourcePackTempOptions = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const [flag, inlineValue] = arg.split("=", 2);
		const readValue = () => {
			if (inlineValue) return inlineValue;
			const value = argv[index + 1];
			if (!value) throw new Error(`${flag} requires a value`);
			index += 1;
			return value;
		};

		switch (flag) {
			case "--dry-run":
				options.dryRun = true;
				break;
			case "--temp-root":
				options.tempRoot = resolve(readValue());
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

if (import.meta.main) {
	try {
		const options = parseArgs(process.argv.slice(2));
		const result = cleanResourcePackTemp(options);
		const action = options.dryRun ? "would remove" : "removed";
		if (result.removed.length === 0) {
			console.log("[desktop] no generated resource-pack temp outputs found");
		} else {
			for (const path of result.removed) {
				console.log(`[desktop] ${action} ${relative(process.cwd(), path)}`);
			}
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
