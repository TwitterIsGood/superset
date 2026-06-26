import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import hostServicePackageJson from "../../packages/host-service/package.json";
import packageJson from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
	packOnlyNodeModuleFileExcludes,
	requiredMaterializedNodeModules,
} from "./runtime-dependencies";
import {
	getClaudeAgentRuntimePackModuleNames,
	getClaudeAgentRuntimePackResourceCopies,
	getClaudeAgentSdkPlatformPackageName,
} from "./scripts/claude-agent-runtime-pack-dependencies";
import {
	getDuckdbNodeBindingsPackageName,
	mastracodeRuntimeSeedPackageNames,
	shouldIncludeMastracodeRuntimeDependency,
} from "./scripts/mastracode-runtime-pack-dependencies";
import {
	trellisRuntimePackModuleNames,
	trellisRuntimePackResourceCopies,
} from "./scripts/trellis-runtime-pack-dependencies";

describe("Trellis runtime pack packaging", () => {
	const trellisRuntimeModules = [
		"@mindfoldhq/trellis",
		"@mindfoldhq/trellis-core",
		"ora",
		"chalk",
		"ansi-styles",
		"color-convert",
		"color-name",
		"supports-color",
		"has-flag",
	];

	test("keeps Trellis CLI runtime modules pack-only", () => {
		for (const moduleName of trellisRuntimeModules) {
			expect(trellisRuntimePackModuleNames).toContain(
				moduleName as (typeof trellisRuntimePackModuleNames)[number],
			);
			expect(trellisRuntimePackResourceCopies).toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
			expect(packagedNodeModuleCopies).not.toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
			expect(requiredMaterializedNodeModules).not.toContain(moduleName);
			expect(packagedAsarUnpackGlobs).not.toContain(
				`**/node_modules/${moduleName}/**/*`,
			);
		}
	});

	test("keeps CJS-only Trellis compatibility dependencies nested", () => {
		expect(requiredMaterializedNodeModules).not.toContain("mimic-fn");
		expect(trellisRuntimePackResourceCopies).toContainEqual(
			expect.objectContaining({
				from: "node_modules/onetime/node_modules/mimic-fn",
				to: "node_modules/onetime/node_modules/mimic-fn",
			}),
		);
		expect(trellisRuntimePackResourceCopies).toContainEqual(
			expect.objectContaining({
				from: "node_modules/restore-cursor/node_modules/signal-exit",
				to: "node_modules/restore-cursor/node_modules/signal-exit",
			}),
		);
	});

	test("exposes Trellis runtime pack build and smoke commands for release gates", () => {
		expect(packageJson.scripts).toHaveProperty("build:trellis-pack");
		expect(packageJson.scripts).toHaveProperty("build:claude-agent-pack");
		expect(packageJson.scripts).toHaveProperty("build:mastracode-pack");
		expect(packageJson.scripts).toHaveProperty("build:cli-pack");
		expect(packageJson.scripts).toHaveProperty("validate:trellis-runtime");

		const workflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"build-desktop.yml",
			),
			"utf8",
		);
		expect(workflow).toContain("Build desktop resource packs");
		expect(workflow).toContain("Verify resource pack runtimes are pack-only");
		expect(workflow).toContain("bun run build:claude-agent-pack");
		expect(workflow).toContain("bun run build:mastracode-pack");
		expect(workflow).toContain("bun run build:cli-pack");
		expect(workflow).toContain(
			'if [[ "$BUNDLE_CLI" != "true" && "$UPLOAD_RESOURCE_PACK_ARTIFACTS" == "true" ]]',
		);
		expect(workflow).toContain("bun run validate:trellis-runtime");
		expect(workflow).toContain("Cache Electron packaging downloads");
	});

	test("keeps artifact-only canary validation on the fast macOS ZIP path", () => {
		const buildWorkflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"build-desktop.yml",
			),
			"utf8",
		);
		const canaryWorkflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"release-desktop-canary.yml",
			),
			"utf8",
		);
		const stableReleaseWorkflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"release-desktop.yml",
			),
			"utf8",
		);

		expect(buildWorkflow).toContain("macos_artifact_mode");
		expect(buildWorkflow).toContain("zip_only");
		expect(buildWorkflow).toContain('PACKAGE_TARGET_ARGS=("--mac" "zip"');
		expect(buildWorkflow).toContain("if: inputs.macos_artifact_mode == 'full'");
		expect(buildWorkflow).toContain(
			"Verify macOS auto-update metadata and CLI delivery",
		);
		expect(buildWorkflow).toContain(
			"Upload auto-update manifest\n        if: inputs.macos_artifact_mode == 'full'",
		);
		expect(buildWorkflow).toContain("upload_resource_pack_artifacts");
		expect(buildWorkflow).toContain("require_resource_pack_object_storage");
		expect(buildWorkflow).toContain("bundle_cli");
		expect(buildWorkflow).toContain("upload_sourcemaps");
		expect(buildWorkflow).toContain("DESKTOP_BUNDLE_CLI");
		expect(buildWorkflow).toContain(
			"Published desktop builds require SUPERSET_OBJECT_STORAGE_* secrets",
		);
		expect(buildWorkflow).toContain(
			'if [[ "$REQUIRE_RESOURCE_PACK_OBJECT_STORAGE" == "true" ]]',
		);
		expect(buildWorkflow).toContain(
			"SENTRY_AUTH_TOKEN: $" +
				"{{ inputs.upload_sourcemaps && secrets.SENTRY_AUTH_TOKEN || '' }}",
		);
		expect(buildWorkflow).toContain(
			"if: inputs.upload_resource_pack_artifacts",
		);
		expect(buildWorkflow).toContain("Superset CLI runtime pack binary missing");
		expect(buildWorkflow).toContain(
			"Bundled Superset CLI should not exist when bundle_cli=false",
		);
		expect(buildWorkflow).toContain('ELECTRON_BUILDER_NPM_REBUILD: "false"');
		expect(buildWorkflow).toContain(
			"node ./node_modules/electron-builder/cli.js --publish never",
		);
		expect(buildWorkflow).toContain(
			"hashFiles('bun.lock', 'package.json', 'apps/desktop/package.json', 'packages/*/package.json')",
		);
		expect(buildWorkflow).not.toContain(
			"$" +
				"{{ runner.os }}-bun-" +
				"$" +
				"{{ steps.setup-bun.outputs.bun-revision }}-" +
				"$" +
				"{{ github.sha }}",
		);
		expect(buildWorkflow).not.toContain("bun run package -- --publish never");
		expect(canaryWorkflow).toContain(
			'BUILD_SCOPE" == "quick" && "$PUBLISH_RELEASE" == "false',
		);
		expect(canaryWorkflow).toContain("macos_artifact_mode=zip_only");
		expect(canaryWorkflow).toContain("upload_resource_pack_artifacts=false");
		expect(canaryWorkflow).toContain("bundle_cli=false");
		expect(canaryWorkflow).toContain("upload_sourcemaps=false");
		expect(canaryWorkflow).toContain(
			"require_resource_pack_object_storage: $" +
				"{{ github.event.inputs.publish_release != 'false' }}",
		);
		expect(canaryWorkflow).not.toContain("bundle_cli=true");
		expect(canaryWorkflow).toContain(
			"Remove resource-pack CI payloads from release assets",
		);
		expect(stableReleaseWorkflow).toContain(
			"require_resource_pack_object_storage: $" +
				"{{ startsWith(github.ref, 'refs/tags/desktop-v') }}",
		);
		expect(stableReleaseWorkflow).toContain(
			"Remove resource-pack CI payloads from release assets",
		);
	});

	test("defines a MastraCode runtime pack for the DuckDB-backed agent runtime", () => {
		const packIdsSource = readFileSync(
			join(import.meta.dirname, "src", "lib", "pack-system", "pack-ids.ts"),
			"utf8",
		);
		const packBuilder = readFileSync(
			join(import.meta.dirname, "scripts", "build-mastracode-runtime-pack.ts"),
			"utf8",
		);
		const packDependencies = readFileSync(
			join(
				import.meta.dirname,
				"scripts",
				"mastracode-runtime-pack-dependencies.ts",
			),
			"utf8",
		);

		expect(packIdsSource).toContain("MASTRACODE_RUNTIME_PACK_ID");
		expect(packBuilder).toContain("collectRuntimePackages");
		expect(packBuilder).toContain("MASTRACODE_RUNTIME_ENTRY");
		expect(packDependencies).toContain("@duckdb/node-bindings");
		expect(packDependencies).toContain("getDuckdbNodeBindingsPackageName");
		expect(getDuckdbNodeBindingsPackageName()).toBe(
			`@duckdb/node-bindings-${process.platform}-${process.arch}`,
		);
		expect(mastracodeRuntimeSeedPackageNames).toContain("@mastra/duckdb");
		expect(mastracodeRuntimeSeedPackageNames).toContain("@mastra/memory");
		expect(mastracodeRuntimeSeedPackageNames).not.toContain(
			"@mastra/stagehand",
		);
		expect(mastracodeRuntimeSeedPackageNames).not.toContain(
			"@mastra/agent-browser",
		);
	});

	test("keeps MastraCode runtime packs to one DuckDB platform binding", () => {
		expect(
			shouldIncludeMastracodeRuntimeDependency(
				"@duckdb/node-bindings-darwin-arm64",
				{ targetArch: "arm64", targetPlatform: "darwin" },
			),
		).toBe(true);
		expect(
			shouldIncludeMastracodeRuntimeDependency(
				"@duckdb/node-bindings-darwin-x64",
				{ targetArch: "arm64", targetPlatform: "darwin" },
			),
		).toBe(false);
		expect(
			shouldIncludeMastracodeRuntimeDependency(
				"@duckdb/node-bindings-linux-x64",
				{ targetArch: "arm64", targetPlatform: "darwin" },
			),
		).toBe(false);
		expect(
			shouldIncludeMastracodeRuntimeDependency("@duckdb/node-bindings"),
		).toBe(true);
		expect(shouldIncludeMastracodeRuntimeDependency("@mastra/duckdb")).toBe(
			true,
		);
	});

	test("defines a Superset CLI runtime pack for no-CLI desktop releases", () => {
		const packIdsSource = readFileSync(
			join(import.meta.dirname, "src", "lib", "pack-system", "pack-ids.ts"),
			"utf8",
		);
		const packBuilder = readFileSync(
			join(
				import.meta.dirname,
				"scripts",
				"build-superset-cli-runtime-pack.ts",
			),
			"utf8",
		);

		expect(packIdsSource).toContain("SUPERSET_CLI_RUNTIME_PACK_ID");
		expect(packIdsSource).toContain("superset-cli-runtime");
		expect(packBuilder).toContain("SUPERSET_CLI_RUNTIME_PACK_ID");
		expect(packBuilder).toContain('runtime: "binary"');
		expect(packBuilder).toContain("const version = `");
		expect(packBuilder).toContain("baseVersion");
		expect(packBuilder).toContain("targetPlatform");
		expect(packBuilder).toContain("targetArch");
	});

	test("uses platform-specific versions for native resource packs", () => {
		const claudePackBuilder = readFileSync(
			join(
				import.meta.dirname,
				"scripts",
				"build-claude-agent-runtime-pack.ts",
			),
			"utf8",
		);
		const mastracodePackBuilder = readFileSync(
			join(import.meta.dirname, "scripts", "build-mastracode-runtime-pack.ts"),
			"utf8",
		);

		for (const source of [claudePackBuilder, mastracodePackBuilder]) {
			expect(source).toContain("const version = `");
			expect(source).toContain("baseVersion");
			expect(source).toContain("targetPlatform");
			expect(source).toContain("targetArch");
		}
	});

	test("keeps MastraCode and DuckDB runtime modules pack-only", () => {
		for (const moduleName of [
			"mastracode",
			"@mastra/duckdb",
			"@mastra/memory",
			"@duckdb/node-api",
			"@duckdb/node-bindings",
		]) {
			expect(requiredMaterializedNodeModules).not.toContain(moduleName);
			expect(packagedNodeModuleCopies).not.toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
		}
		for (const moduleName of [
			"mastracode",
			"@mastra/agent-browser",
			"@mastra/duckdb",
			"@mastra/memory",
			"@mastra/stagehand",
			"@duckdb",
		]) {
			expect(packOnlyNodeModuleFileExcludes).toContain(
				`!node_modules/${moduleName}`,
			);
			expect(packOnlyNodeModuleFileExcludes).toContain(
				`!node_modules/${moduleName}/**/*`,
			);
		}
		expect(packagedNodeModuleCopies).not.toContainEqual(
			expect.objectContaining({
				from: "node_modules/@duckdb",
				to: "node_modules/@duckdb",
			}),
		);
		expect(packagedAsarUnpackGlobs).not.toContain(
			"**/node_modules/@duckdb/**/*",
		);
	});

	test("native runtime scripts do not require bundled Trellis files", () => {
		const copyNativeModules = readFileSync(
			join(import.meta.dirname, "scripts", "copy-native-modules.ts"),
			"utf8",
		);
		const validateNativeRuntime = readFileSync(
			join(import.meta.dirname, "scripts", "validate-native-runtime.ts"),
			"utf8",
		);

		expect(copyNativeModules).not.toContain("Preparing Trellis runtime");
		expect(validateNativeRuntime).not.toContain("Packaged Trellis CLI");
		expect(validateNativeRuntime).not.toContain(
			"@mindfoldhq/trellis/bin/trellis.js",
		);
		expect(copyNativeModules).not.toContain(
			"Preparing duckdb platform package",
		);
		expect(copyNativeModules).not.toContain("copyDuckdbPlatformPackages");
		expect(validateNativeRuntime).not.toContain("validateDuckdbPrepared");
		expect(validateNativeRuntime).not.toContain(
			"Missing platform-specific @duckdb/node-bindings package.",
		);
	});

	test("excludes Trellis resource packs and runtime dependency traversal from the base app", () => {
		const electronBuilderConfig = readFileSync(
			join(import.meta.dirname, "electron-builder.ts"),
			"utf8",
		);
		const workflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"build-desktop.yml",
			),
			"utf8",
		);

		expect(electronBuilderConfig).toContain("!dist/resource-packs/**/*");
		expect(electronBuilderConfig).toContain("!dist/resource-packs-test/**/*");
		expect(electronBuilderConfig).toContain("!node_modules/**/*");
		expect(electronBuilderConfig).toContain("bundledCliExtraResources");
		expect(electronBuilderConfig).toContain("packOnlyNodeModuleFileExcludes");
		expect(hostServicePackageJson.dependencies).not.toHaveProperty(
			"@mindfoldhq/trellis",
		);
		expect(workflow).toContain("app.asar");
		expect(workflow).toContain("@mindfoldhq/trellis");
		expect(workflow).toContain("@anthropic-ai/claude-agent-sdk");
		expect(workflow).toContain("@browserbasehq");
		expect(workflow).toContain("mastracode");
		expect(workflow).toContain("@mastra/memory");
		expect(workflow).toContain("@mastra/duckdb");
		expect(workflow).toContain("@duckdb");
		expect(workflow).toContain("playwright");
	});

	test("keeps Claude Agent SDK runtime and platform binary pack-only", () => {
		const claudeAgentSdkPlatformPackageName =
			getClaudeAgentSdkPlatformPackageName();
		for (const moduleName of [
			"@anthropic-ai/claude-agent-sdk",
			"@anthropic-ai/sdk",
			"@modelcontextprotocol/sdk",
			claudeAgentSdkPlatformPackageName,
		]) {
			expect(getClaudeAgentRuntimePackModuleNames()).toContain(moduleName);
			expect(getClaudeAgentRuntimePackResourceCopies()).toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
			expect(requiredMaterializedNodeModules).not.toContain(moduleName);
			expect(packagedNodeModuleCopies).not.toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
		}
		for (const moduleName of [
			"@anthropic-ai/claude-agent-sdk",
			"@anthropic-ai/claude-agent-sdk-*",
			"@anthropic-ai/sdk",
			"@browserbasehq",
			"@modelcontextprotocol/sdk",
			"chromium-bidi",
			"patchright-core",
			"playwright",
			"playwright-core",
			"webdriver",
			"webdriverio",
		]) {
			expect(packOnlyNodeModuleFileExcludes).toContain(
				`!node_modules/${moduleName}`,
			);
			expect(packOnlyNodeModuleFileExcludes).toContain(
				`!node_modules/${moduleName}/**/*`,
			);
		}
		expect(packagedAsarUnpackGlobs).not.toContain(
			"**/node_modules/@anthropic-ai/claude-agent-sdk/**/*",
		);
		expect(packagedAsarUnpackGlobs).not.toContain(
			"**/node_modules/@anthropic-ai/claude-agent-sdk-*/*",
		);
	});

	test("can build a Claude Agent runtime pack for the target platform", () => {
		expect(
			getClaudeAgentSdkPlatformPackageName({
				targetPlatform: "darwin",
				targetArch: "arm64",
			}),
		).toBe("@anthropic-ai/claude-agent-sdk-darwin-arm64");
		expect(
			getClaudeAgentSdkPlatformPackageName({
				targetPlatform: "linux",
				targetArch: "x64",
			}),
		).toBe("@anthropic-ai/claude-agent-sdk-linux-x64");

		for (const moduleName of [
			"@anthropic-ai/claude-agent-sdk",
			"@anthropic-ai/sdk",
			"@modelcontextprotocol/sdk",
			"json-schema-to-ts",
			"zod",
			getClaudeAgentSdkPlatformPackageName(),
		]) {
			expect(getClaudeAgentRuntimePackModuleNames()).toContain(moduleName);
			expect(getClaudeAgentRuntimePackResourceCopies()).toContainEqual(
				expect.objectContaining({
					from: `node_modules/${moduleName}`,
					to: `node_modules/${moduleName}`,
				}),
			);
		}
	});
});
