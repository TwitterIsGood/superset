import { existsSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { CLAUDE_AGENT_RUNTIME_PACK_ID } from "../src/lib/pack-system/pack-ids";
import { packManifestSchema } from "../src/main/lib/pack-system/types";
import {
	getClaudeAgentRuntimePackResourceCopies,
	getClaudeAgentSdkPlatformPackageName,
} from "./claude-agent-runtime-pack-dependencies";
import { buildPackArchive } from "./resource-pack-archive";
import { writeMergedResourcePackAppIndex } from "./resource-pack-index";
import { defaultResourcePackOutDir } from "./resource-pack-paths";

const require = createRequire(import.meta.url);
const appDir = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(appDir, "..", "..");
const RESOURCE_PACK_BASE_URL_ENV = "SUPERSET_RESOURCE_PACK_BASE_URL";
const CLAUDE_AGENT_SDK_PACKAGE_NAME = "@anthropic-ai/claude-agent-sdk";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const targetArch = process.env.TARGET_ARCH ?? process.arch;

interface BuildArgs {
	appIndexOut?: string;
	downloadUrl?: string;
	minAppVersion?: string;
	outDir: string;
	version?: string;
}

function fail(message: string): never {
	console.error(`[build:claude-agent-pack] ${message}`);
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
	claudeCodeVersion?: string;
	name?: string;
	version?: string;
} {
	return JSON.parse(
		readFileSync(join(packageRoot, "package.json"), "utf8"),
	) as {
		claudeCodeVersion?: string;
		name?: string;
		version?: string;
	};
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

async function copyRuntimeModule(args: {
	from: string;
	to: string;
	versionRoot: string;
}): Promise<void> {
	const packageName = args.from.replace(/^node_modules\//, "");
	const source = resolvePackageRoot(packageName, [appDir, workspaceRoot]);
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

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function defaultDownloadUrl(version: string): string {
	const baseUrl =
		process.env[RESOURCE_PACK_BASE_URL_ENV]?.trim() ||
		"https://cdn.superset.sh/packs";
	return new URL(
		`${CLAUDE_AGENT_RUNTIME_PACK_ID}/${version}/`,
		ensureTrailingSlash(baseUrl),
	).href;
}

async function buildManifest(args: {
	downloadUrl: string;
	minAppVersion?: string;
	platformPackageName: string;
	version: string;
	versionRoot: string;
}) {
	const { archive, files } = await buildPackArchive(args.versionRoot);

	return packManifestSchema.parse({
		schemaVersion: 1,
		packId: CLAUDE_AGENT_RUNTIME_PACK_ID,
		version: args.version,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl,
		archive,
		files,
		executeHint: {
			runtime: "node",
			entry: "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs",
			args: [`node_modules/${args.platformPackageName}/claude`],
		},
	});
}

async function main() {
	const args = parseArgs();
	const sdkRoot = resolvePackageRoot(CLAUDE_AGENT_SDK_PACKAGE_NAME, [
		appDir,
		workspaceRoot,
	]);
	const sdkPackage = readPackageJson(sdkRoot);
	const baseVersion = args.version ?? sdkPackage.version;
	if (!baseVersion)
		fail("Could not determine Claude Agent runtime pack version");
	const version = `${baseVersion}-${targetPlatform}-${targetArch}`;

	const platformPackageName = getClaudeAgentSdkPlatformPackageName();
	const packRoot = join(args.outDir, CLAUDE_AGENT_RUNTIME_PACK_ID);
	const versionRoot = join(packRoot, version);
	await rm(versionRoot, { recursive: true, force: true });
	await mkdir(versionRoot, { recursive: true });

	for (const copySpec of getClaudeAgentRuntimePackResourceCopies()) {
		await copyRuntimeModule({
			from: copySpec.from,
			to: copySpec.to,
			versionRoot,
		});
	}

	const claudeExecutable = join(
		versionRoot,
		"node_modules",
		...platformPackageName.split("/"),
		process.platform === "win32" ? "claude.exe" : "claude",
	);
	if (existsSync(claudeExecutable)) {
		await chmod(claudeExecutable, 0o755);
	}

	const manifest = await buildManifest({
		version,
		versionRoot,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl ?? defaultDownloadUrl(version),
		platformPackageName,
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
				packId: CLAUDE_AGENT_RUNTIME_PACK_ID,
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
		packId: CLAUDE_AGENT_RUNTIME_PACK_ID,
	});

	console.log("# Claude Agent Runtime Pack");
	console.log(`- SDK Version: ${baseVersion}`);
	console.log(`- Pack Version: ${version}`);
	console.log(
		`- Claude Code Version: ${sdkPackage.claudeCodeVersion ?? "unknown"}`,
	);
	console.log(`- Platform package: ${platformPackageName}`);
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
