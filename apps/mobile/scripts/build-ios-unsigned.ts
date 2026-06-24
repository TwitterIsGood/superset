#!/usr/bin/env bun
/// <reference types="bun-types" />

import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
	getIosAtsExceptionDomains,
	type MobileProfileName,
	resolveMobileEnv,
	toExpoPublicEnv,
} from "../config/mobile-env";

const DEFAULT_OUTPUT_DIR = "/tmp/superset-mobile-ipa";
const DEFAULT_IPA_NAME = "Superset-unsigned.ipa";

type Options = {
	profile: MobileProfileName;
	outputDir: string;
	skipPrebuild: boolean;
};

function readOption(name: string) {
	const index = Bun.argv.indexOf(name);
	if (index === -1) return undefined;
	return Bun.argv[index + 1];
}

function hasFlag(name: string) {
	return Bun.argv.includes(name);
}

function parseOptions(): Options {
	return {
		profile:
			(readOption("--profile") as MobileProfileName | undefined) ??
			(process.env.SUPERSET_MOBILE_PROFILE as MobileProfileName | undefined) ??
			"online-canary",
		outputDir: resolve(readOption("--output-dir") ?? DEFAULT_OUTPUT_DIR),
		skipPrebuild: hasFlag("--skip-prebuild"),
	};
}

async function run(
	command: string,
	args: string[],
	options: { cwd: string; env?: Record<string, string | undefined> },
) {
	const child = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await child.exited;
	if (exitCode !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with exit ${exitCode}`,
		);
	}
}

async function zipIpa(appPath: string, outputPath: string, cwd: string) {
	await rm(outputPath, { force: true });
	const stagingDir = join(cwd, ".ipa-staging");
	const payloadDir = join(stagingDir, "Payload");
	await rm(stagingDir, { force: true, recursive: true });
	await mkdir(payloadDir, { recursive: true });

	try {
		await cp(appPath, join(payloadDir, basename(appPath)), { recursive: true });
		await run(
			"ditto",
			["-c", "-k", "--sequesterRsrc", "--keepParent", "Payload", outputPath],
			{
				cwd: stagingDir,
			},
		);
	} finally {
		await rm(stagingDir, { force: true, recursive: true });
	}
}

async function verifyPlist(appPath: string, expectedDomains: string[]) {
	const plistPath = join(appPath, "Info.plist");
	for (const domain of expectedDomains) {
		await run(
			"/usr/libexec/PlistBuddy",
			[
				"-c",
				`Print :NSAppTransportSecurity:NSExceptionDomains:${domain}:NSExceptionAllowsInsecureHTTPLoads`,
				plistPath,
			],
			{ cwd: process.cwd() },
		);
	}
}

async function main() {
	const mobileRoot = resolve(import.meta.dir, "..");
	const options = parseOptions();
	process.env.SUPERSET_MOBILE_PROFILE = options.profile;

	const resolvedEnv = resolveMobileEnv(process.env);
	const publicEnv = toExpoPublicEnv(resolvedEnv);
	const buildEnv = {
		...publicEnv,
		SUPERSET_MOBILE_PROFILE: resolvedEnv.EXPO_PUBLIC_SUPERSET_PROFILE,
		NODE_ENV: "production",
	};

	if (!options.skipPrebuild) {
		await run(
			"bunx",
			["expo", "prebuild", "--platform", "ios", "--no-install"],
			{
				cwd: mobileRoot,
				env: buildEnv,
			},
		);
	}

	const workspacePath = join(mobileRoot, "ios", "Superset.xcworkspace");
	if (!existsSync(workspacePath)) {
		throw new Error(`Missing Xcode workspace: ${workspacePath}`);
	}

	const archivePath = join(options.outputDir, "Superset.xcarchive");
	const outputPath = join(options.outputDir, DEFAULT_IPA_NAME);
	await mkdir(options.outputDir, { recursive: true });
	await rm(archivePath, { force: true, recursive: true });

	await run(
		"xcodebuild",
		[
			"archive",
			"-workspace",
			workspacePath,
			"-scheme",
			"Superset",
			"-configuration",
			"Release",
			"-sdk",
			"iphoneos",
			"-destination",
			"generic/platform=iOS",
			"-archivePath",
			archivePath,
			"CODE_SIGNING_ALLOWED=NO",
			"CODE_SIGNING_REQUIRED=NO",
			"CODE_SIGN_IDENTITY=",
			"DEVELOPMENT_TEAM=",
		],
		{
			cwd: mobileRoot,
			env: buildEnv,
		},
	);

	const appPath = join(archivePath, "Products", "Applications", "Superset.app");
	if (!existsSync(appPath)) {
		throw new Error(`Archive did not produce app bundle: ${appPath}`);
	}

	await verifyPlist(
		appPath,
		Object.keys(getIosAtsExceptionDomains(resolvedEnv)),
	);
	await zipIpa(appPath, outputPath, options.outputDir);
	console.log(`Unsigned IPA: ${outputPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
