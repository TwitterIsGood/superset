import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type ArtifactKind = "AppImage" | "dmg" | "zip";

interface ArtifactBudget {
	maxBytes: number;
	targetBytes?: number;
}

interface PerfBudget {
	packageSize: {
		releaseArtifacts: Record<ArtifactKind, ArtifactBudget>;
	};
}

interface CliOptions {
	budgetPath: string;
	json: boolean;
	releaseDir: string;
	requireArtifacts: boolean;
}

interface ArtifactResult {
	kind: ArtifactKind;
	path: string;
	sizeBytes: number;
	maxBytes: number;
	targetBytes?: number;
	status: "ok" | "target-exceeded" | "max-exceeded";
}

interface CheckResult {
	artifacts: ArtifactResult[];
	failures: string[];
	warnings: string[];
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");

function fail(message: string): never {
	console.error(`[check-package-budget] ${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		budgetPath: resolve(desktopDir, "perf-budget.json"),
		json: false,
		releaseDir: resolve(desktopDir, "release"),
		requireArtifacts: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--require-artifacts") {
			options.requireArtifacts = true;
			continue;
		}
		if (arg === "--budget") {
			const value = argv[index + 1];
			if (!value) fail("--budget requires a value");
			options.budgetPath = resolve(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--budget=")) {
			options.budgetPath = resolve(arg.slice("--budget=".length));
			continue;
		}
		if (arg === "--release-dir") {
			const value = argv[index + 1];
			if (!value) fail("--release-dir requires a value");
			options.releaseDir = resolve(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--release-dir=")) {
			options.releaseDir = resolve(arg.slice("--release-dir=".length));
			continue;
		}
		fail(`Unknown argument: ${arg}`);
	}

	return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
	if (!isRecord(value)) {
		fail(`Invalid budget: ${path} must be an object`);
	}
	return value;
}

function requireNumber(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		fail(`Invalid budget: ${path} must be a positive number`);
	}
	return value;
}

function readBudget(budgetPath: string): PerfBudget {
	if (!existsSync(budgetPath)) {
		fail(`Budget file not found: ${budgetPath}`);
	}

	const raw = JSON.parse(readFileSync(budgetPath, "utf8")) as unknown;
	const root = requireRecord(raw, "root");
	const packageSize = requireRecord(root.packageSize, "packageSize");
	const releaseArtifacts = requireRecord(
		packageSize.releaseArtifacts,
		"packageSize.releaseArtifacts",
	);

	const result: PerfBudget = {
		packageSize: {
			releaseArtifacts: {
				AppImage: readArtifactBudget(releaseArtifacts, "AppImage"),
				dmg: readArtifactBudget(releaseArtifacts, "dmg"),
				zip: readArtifactBudget(releaseArtifacts, "zip"),
			},
		},
	};

	return result;
}

function readArtifactBudget(
	budgets: Record<string, unknown>,
	kind: ArtifactKind,
): ArtifactBudget {
	const value = requireRecord(
		budgets[kind],
		`packageSize.releaseArtifacts.${kind}`,
	);
	const maxBytes = requireNumber(
		value.maxBytes,
		`packageSize.releaseArtifacts.${kind}.maxBytes`,
	);
	const targetBytes =
		value.targetBytes === undefined
			? undefined
			: requireNumber(
					value.targetBytes,
					`packageSize.releaseArtifacts.${kind}.targetBytes`,
				);

	return { maxBytes, ...(targetBytes !== undefined && { targetBytes }) };
}

function collectFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const stats = lstatSync(dir);
	if (!stats.isDirectory()) return [];

	const files: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const entryPath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (entry.isFile()) {
				files.push(entryPath);
			}
		}
	}
	return files;
}

function artifactKindForPath(path: string): ArtifactKind | null {
	if (path.endsWith(".AppImage")) return "AppImage";
	if (path.endsWith(".dmg")) return "dmg";
	if (path.endsWith(".zip")) return "zip";
	return null;
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function relativeToRoot(path: string): string {
	return relative(rootDir, path);
}

function checkPackageBudget(options: CliOptions): CheckResult {
	const budget = readBudget(options.budgetPath);
	const artifactPaths = collectFiles(options.releaseDir).filter(
		(path) => artifactKindForPath(path) !== null,
	);
	const warnings: string[] = [];
	const failures: string[] = [];

	if (artifactPaths.length === 0) {
		const message = `No release artifacts found in ${relativeToRoot(
			options.releaseDir,
		)}. Run after packaging or pass --release-dir=<path>.`;
		if (options.requireArtifacts) {
			failures.push(message);
		} else {
			warnings.push(message);
		}
	}

	const artifacts = artifactPaths
		.sort((left, right) => left.localeCompare(right))
		.map((path): ArtifactResult => {
			const kind = artifactKindForPath(path);
			if (!kind) {
				throw new Error(`Unexpected non-artifact path: ${path}`);
			}
			const sizeBytes = lstatSync(path).size;
			const artifactBudget = budget.packageSize.releaseArtifacts[kind];
			let status: ArtifactResult["status"] = "ok";
			if (sizeBytes > artifactBudget.maxBytes) {
				status = "max-exceeded";
				failures.push(
					`${relativeToRoot(path)} is ${formatBytes(sizeBytes)}, above ${kind} hard limit ${formatBytes(artifactBudget.maxBytes)}.`,
				);
			} else if (
				artifactBudget.targetBytes !== undefined &&
				sizeBytes > artifactBudget.targetBytes
			) {
				status = "target-exceeded";
				warnings.push(
					`${relativeToRoot(path)} is ${formatBytes(sizeBytes)}, above ${kind} target ${formatBytes(artifactBudget.targetBytes)}.`,
				);
			}

			return {
				kind,
				maxBytes: artifactBudget.maxBytes,
				path,
				sizeBytes,
				status,
				...(artifactBudget.targetBytes !== undefined && {
					targetBytes: artifactBudget.targetBytes,
				}),
			};
		});

	return { artifacts, failures, warnings };
}

function printHumanReport(result: CheckResult): void {
	console.log("# Desktop Package Budget Check");
	console.log("");
	if (result.artifacts.length === 0) {
		console.log("- No release artifacts checked.");
	} else {
		console.log("| Artifact | Kind | Size | Target | Max | Status |");
		console.log("| --- | --- | ---: | ---: | ---: | --- |");
		for (const artifact of result.artifacts) {
			console.log(
				`| \`${relativeToRoot(artifact.path)}\` | ${artifact.kind} | ${formatBytes(artifact.sizeBytes)} | ${artifact.targetBytes === undefined ? "-" : formatBytes(artifact.targetBytes)} | ${formatBytes(artifact.maxBytes)} | ${artifact.status} |`,
			);
		}
	}

	if (result.warnings.length > 0) {
		console.log("");
		console.log("## Warnings");
		for (const warning of result.warnings) {
			console.log(`- ${warning}`);
		}
	}

	if (result.failures.length > 0) {
		console.log("");
		console.log("## Failures");
		for (const failure of result.failures) {
			console.log(`- ${failure}`);
		}
	}
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));
	const result = checkPackageBudget(options);

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		printHumanReport(result);
	}

	if (result.failures.length > 0) {
		process.exit(1);
	}
}

main();
