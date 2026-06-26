import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

function readSourceFiles(dir: string): Array<{ path: string; source: string }> {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: Array<{ path: string; source: string }> = [];

	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...readSourceFiles(path));
			continue;
		}
		if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) {
			continue;
		}
		if (statSync(path).size > 2 * 1024 * 1024) {
			continue;
		}
		files.push({ path, source: readFileSync(path, "utf8") });
	}

	return files;
}

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

	test("keeps renderer app icons as lightweight vector assets", () => {
		const cursorIconSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"assets",
				"app-icons",
				"cursor.svg",
			),
			"utf8",
		);

		expect(Buffer.byteLength(cursorIconSource)).toBeLessThan(10 * 1024);
		expect(cursorIconSource).not.toContain("base64,");
		expect(cursorIconSource).not.toContain("<image");
		expect(cursorIconSource).toContain("<path");
	});

	test("keeps built-in ringtone audio out of the renderer bundle", () => {
		const ringtoneUrlModulePath = join(
			import.meta.dirname,
			"src",
			"renderer",
			"lib",
			"ringtones",
			"urls.ts",
		);
		const ringtonePlaySource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"lib",
				"ringtones",
				"play.ts",
			),
			"utf8",
		);

		expect(existsSync(ringtoneUrlModulePath)).toBe(false);
		expect(ringtonePlaySource).not.toContain("resources/sounds");
		expect(ringtonePlaySource).not.toContain("new URL(");
		expect(ringtonePlaySource).toContain("ringtone.playNotification");
	});

	test("keeps the xterm WebGL addon dynamically loaded", () => {
		const terminalAddonSources = [
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"lib",
				"terminal",
				"terminal-addons.ts",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"screens",
				"main",
				"components",
				"WorkspaceView",
				"ContentView",
				"TabsContent",
				"Terminal",
				"helpers.ts",
			),
		].map((path) => readFileSync(path, "utf8"));

		for (const source of terminalAddonSources) {
			expect(source).not.toContain(
				'import { WebglAddon } from "@xterm/addon-webgl"',
			);
			expect(source).toContain(
				'import type { WebglAddon } from "@xterm/addon-webgl"',
			);
			expect(source).toContain('await import("@xterm/addon-webgl")');
		}
	});

	test("keeps desktop Mermaid rendering behind code-block lazy imports", () => {
		const lazyMermaidSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MermaidCodeBlock",
				"MermaidCodeBlock.tsx",
			),
			"utf8",
		);
		const desktopCodeBlockSources = [
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MarkdownRenderer",
				"components",
				"CodeBlock",
				"CodeBlock.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"CommentMarkdown",
				"components",
				"CommentCodeBlock",
				"CommentCodeBlock.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"screens",
				"main",
				"components",
				"WorkspaceView",
				"ContentView",
				"TabsContent",
				"TabView",
				"CommentPane",
				"CommentPane.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MarkdownRenderer",
				"components",
				"TipTapMarkdownRenderer",
				"components",
				"EditableCodeBlockView",
				"EditableCodeBlockView.tsx",
			),
		].map((path) => readFileSync(path, "utf8"));

		expect(lazyMermaidSource).toContain('from "@streamdown/mermaid"');
		expect(lazyMermaidSource).not.toContain('from "streamdown"');
		expect(lazyMermaidSource).toContain(".getMermaid(config)");
		for (const source of desktopCodeBlockSources) {
			expect(source).not.toContain('from "@streamdown/mermaid"');
			expect(source).not.toContain('from "streamdown"');
			expect(source).toContain(
				'import("renderer/components/MermaidCodeBlock")',
			);
		}
	});

	test("keeps Shiki highlighting off the shared code-block module startup path", () => {
		const codeBlockSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"ui",
				"src",
				"components",
				"ai-elements",
				"code-block.tsx",
			),
			"utf8",
		);

		expect(codeBlockSource).not.toContain(" codeToHast,");
		expect(codeBlockSource).not.toContain("import { codeToHast");
		expect(codeBlockSource).not.toContain(
			"import { type BundledLanguage, codeToHast",
		);
		expect(codeBlockSource).not.toContain('import("shiki")');
		expect(codeBlockSource).not.toContain('from "shiki"');
		expect(codeBlockSource).toContain('from "shiki/core"');
		expect(codeBlockSource).toContain('from "shiki/engine/javascript"');
		expect(codeBlockSource).toContain('import("shiki/langs/typescript.mjs")');
		expect(codeBlockSource).toContain('import("shiki/themes/one-light.mjs")');
		expect(codeBlockSource).not.toContain("shikiModulePromise");
		expect(codeBlockSource).not.toContain("bundle-full");
		expect(codeBlockSource).not.toContain("emacs-lisp");
		expect(codeBlockSource).not.toContain("swift");
		expect(codeBlockSource).not.toContain("wasm");
		expect(codeBlockSource).toContain(
			"const { codeToHast } = createSingletonShorthands",
		);
	});

	test("keeps TipTap Markdown highlighting on a scoped lowlight grammar set", () => {
		const markdownLowlightSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"lib",
				"tiptap",
				"createMarkdownLowlight.ts",
			),
			"utf8",
		);
		const tiptapMarkdownSources = [
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MarkdownEditor",
				"MarkdownEditor.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MarkdownRenderer",
				"components",
				"TipTapMarkdownRenderer",
				"createMarkdownExtensions.ts",
			),
		].map((path) => readFileSync(path, "utf8"));

		expect(markdownLowlightSource).not.toContain('from "lowlight/lib/common"');
		expect(markdownLowlightSource).not.toContain(
			'import { common, createLowlight } from "lowlight"',
		);
		expect(markdownLowlightSource).toContain(
			'from "highlight.js/lib/languages/typescript"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/swift"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/wasm"',
		);
		for (const source of tiptapMarkdownSources) {
			expect(source).not.toContain("import { common, createLowlight }");
			expect(source).toContain("createMarkdownLowlight()");
		}
	});

	test("keeps renderer Sentry behind a narrow lazy client module", () => {
		const sentrySource = readFileSync(
			join(import.meta.dirname, "src", "renderer", "lib", "sentry.ts"),
			"utf8",
		);
		const sentryClientSource = readFileSync(
			join(import.meta.dirname, "src", "renderer", "lib", "sentry-client.ts"),
			"utf8",
		);
		const errorRouteSource = readFileSync(
			join(import.meta.dirname, "src", "renderer", "routes", "error.tsx"),
			"utf8",
		);

		expect(sentrySource).not.toContain('@sentry/electron/renderer"');
		expect(sentrySource).toContain('import("./sentry-client")');
		expect(sentryClientSource).toContain("captureException,");
		expect(sentryClientSource).toContain("\tinit,");
		expect(sentryClientSource).not.toContain(
			'import * as Sentry from "@sentry/electron/renderer"',
		);
		expect(errorRouteSource).not.toContain(
			'import("@sentry/electron/renderer")',
		);
		expect(errorRouteSource).toContain("captureRendererException");
	});

	test("keeps react-syntax-highlighter out of the desktop renderer bundle", () => {
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const offenders = rendererSources
			.filter(({ source }) => source.includes("react-syntax-highlighter"))
			.map(({ path }) => path);

		expect(offenders).toEqual([]);
	});

	test("keeps the Pierre diff worker pool and highlighter lightweight", () => {
		const authenticatedLayoutSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"layout.tsx",
			),
			"utf8",
		);

		expect(authenticatedLayoutSource).toContain("poolSize: 2");
		expect(authenticatedLayoutSource).toContain(
			'preferredHighlighter: "shiki-js"',
		);
		expect(authenticatedLayoutSource).not.toContain("poolSize: 8");
		expect(authenticatedLayoutSource).not.toContain(
			'preferredHighlighter: "shiki-wasm"',
		);
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
		expect(buildWorkflow).toContain(
			"if: inputs.macos_artifact_mode != 'zip_only' || matrix.arch != 'arm64'",
		);
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
		expect(buildWorkflow).toContain('DESKTOP_BUILD_STATS: "true"');
		expect(buildWorkflow).toContain(
			"DESKTOP_BUILD_STATS_DIR: performance-reports/build-stats",
		);
		expect(buildWorkflow).toContain("Upload compile bundle stats");
		expect(buildWorkflow).toContain(
			"$" +
				"{{ inputs.artifact_prefix }}-mac-" +
				"$" +
				"{{ matrix.arch }}-compile-bundle-stats",
		);
		expect(buildWorkflow).toContain(
			"$" + "{{ inputs.artifact_prefix }}-linux-compile-bundle-stats",
		);
		expect(buildWorkflow).toContain(
			"path: apps/desktop/performance-reports/build-stats/**",
		);
		expect(buildWorkflow).toContain(
			"Skipping runtime pack build for artifact-only validation.",
		);
		expect(buildWorkflow).toContain(
			"cp src/resources/pack-system/pack-manifest-index.json dist/resources/pack-system/pack-manifest-index.json",
		);
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

	test("keeps workspace AI naming helpers off the desktop router startup path", () => {
		const createProcedure = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"lib",
				"trpc",
				"routers",
				"workspaces",
				"procedures",
				"create.ts",
			),
			"utf8",
		);
		const generateBranchNameProcedure = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"lib",
				"trpc",
				"routers",
				"workspaces",
				"procedures",
				"generate-branch-name.ts",
			),
			"utf8",
		);
		const workspaceInit = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"lib",
				"trpc",
				"routers",
				"workspaces",
				"utils",
				"workspace-init.ts",
			),
			"utf8",
		);

		for (const source of [
			createProcedure,
			generateBranchNameProcedure,
			workspaceInit,
		]) {
			expect(source).not.toMatch(
				/import\s+\{[^}]*attemptWorkspaceAutoRenameFromPrompt[^}]*\}\s+from\s+["'][^"']*ai-name["']/s,
			);
			expect(source).not.toMatch(
				/import\s+\{[^}]*generateBranchNameFromPrompt[^}]*\}\s+from\s+["'][^"']*ai-branch-name["']/s,
			);
		}

		expect(createProcedure).toMatch(
			/import\(\s*["']\.\.\/utils\/ai-name["']\s*\)/,
		);
		expect(generateBranchNameProcedure).toMatch(
			/import\(\s*["']\.\.\/utils\/ai-branch-name["']\s*\)/,
		);
		expect(workspaceInit).toMatch(/import\(\s*["']\.\/ai-name["']\s*\)/);
	});

	test("keeps desktop AI naming modules lazy-loadable without top-level chat imports", () => {
		const aiName = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"lib",
				"trpc",
				"routers",
				"workspaces",
				"utils",
				"ai-name.ts",
			),
			"utf8",
		);
		const aiBranchName = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"lib",
				"trpc",
				"routers",
				"workspaces",
				"utils",
				"ai-branch-name.ts",
			),
			"utf8",
		);
		const titleGeneration = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"chat",
				"src",
				"server",
				"desktop",
				"title-generation",
				"title-generation.ts",
			),
			"utf8",
		);

		for (const source of [aiName, aiBranchName]) {
			expect(source).not.toMatch(
				/import\s+\{[^}]*getSmallModel[^}]*\}\s+from\s+["']@superset\/chat\/server\/shared["']/s,
			);
			expect(source).not.toMatch(
				/import\s+\{[^}]*generateTitleFromMessage[^}]*\}\s+from\s+["']@superset\/chat\/server\/desktop\/title-generation["']/s,
			);
			expect(source).toContain('import("@superset/chat/server/shared")');
			expect(source).toContain(
				'import("@superset/chat/server/desktop/title-generation")',
			);
		}

		expect(titleGeneration).not.toContain("@mastra/core/agent");
		expect(titleGeneration).toContain('import("ai")');
	});
});
