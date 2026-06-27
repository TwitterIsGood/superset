import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { SUPERSET_CLI_RUNTIME_PACK_ID } from "../src/lib/pack-system/pack-ids";
import { packManifestSchema } from "../src/main/lib/pack-system/types";
import { buildPackArchive } from "./resource-pack-archive";
import { writeMergedResourcePackAppIndex } from "./resource-pack-index";
import { defaultResourcePackOutDir } from "./resource-pack-paths";

type SupportedPlatform = "darwin" | "linux" | "win32";
type SupportedArch = "arm64" | "x64";

const appDir = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(appDir, "..", "..");
const cliDir = resolve(workspaceRoot, "packages", "cli");
const RESOURCE_PACK_BASE_URL_ENV = "SUPERSET_RESOURCE_PACK_BASE_URL";
const targetPlatform = (process.env.TARGET_PLATFORM ??
	process.platform) as NodeJS.Platform;
const targetArch = (process.env.TARGET_ARCH ?? process.arch) as string;

const BUN_TARGETS: Partial<
	Record<SupportedPlatform, Partial<Record<SupportedArch, string>>>
> = {
	darwin: {
		arm64: "bun-darwin-arm64",
		x64: "bun-darwin-x64",
	},
	linux: {
		arm64: "bun-linux-arm64",
		x64: "bun-linux-x64",
	},
	win32: {
		x64: "bun-windows-x64",
	},
};

interface BuildArgs {
	appIndexOut?: string;
	downloadUrl?: string;
	minAppVersion?: string;
	outDir: string;
	version?: string;
}

function fail(message: string): never {
	console.error(`[build:cli-pack] ${message}`);
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

function getBunTarget(): string {
	const platformTargets = BUN_TARGETS[targetPlatform as SupportedPlatform];
	const target = platformTargets?.[targetArch as SupportedArch];
	if (!target) {
		fail(
			`Unsupported CLI runtime pack target: ${targetPlatform}/${targetArch}`,
		);
	}
	return target;
}

function getBinaryName(): string {
	return targetPlatform === "win32" ? "superset.exe" : "superset";
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

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function defaultDownloadUrl(version: string): string {
	const baseUrl =
		process.env[RESOURCE_PACK_BASE_URL_ENV]?.trim() ||
		"https://cdn.superset.sh/packs";
	return new URL(
		`${SUPERSET_CLI_RUNTIME_PACK_ID}/${version}/`,
		ensureTrailingSlash(baseUrl),
	).href;
}

function buildCliBuildEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	const apiUrl =
		process.env.SUPERSET_API_URL || process.env.NEXT_PUBLIC_API_URL;
	const webUrl =
		process.env.SUPERSET_WEB_URL || process.env.NEXT_PUBLIC_WEB_URL;

	if (apiUrl) {
		env.SUPERSET_API_URL = apiUrl;
	}
	if (webUrl) {
		env.SUPERSET_WEB_URL = webUrl;
	}

	return env;
}

function run(
	command: string,
	args: string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: "inherit",
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
		});
	});
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
		packId: SUPERSET_CLI_RUNTIME_PACK_ID,
		version: args.version,
		minAppVersion: args.minAppVersion,
		downloadUrl: args.downloadUrl,
		archive,
		files,
		executeHint: {
			runtime: "binary",
			entry: `bin/${getBinaryName()}`,
		},
	});
}

async function main() {
	const args = parseArgs();
	const cliPackage = readPackageJson(cliDir);
	const baseVersion = args.version ?? cliPackage.version;
	if (!baseVersion)
		fail("Could not determine Superset CLI runtime pack version");
	const version = `${baseVersion}-${targetPlatform}-${targetArch}`;

	const packRoot = join(args.outDir, SUPERSET_CLI_RUNTIME_PACK_ID);
	const versionRoot = join(packRoot, version);
	const binaryPath = join(versionRoot, "bin", getBinaryName());
	await rm(versionRoot, { recursive: true, force: true });
	await mkdir(dirname(binaryPath), { recursive: true });

	await run(
		"bun",
		["run", "build", `--target=${getBunTarget()}`, `--outfile=${binaryPath}`],
		{
			cwd: cliDir,
			env: buildCliBuildEnv(),
		},
	);

	if (targetPlatform !== "win32") {
		await chmod(binaryPath, 0o755);
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
				packId: SUPERSET_CLI_RUNTIME_PACK_ID,
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
		packId: SUPERSET_CLI_RUNTIME_PACK_ID,
	});

	console.log("# Superset CLI Runtime Pack");
	console.log(`- Version: ${version}`);
	console.log(`- Bun target: ${getBunTarget()}`);
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
