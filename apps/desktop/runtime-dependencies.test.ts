import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import hostServicePackageJson from "../../packages/host-service/package.json";
import uiPackageJson from "../../packages/ui/package.json";
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
	getLibsqlPlatformPackageNames,
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
		expect(trellisRuntimePackModuleNames).toContain("figlet");
		expect(trellisRuntimePackResourceCopies).toContainEqual(
			expect.objectContaining({
				from: "node_modules/figlet",
				to: "node_modules/figlet",
			}),
		);
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
		const electronBuilderSource = readFileSync(
			join(import.meta.dirname, "electron-builder.ts"),
			"utf8",
		);
		const dockIconSource = readFileSync(
			join(import.meta.dirname, "src", "main", "lib", "dock-icon.ts"),
			"utf8",
		);
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
		expect(electronBuilderSource).toContain('"!dist/resources/sounds/**/*"');
		expect(electronBuilderSource).toContain('"!build/icons/*.png"');
		expect(dockIconSource).toContain(
			'join(process.resourcesPath, "icon.icns")',
		);
		expect(dockIconSource).not.toContain('app.asar/resources/build/icons"');
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
			expect(source).not.toContain('from "@xterm/addon-image"');
			expect(source).not.toContain('from "@xterm/addon-ligatures"');
		}
	});

	test("keeps Mermaid rendering runtime out of the base desktop renderer", () => {
		const mermaidCodeBlockSource = readFileSync(
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
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const sharedMessageSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"ui",
				"src",
				"components",
				"ai-elements",
				"message.tsx",
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

		expect(mermaidCodeBlockSource).not.toContain("@streamdown/mermaid");
		expect(mermaidCodeBlockSource).not.toContain('from "mermaid"');
		expect(mermaidCodeBlockSource).toContain("{source}");
		expect(sharedMessageSource).not.toContain("@streamdown/mermaid");
		expect(sharedMessageSource).not.toContain("streamdownPlugins");
		expect(
			rendererSources
				.filter(({ source }) => source.includes("@streamdown/mermaid"))
				.map(({ path }) => path),
		).toEqual([]);
		for (const source of desktopCodeBlockSources) {
			expect(source).not.toContain('from "@streamdown/mermaid"');
			expect(source).not.toContain('from "streamdown"');
			expect(source).toContain(
				'import("renderer/components/MermaidCodeBlock")',
			);
		}
	});

	test("keeps streamdown off the lightweight shared message entry", () => {
		const sharedMessageSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"ui",
				"src",
				"components",
				"ai-elements",
				"message.tsx",
			),
			"utf8",
		);
		const sharedMessageResponseSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"ui",
				"src",
				"components",
				"ai-elements",
				"message-response.tsx",
			),
			"utf8",
		);

		expect(sharedMessageSource).not.toContain('from "streamdown"');
		expect(sharedMessageSource).not.toContain("MessageResponse");
		expect(sharedMessageSource).not.toContain("TOOL_CALL_MD_CLASSNAME");
		expect(sharedMessageResponseSource).toContain('from "streamdown"');
		expect(sharedMessageResponseSource).toContain("MessageResponse");
	});

	test("keeps removed renderer runtimes out of the base install graph", () => {
		const desktopInstallGraph = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};
		const uiInstallGraph = {
			...uiPackageJson.dependencies,
			...uiPackageJson.devDependencies,
		};

		expect(desktopInstallGraph).not.toHaveProperty("@streamdown/mermaid");
		expect(desktopInstallGraph).not.toHaveProperty("@ai-sdk/react");
		expect(desktopInstallGraph).not.toHaveProperty("@durable-streams/client");
		expect(desktopInstallGraph).not.toHaveProperty("@vercel/blob");
		expect(desktopInstallGraph).not.toHaveProperty("react-syntax-highlighter");
		expect(desktopInstallGraph).not.toHaveProperty(
			"@types/react-syntax-highlighter",
		);
		expect(desktopInstallGraph).not.toHaveProperty("react-icons");
		expect(desktopInstallGraph).not.toHaveProperty("@tiptap/extension-emoji");
		expect(desktopInstallGraph).not.toHaveProperty("@tiptap/starter-kit");
		expect(desktopInstallGraph).not.toHaveProperty(
			"@tiptap/extension-table-cell",
		);
		expect(desktopInstallGraph).not.toHaveProperty(
			"@tiptap/extension-table-header",
		);
		expect(desktopInstallGraph).not.toHaveProperty(
			"@tiptap/extension-table-row",
		);
		expect(desktopInstallGraph).not.toHaveProperty(
			"@codemirror/theme-one-dark",
		);
		expect(desktopInstallGraph).not.toHaveProperty("@xterm/addon-image");
		expect(desktopInstallGraph).not.toHaveProperty("@xterm/addon-ligatures");
		expect(uiInstallGraph).not.toHaveProperty("@streamdown/mermaid");
		expect(uiInstallGraph).not.toHaveProperty("react-icons");
	});

	test("keeps runtime-pack seed packages out of desktop production dependencies", () => {
		const packOnlyDesktopDependencies = [
			"@anthropic-ai/claude-agent-sdk",
			"@anthropic-ai/sdk",
			"@ast-grep/napi",
			"@mastra/core",
			"@modelcontextprotocol/sdk",
			"mastracode",
		];

		for (const dependencyName of packOnlyDesktopDependencies) {
			expect(packageJson.dependencies).not.toHaveProperty(dependencyName);
			expect(packageJson.devDependencies).toHaveProperty(dependencyName);
		}
	});

	test("keeps heavyweight low-use react-icons families out of renderer source", () => {
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const offenders = rendererSources
			.filter(
				({ source }) =>
					source.includes('"react-icons/pi"') ||
					source.includes('"react-icons/si"') ||
					source.includes('"react-icons/ri"') ||
					source.includes('"react-icons/bs"') ||
					source.includes('"react-icons/cg"') ||
					source.includes('"react-icons/ci"') ||
					source.includes('"react-icons/fa"') ||
					source.includes('"react-icons/fa6"') ||
					source.includes('"react-icons/fi"') ||
					source.includes('"react-icons/fc"') ||
					source.includes('"react-icons/go"') ||
					source.includes('"react-icons/hi2"') ||
					source.includes('"react-icons/io5"') ||
					source.includes('"react-icons/lu"') ||
					source.includes('"react-icons/rx"') ||
					source.includes('"react-icons/tb"') ||
					source.includes('"react-icons/vsc"') ||
					source.includes("'react-icons/pi'") ||
					source.includes("'react-icons/si'") ||
					source.includes("'react-icons/ri'") ||
					source.includes("'react-icons/bs'") ||
					source.includes("'react-icons/cg'") ||
					source.includes("'react-icons/ci'") ||
					source.includes("'react-icons/fa'") ||
					source.includes("'react-icons/fa6'") ||
					source.includes("'react-icons/fi'") ||
					source.includes("'react-icons/fc'") ||
					source.includes("'react-icons/go'") ||
					source.includes("'react-icons/hi2'") ||
					source.includes("'react-icons/io5'") ||
					source.includes("'react-icons/lu'") ||
					source.includes("'react-icons/rx'") ||
					source.includes("'react-icons/tb'") ||
					source.includes("'react-icons/vsc'"),
			)
			.map(({ path }) => path);

		expect(offenders).toEqual([]);
	});

	test("keeps ai runtime helpers out of renderer source", () => {
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const nonTypeAiImportPattern =
			/(^|\n)\s*import\s+(?!type\b)[^;]*\s+from\s+["']ai["'];/;
		const offenders = rendererSources
			.filter(
				({ source }) =>
					nonTypeAiImportPattern.test(source) ||
					source.includes('import("ai")') ||
					source.includes("import('ai')"),
			)
			.map(({ path }) => path);

		expect(offenders).toEqual([]);
	});

	test("cleans stale Vite optimizer cache when dev dependency inputs change", () => {
		expect(packageJson.scripts["clean:dev"]).toContain(
			"scripts/clean-stale-vite-cache.ts",
		);
	});

	test("keeps desktop dev optimizer sourcemaps disabled", () => {
		const viteConfigSource = readFileSync(
			join(import.meta.dirname, "electron.vite.config.ts"),
			"utf8",
		);

		expect(viteConfigSource).toContain("optimizeDeps");
		expect(viteConfigSource).toContain("esbuildOptions");
		expect(viteConfigSource).toContain("sourcemap: false");
	});

	test("lets CI precompile macOS renderer bundles from a non-macOS host", () => {
		const viteConfigSource = readFileSync(
			join(import.meta.dirname, "electron.vite.config.ts"),
			"utf8",
		);

		expect(viteConfigSource).toContain(
			"const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform",
		);
		expect(viteConfigSource).toContain(
			'"process.platform": defineEnv(targetPlatform)',
		);
		expect(viteConfigSource).toContain("platform: targetPlatform");
	});

	test("keeps lazy-only renderer dependencies out of the dev optimizer startup pass", () => {
		const viteConfigSource = readFileSync(
			join(import.meta.dirname, "electron.vite.config.ts"),
			"utf8",
		);

		expect(viteConfigSource).toContain("exclude:");
		expect(viteConfigSource).toContain('"@sentry/electron/renderer"');
		expect(viteConfigSource).toContain('"@xterm/xterm"');
		expect(viteConfigSource).toContain('"@xterm/addon-webgl"');
		expect(viteConfigSource).toContain('"@codemirror/view"');
		expect(viteConfigSource).toContain('"lucide-react"');
		expect(viteConfigSource).toContain('"react-day-picker"');
		expect(viteConfigSource).not.toContain('"lowlight"');
		expect(viteConfigSource).not.toContain('"tiptap-markdown"');
	});

	test("keeps packaged launches isolated from inherited development env", () => {
		const windowLoaderSource = readFileSync(
			join(import.meta.dirname, "src", "lib", "window-loader.ts"),
			"utf8",
		);
		const mainSource = readFileSync(
			join(import.meta.dirname, "src", "main", "index.ts"),
			"utf8",
		);

		expect(windowLoaderSource).toContain(
			'!app.isPackaged && env.NODE_ENV === "development"',
		);
		expect(windowLoaderSource).toContain("props.browserWindow.loadFile");
		expect(mainSource).toContain(
			'const IS_DEV = !app.isPackaged && process.env.NODE_ENV === "development"',
		);
		expect(mainSource).toContain("if (IS_DEV)");
		expect(mainSource).not.toContain(
			'if (process.env.NODE_ENV === "development")',
		);
	});

	test("keeps color parsing helpers off the renderer theme-store startup path", () => {
		const themeStoreSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"stores",
				"theme",
				"store.ts",
			),
			"utf8",
		);

		expect(themeStoreSource).not.toContain('from "shared/themes"');
		expect(themeStoreSource).toContain('from "shared/themes/built-in"');
		expect(themeStoreSource).toContain('from "shared/themes/types"');
	});

	test("keeps renderer env validation off the Zod startup path", () => {
		const rendererEnvSource = readFileSync(
			join(import.meta.dirname, "src", "renderer", "env.renderer.ts"),
			"utf8",
		);

		expect(rendererEnvSource).not.toContain('from "zod"');
		expect(rendererEnvSource).not.toContain('from "zod/v4"');
		expect(rendererEnvSource).not.toContain("z.object");
		expect(rendererEnvSource).toContain("function createRendererEnv");
		expect(rendererEnvSource).toContain("function assertValidUrl");
	});

	test("keeps authenticated local collections off the Zod startup path", () => {
		const collectionsProviderSources = readSourceFiles(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"providers",
				"CollectionsProvider",
			),
		);

		for (const { path, source } of collectionsProviderSources) {
			expect(source, path).not.toContain('from "zod"');
			expect(source, path).not.toContain('from "zod/v4"');
			expect(source, path).not.toContain("z.object");
		}
	});

	test("keeps remote-agent command tools off the authenticated shell startup path", () => {
		const commandWatcherSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"components",
				"AgentHooks",
				"hooks",
				"useCommandWatcher",
				"useCommandWatcher.ts",
			),
			"utf8",
		);

		expect(commandWatcherSource).toContain('await import("./tools")');
		expect(commandWatcherSource).toContain("enabled: shouldWatch");
		expect(commandWatcherSource).not.toContain(
			'import { executeTool, type ToolContext } from "./tools"',
		);
		expect(commandWatcherSource).not.toContain('from "zod"');
		expect(commandWatcherSource).not.toContain("z.object");
	});

	test("keeps route-tree-eager organization forms off the Zod startup path", () => {
		const routeTreeEagerSources = [
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"create-organization",
				"page.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"settings",
				"organization",
				"components",
				"OrganizationSettings",
				"components",
				"SlugDialog",
				"SlugDialog.tsx",
			),
		];

		for (const path of routeTreeEagerSources) {
			const source = readFileSync(path, "utf8");
			expect(source, path).not.toContain("@hookform/resolvers/zod");
			expect(source, path).not.toContain('from "zod"');
			expect(source, path).not.toContain("z.object");
		}
	});

	test("keeps workspace tabs store off the authenticated shell startup path", () => {
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
		const agentHookListenerSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"stores",
				"tabs",
				"useAgentHookListener.ts",
			),
			"utf8",
		);

		expect(authenticatedLayoutSource).not.toContain(
			'import { useTabsStore } from "renderer/stores/tabs/store"',
		);
		expect(authenticatedLayoutSource).not.toContain(
			'import { setPaneWorkspaceRunState } from "renderer/stores/tabs/workspace-run"',
		);
		expect(authenticatedLayoutSource).toContain(
			'"renderer/stores/tabs/workspace-run"',
		);
		expect(agentHookListenerSource).not.toContain(
			'import { useTabsStore } from "./store"',
		);
		expect(agentHookListenerSource).toContain('import("./store")');
		expect(agentHookListenerSource).toContain(
			'import("./utils/resolve-notification-target")',
		);
	});

	test("keeps pane runtime cleanup off the dashboard sidebar state startup path", () => {
		const sidebarStateSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"hooks",
				"useDashboardSidebarState",
				"useDashboardSidebarState.ts",
			),
			"utf8",
		);
		const sidebarCoreStateSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"hooks",
				"useDashboardSidebarCoreState",
				"useDashboardSidebarCoreState.ts",
			),
			"utf8",
		);

		expect(sidebarStateSource).not.toContain(
			"import { terminalRuntimeRegistry }",
		);
		expect(sidebarStateSource).not.toContain(
			"import { browserRuntimeRegistry }",
		);
		expect(sidebarStateSource).not.toContain(
			'from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry"',
		);
		expect(sidebarStateSource).toContain(
			'import("renderer/lib/terminal/terminal-runtime-registry")',
		);
		expect(sidebarStateSource).toContain(
			"components/BrowserPane/browserRuntimeRegistry",
		);
		expect(sidebarStateSource).toContain("scheduleWorkspacePaneRuntimeCleanup");
		expect(sidebarCoreStateSource).not.toContain(
			"import { terminalRuntimeRegistry }",
		);
		expect(sidebarCoreStateSource).not.toContain(
			"import { browserRuntimeRegistry }",
		);
		expect(sidebarCoreStateSource).not.toContain("terminal-runtime-registry");
		expect(sidebarCoreStateSource).toContain(
			'import("./sidebarPaneRuntimeCleanup")',
		);
	});

	test("keeps global browser lifecycle off non-workspace authenticated routes", () => {
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

		expect(authenticatedLayoutSource).not.toContain(
			"import { GlobalBrowserLifecycle }",
		);
		expect(authenticatedLayoutSource).toContain(
			'import("./components/GlobalBrowserLifecycle")',
		);
		expect(authenticatedLayoutSource).toContain(
			"routeUsesGlobalBrowserLifecycle",
		);
		expect(authenticatedLayoutSource).toContain(
			'pathname.startsWith("/v2-workspace")',
		);
	});

	test("keeps v2 notification subscriptions off closed-sidebar non-workspace routes", () => {
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

		expect(authenticatedLayoutSource).not.toContain(
			"import { V2NotificationController }",
		);
		expect(authenticatedLayoutSource).toContain(
			'import("./components/V2NotificationController")',
		);
		expect(authenticatedLayoutSource).toContain("routeUsesV2Notifications");
		expect(authenticatedLayoutSource).toContain(
			'pathname.startsWith("/v2-workspace") || isWorkspaceSidebarOpen',
		);
	});

	test("keeps loaded default dashboard routes off workspace pane runtimes", () => {
		const defaultRouteSources = [
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspaces",
				"page.tsx",
			),
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"tasks",
				"page.tsx",
			),
		].map((path) => ({ path, source: readFileSync(path, "utf8") }));
		const workspaceRouteShellSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspace",
				"$workspaceId",
				"page.tsx",
			),
			"utf8",
		);

		for (const { path, source } of defaultRouteSources) {
			expect(source, path).not.toContain("WorkspaceSidebar");
			expect(source, path).not.toContain("usePaneRegistry");
			expect(source, path).not.toContain("terminalRuntimeRegistry");
			expect(source, path).not.toContain("browserRuntimeRegistry");
			expect(source, path).not.toContain("/v2-workspace/$workspaceId");
		}
		expect(workspaceRouteShellSource).not.toContain(
			"import { V2WorkspacePageContent }",
		);
		expect(workspaceRouteShellSource).toContain(
			'import("./V2WorkspacePageContent")',
		);
	});

	test("keeps CodeMirror editor runtime out of file view metadata resolution", () => {
		const codeViewSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspace",
				"$workspaceId",
				"hooks",
				"usePaneRegistry",
				"components",
				"FilePane",
				"registry",
				"views",
				"CodeView",
				"CodeView.tsx",
			),
			"utf8",
		);

		expect(codeViewSource).not.toContain('from "./components/CodeEditor"');
		expect(codeViewSource).not.toContain("@codemirror/");
		expect(codeViewSource).toContain('import("./components/CodeEditor")');
	});

	test("keeps xterm runtime out of v2 workspace pane registry metadata", () => {
		const paneRegistrySource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspace",
				"$workspaceId",
				"hooks",
				"usePaneRegistry",
				"usePaneRegistry.tsx",
			),
			"utf8",
		);
		const workspacePageSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspace",
				"$workspaceId",
				"V2WorkspacePageContent.tsx",
			),
			"utf8",
		);
		const lazyRegistrySource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"lib",
				"terminal",
				"terminal-runtime-registry-lazy.ts",
			),
			"utf8",
		);

		expect(paneRegistrySource).not.toContain(
			'from "renderer/lib/terminal/terminal-runtime-registry"',
		);
		expect(workspacePageSource).not.toContain(
			'from "renderer/lib/terminal/terminal-runtime-registry"',
		);
		expect(paneRegistrySource).toContain(
			'from "renderer/lib/terminal/terminal-runtime-registry-lazy"',
		);
		expect(workspacePageSource).toContain(
			'from "renderer/lib/terminal/terminal-runtime-registry-lazy"',
		);
		expect(lazyRegistrySource).toContain(
			'import("./terminal-runtime-registry")',
		);
		expect(lazyRegistrySource).not.toContain("@xterm/");
	});

	test("keeps resource monitor panel data hooks behind the popover lazy chunk", () => {
		const resourceTriggerSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"TopBar",
				"components",
				"ResourceConsumption",
				"ResourceConsumption.tsx",
			),
			"utf8",
		);
		const resourceContentSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"TopBar",
				"components",
				"ResourceConsumption",
				"ResourceConsumptionContent.tsx",
			),
			"utf8",
		);

		expect(resourceTriggerSource).toContain(
			'import("./ResourceConsumptionContent")',
		);
		expect(resourceTriggerSource).not.toContain("useLiveQuery");
		expect(resourceTriggerSource).not.toContain("useTabsStore");
		expect(resourceTriggerSource).not.toContain("resourceMetrics.getSnapshot");
		expect(resourceContentSource).toContain("useLiveQuery");
		expect(resourceContentSource).toContain("useTabsStore");
		expect(resourceContentSource).toContain("resourceMetrics.getSnapshot");
	});

	test("keeps workspace-only top bar controls off non-workspace dashboard routes", () => {
		const topBarSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"TopBar",
				"TopBar.tsx",
			),
			"utf8",
		);

		for (const moduleName of [
			"OpenInMenuButton",
			"RightSidebarToggle",
			"V2WorkspaceOpenInButton",
			"V2WorkspaceTitle",
		]) {
			expect(topBarSource).not.toContain(
				`import { ${moduleName} } from "./components/${moduleName}"`,
			);
			expect(topBarSource).toContain(`import("./components/${moduleName}")`);
		}
	});

	test("keeps React DnD off authenticated routes that do not need drag/drop", () => {
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
		const reactDndBoundarySource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"components",
				"ReactDndBoundary",
				"ReactDndBoundary.tsx",
			),
			"utf8",
		);

		expect(authenticatedLayoutSource).not.toContain('from "react-dnd"');
		expect(authenticatedLayoutSource).not.toContain('from "renderer/lib/dnd"');
		expect(authenticatedLayoutSource).toContain("routeUsesReactDnd");
		expect(authenticatedLayoutSource).toContain(
			'import("./components/ReactDndBoundary")',
		);
		expect(reactDndBoundarySource).toContain('from "react-dnd"');
		expect(reactDndBoundarySource).toContain('from "renderer/lib/dnd"');
	});

	test("keeps daemon auto-update recovery UI off the authenticated startup path", () => {
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

		expect(authenticatedLayoutSource).not.toContain(
			"import { DaemonAutoUpdateFailureDialog }",
		);
		expect(authenticatedLayoutSource).toContain(
			'import("./components/DaemonAutoUpdateFailureDialog")',
		);
		expect(authenticatedLayoutSource).toContain(
			"DeferredDaemonAutoUpdateFailureDialog",
		);
		expect(authenticatedLayoutSource).toContain("15_000");
	});

	test("keeps dashboard sidebar dnd-kit out of non-workspace route startup", () => {
		const dashboardSidebarSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"DashboardSidebar",
				"DashboardSidebar.tsx",
			),
			"utf8",
		);
		const staticExpandedSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"DashboardSidebar",
				"components",
				"DashboardSidebarProjectSection",
				"components",
				"DashboardSidebarStaticExpandedProjectContent",
				"DashboardSidebarStaticExpandedProjectContent.tsx",
			),
			"utf8",
		);
		const dndListSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"DashboardSidebar",
				"components",
				"DashboardSidebarProjectsDndList",
				"DashboardSidebarProjectsDndList.tsx",
			),
			"utf8",
		);

		expect(dashboardSidebarSource).not.toContain('from "@dnd-kit/');
		expect(dashboardSidebarSource).toContain(
			'import("./components/DashboardSidebarProjectsDndList")',
		);
		expect(dashboardSidebarSource).toContain("shouldEnableDashboardSidebarDnd");
		expect(staticExpandedSource).not.toContain('from "@dnd-kit/');
		expect(dndListSource).toContain('from "@dnd-kit/core"');
		expect(dndListSource).toContain('from "@dnd-kit/sortable"');
	});

	test("keeps low-frequency dashboard sidebar branches lazy", () => {
		const dashboardLayoutSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"layout.tsx",
			),
			"utf8",
		);
		const dashboardSidebarSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"components",
				"DashboardSidebar",
				"DashboardSidebar.tsx",
			),
			"utf8",
		);

		expect(dashboardLayoutSource).not.toContain("import { DashboardSidebar }");
		expect(dashboardLayoutSource).toContain(
			'import("./components/DashboardSidebar")',
		);
		expect(dashboardLayoutSource).not.toContain(
			"import { DashboardSidebarDeleteDialog }",
		);
		expect(dashboardLayoutSource).toContain(
			"components/DashboardSidebarDeleteDialog",
		);
		expect(dashboardLayoutSource).not.toContain("useDashboardSidebarCoreState");
		expect(dashboardLayoutSource).not.toContain(
			"import { useDevSeedV2Sidebar }",
		);
		expect(dashboardLayoutSource).toContain(
			"useDashboardSidebarWorkspaceRemoval",
		);
		expect(dashboardLayoutSource).toContain(
			"hooks/useDevSeedV2Sidebar/DevSeedV2Sidebar",
		);
		expect(dashboardSidebarSource).not.toContain(
			"import { DashboardChatSidebar }",
		);
		expect(dashboardSidebarSource).not.toContain(
			"import { DashboardWorkSidebar }",
		);
		expect(dashboardSidebarSource).not.toContain(
			"import { DashboardSidebarPortsList }",
		);
		expect(dashboardSidebarSource).not.toContain(
			"import { V2SetupScriptCard }",
		);
		expect(dashboardSidebarSource).toContain(
			'import("./components/DashboardChatSidebar")',
		);
		expect(dashboardSidebarSource).toContain(
			'import("./components/DashboardWorkSidebar")',
		);
		expect(dashboardSidebarSource).toContain(
			'import("./components/DashboardSidebarPortsList")',
		);
		expect(dashboardSidebarSource).toContain(
			'import("./components/V2SetupScriptCard")',
		);
	});

	test("keeps low-use dashboard route pages behind lazy route shells", () => {
		const lazyRouteShells = [
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"_dashboard",
					"automations",
					"page.tsx",
				),
				contentImport: 'import("./AutomationsPageContent")',
			},
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"_dashboard",
					"chat",
					"page.tsx",
				),
				contentImport: 'import("./ChatHomePageContent")',
			},
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"_dashboard",
					"automations",
					"$automationId",
					"page.tsx",
				),
				contentImport: 'import("./AutomationDetailPageContent")',
			},
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"_dashboard",
					"v2-workspace",
					"$workspaceId",
					"page.tsx",
				),
				contentImport: 'import("./V2WorkspacePageContent")',
			},
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"settings",
					"keyboard",
					"page.tsx",
				),
				contentImport: 'import("./KeyboardShortcutsPageContent")',
			},
			{
				route: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"settings",
					"billing",
					"plans",
					"page.tsx",
				),
				contentImport: 'import("./PlansPageContent")',
			},
		];

		for (const { route, contentImport } of lazyRouteShells) {
			const source = readFileSync(route, "utf8");
			expect(source, route).toContain("lazy(() =>");
			expect(source, route).toContain(contentImport);
			expect(source, route).not.toContain("useLiveQuery");
			expect(source, route).not.toContain("useMutation");
			expect(source, route).not.toContain("useQuery");
			expect(source, route).not.toContain("apiTrpcClient");
			expect(source, route).not.toContain("@superset/ui/");
		}
	});

	test("keeps non-current authenticated layout content behind lazy route shells", () => {
		const lazyLayoutShells = [
			{
				layout: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"settings",
					"layout.tsx",
				),
				contentImport: 'import("./SettingsLayoutContent")',
				forbidden: [
					"electronTrpc",
					"useHotkeys",
					"SettingsSidebar",
					"searchSettings",
				],
			},
			{
				layout: join(
					import.meta.dirname,
					"src",
					"renderer",
					"routes",
					"_authenticated",
					"_dashboard",
					"v2-workspace",
					"layout.tsx",
				),
				contentImport: 'import("./V2WorkspaceLayoutContent")',
				forbidden: [
					"useLiveQuery",
					"useRemoteHostStatus",
					"WorkspaceProvider",
					"useWorkspaceTransactionsStore",
				],
			},
		];

		for (const { layout, contentImport, forbidden } of lazyLayoutShells) {
			const source = readFileSync(layout, "utf8");
			expect(source, layout).toContain("lazy(() =>");
			expect(source, layout).toContain(contentImport);
			for (const forbiddenText of forbidden) {
				expect(source, layout).not.toContain(forbiddenText);
			}
		}
	});

	test("keeps paywall preview UI off the authenticated startup path", () => {
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
		const paywallShellSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"Paywall",
				"Paywall.tsx",
			),
			"utf8",
		);
		const paywallContentSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"Paywall",
				"PaywallContent.tsx",
			),
			"utf8",
		);

		expect(authenticatedLayoutSource).toContain(
			'from "renderer/components/Paywall/Paywall"',
		);
		expect(authenticatedLayoutSource).not.toContain(
			'from "renderer/components/Paywall";',
		);
		expect(paywallShellSource).toContain('import("./PaywallContent")');
		expect(paywallShellSource).not.toContain("FeaturePreview");
		expect(paywallShellSource).not.toContain("FeatureSidebar");
		expect(paywallShellSource).not.toContain("PRO_FEATURES");
		expect(paywallShellSource).not.toContain("@superset/ui/dialog");
		expect(paywallContentSource).toContain("FeaturePreview");
		expect(paywallContentSource).toContain("PRO_FEATURES");
	});

	test("keeps teardown logs dialog UI off the authenticated startup path", () => {
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
		const teardownShellSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"components",
				"TeardownLogsDialog",
				"TeardownLogsDialog.tsx",
			),
			"utf8",
		);
		const teardownContentSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"components",
				"TeardownLogsDialog",
				"TeardownLogsDialogContent.tsx",
			),
			"utf8",
		);

		expect(teardownShellSource).toContain(
			'import("./TeardownLogsDialogContent")',
		);
		expect(teardownShellSource).not.toContain("CodeBlock");
		expect(teardownShellSource).not.toContain("@superset/ui/dialog");
		expect(teardownShellSource).not.toContain("@superset/ui/button");
		expect(teardownShellSource).not.toContain("renderer/lib/toast");
		expect(teardownShellSource).not.toContain("deleteWithToast");
		expect(authenticatedLayoutSource).toContain(
			'from "./components/TeardownLogsDialog/TeardownLogsDialog"',
		);
		expect(authenticatedLayoutSource).not.toContain(
			'from "./components/TeardownLogsDialog";',
		);
		expect(teardownContentSource).toContain("CodeBlock");
		expect(teardownContentSource).toContain("@superset/ui/dialog");
	});

	test("keeps Sonner toast UI off the renderer startup path", () => {
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const staticSonnerImportOffenders = rendererSources
			.filter(
				({ path, source }) =>
					source.includes('from "@superset/ui/sonner"') &&
					!path.endsWith(
						join("components", "ThemedToaster", "ThemedSonnerToaster.tsx"),
					),
			)
			.map(({ path }) => path);
		const themedToasterSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"ThemedToaster",
				"ThemedToaster.tsx",
			),
			"utf8",
		);
		const toastFacadeSource = readFileSync(
			join(import.meta.dirname, "src", "renderer", "lib", "toast.ts"),
			"utf8",
		);

		expect(staticSonnerImportOffenders).toEqual([]);
		expect(themedToasterSource).not.toContain('from "@superset/ui/sonner"');
		expect(themedToasterSource).toContain('import("./ThemedSonnerToaster")');
		expect(toastFacadeSource).toContain('import("@superset/ui/sonner")');
		expect(toastFacadeSource).not.toContain(
			'import { toast } from "@superset/ui/sonner"',
		);
	});

	test("rewrites renderer lucide barrel imports to direct icon modules in dev", () => {
		const viteConfigSource = readFileSync(
			join(import.meta.dirname, "electron.vite.config.ts"),
			"utf8",
		);

		expect(viteConfigSource).toContain("lucideDirectIconImportsPlugin");
		expect(viteConfigSource).toContain("toLucideIconFileName");
		expect(viteConfigSource).toContain("isLucideDirectIconImportTarget");
		expect(viteConfigSource).toContain('id.split("?", 1)');
		expect(viteConfigSource).toContain(
			"lucide-react/dist/esm/icons/$" + "{fileName}.js",
		);
		expect(viteConfigSource).toContain('cleanId.includes("/src/renderer/")');
		expect(viteConfigSource).toContain('cleanId.includes("/packages/ui/src/")');
		expect(viteConfigSource).toContain(
			'cleanId.includes("/packages/panes/src/")',
		);
		expect(viteConfigSource).toContain('cleanId.startsWith("/routes/")');
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
			'from "highlight.js/lib/languages/cpp"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/ruby"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/php"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/go"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/java"',
		);
		expect(markdownLowlightSource).not.toContain(
			'from "highlight.js/lib/languages/rust"',
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

	test("keeps new-workspace modal off the authenticated shell startup path", () => {
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

		expect(authenticatedLayoutSource).not.toContain(
			"import { DashboardNewWorkspaceModal }",
		);
		expect(authenticatedLayoutSource).toContain(
			'import("./components/DashboardNewWorkspaceModal")',
		);
		expect(authenticatedLayoutSource).toContain("isNewWorkspaceModalOpen");
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

	test("keeps the full TipTap emoji dataset out of the desktop renderer", () => {
		const rendererSources = readSourceFiles(
			join(import.meta.dirname, "src", "renderer"),
		);
		const offenders = rendererSources
			.filter(({ source }) => source.includes("@tiptap/extension-emoji"))
			.map(({ path }) => path);
		const emojiSuggestionSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"components",
				"MarkdownEditor",
				"components",
				"EmojiSuggestion",
				"EmojiSuggestion.ts",
			),
			"utf8",
		);

		expect(offenders).toEqual([]);
		expect(emojiSuggestionSource).toContain("COMMON_EMOJIS");
		expect(emojiSuggestionSource).not.toContain("emojis");
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
		const pierreRuntimeProviderSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"lib",
				"pierreWorker",
				"PierreDiffRuntimeProvider.tsx",
			),
			"utf8",
		);
		const diffPaneSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"routes",
				"_authenticated",
				"_dashboard",
				"v2-workspace",
				"$workspaceId",
				"hooks",
				"usePaneRegistry",
				"components",
				"DiffPane",
				"DiffPane.tsx",
			),
			"utf8",
		);
		const lightDiffViewerSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"screens",
				"main",
				"components",
				"WorkspaceView",
				"ChangesContent",
				"components",
				"LightDiffViewer",
				"LightDiffViewer.tsx",
			),
			"utf8",
		);
		const viteConfigSource = readFileSync(
			join(import.meta.dirname, "electron.vite.config.ts"),
			"utf8",
		);
		const limitedLanguagesSource = readFileSync(
			join(
				import.meta.dirname,
				"src",
				"renderer",
				"lib",
				"shikiLimitedManifest",
				"languages.ts",
			),
			"utf8",
		);

		expect(authenticatedLayoutSource).not.toContain("@pierre/diffs");
		expect(authenticatedLayoutSource).not.toContain("createPierreWorker");
		expect(authenticatedLayoutSource).not.toContain(
			"WorkerPoolContextProvider",
		);
		expect(pierreRuntimeProviderSource).toContain("poolSize: 2");
		expect(pierreRuntimeProviderSource).toContain(
			'preferredHighlighter: "shiki-js"',
		);
		expect(pierreRuntimeProviderSource).not.toContain("poolSize: 8");
		expect(pierreRuntimeProviderSource).not.toContain(
			'preferredHighlighter: "shiki-wasm"',
		);
		expect(diffPaneSource).toContain("<PierreDiffRuntimeProvider>");
		expect(lightDiffViewerSource).toContain("<PierreDiffRuntimeProvider>");
		expect(viteConfigSource).toContain("shiki/dist/langs.mjs");
		expect(viteConfigSource).toContain("find: /^shiki$/");
		expect(viteConfigSource).toContain("shikiLimitedManifest/shiki.ts");
		expect(viteConfigSource).toContain("shikiLimitedManifest/languages.ts");
		expect(viteConfigSource).toContain("shiki/dist/themes.mjs");
		expect(viteConfigSource).toContain("find: /^shiki\\/wasm$/");
		expect(limitedLanguagesSource).not.toContain("@shikijs/langs/emacs-lisp");
		expect(limitedLanguagesSource).not.toContain("@shikijs/langs/cpp");
		expect(limitedLanguagesSource).not.toContain("@shikijs/langs/ruby");
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
		expect(packageJson.scripts).toHaveProperty("bundle:cli:bundled");
		expect(packageJson.scripts).toHaveProperty("validate:trellis-runtime");
		expect(packageJson.scripts).toHaveProperty(
			"verify:resource-pack-downloads",
		);
		expect(packageJson.scripts).toHaveProperty(
			"check:resource-pack-release-readiness",
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
		expect(workflow).toContain("Build desktop resource packs");
		expect(workflow).toContain("Verify resource pack runtimes are pack-only");
		expect(workflow).toContain("bun run build:claude-agent-pack");
		expect(workflow).toContain("bun run build:mastracode-pack");
		expect(workflow).toContain("bun run build:cli-pack");
		expect(workflow).toContain("bun run check:resource-pack-release-readiness");
		expect(workflow).toContain("bun run verify:resource-pack-downloads");
		expect(workflow).toContain("--include-loose-files=false");
		expect(workflow).toContain(
			'if [[ "$BUNDLE_CLI" != "true" && "$UPLOAD_RESOURCE_PACK_ARTIFACTS" == "true" ]]',
		);
		expect(workflow).toContain("bun run validate:trellis-runtime");
		expect(workflow).toContain("Cache Electron packaging downloads");
		expect(workflow).toContain("upload_resource_pack_ci_artifacts");
		expect(workflow).toContain(
			"inputs.upload_resource_pack_artifacts && inputs.upload_resource_pack_ci_artifacts",
		);
		const resourcePackSmokeWorkflow = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				".github",
				"workflows",
				"verify-desktop-resource-packs.yml",
			),
			"utf8",
		);
		expect(resourcePackSmokeWorkflow).toContain(
			"name: Verify Desktop Resource Packs",
		);
		expect(resourcePackSmokeWorkflow).toContain("workflow_dispatch:");
		expect(resourcePackSmokeWorkflow).toContain("environment: production");
		expect(resourcePackSmokeWorkflow).toContain(
			"bun run check:resource-pack-release-readiness",
		);
		expect(resourcePackSmokeWorkflow).toContain(
			"bun run upload:resource-packs",
		);
		expect(resourcePackSmokeWorkflow).toContain(
			"bun run verify:resource-pack-downloads",
		);
		expect(resourcePackSmokeWorkflow).not.toContain("gh release create");
		expect(resourcePackSmokeWorkflow).not.toContain("action-gh-release");

		const resourcePackRunbook = readFileSync(
			join(import.meta.dirname, "docs", "RESOURCE_PACK_RELEASE.md"),
			"utf8",
		);
		const releaseGuide = readFileSync(
			join(import.meta.dirname, "RELEASE.md"),
			"utf8",
		);
		expect(resourcePackRunbook).toContain("SUPERSET_RESOURCE_PACK_BASE_URL");
		expect(resourcePackRunbook).toContain("packs/*");
		expect(resourcePackRunbook).toContain(
			"bun run verify:resource-pack-downloads",
		);
		expect(resourcePackRunbook).toContain("--include-loose-files=false");
		expect(resourcePackRunbook).toContain("Verify Desktop Resource Packs");
		expect(releaseGuide).toContain("RESOURCE_PACK_RELEASE.md");
	});

	test("prunes unused figlet fonts from the Trellis runtime pack", () => {
		const packBuilderSource = readFileSync(
			join(import.meta.dirname, "scripts", "build-trellis-runtime-pack.ts"),
			"utf8",
		);

		expect(packBuilderSource).toContain("pruneFigletFonts");
		expect(packBuilderSource).toContain("Rebel.flf");
		expect(packBuilderSource).toContain("Rebel.js");
		expect(packBuilderSource).not.toContain("Big Mono 12.flf");
	});

	test("ships terminal serializer runtime with the CLI host-service dist", () => {
		const buildDistSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"cli",
				"scripts",
				"build-dist.ts",
			),
			"utf8",
		);
		const terminalScreenTrackerSource = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"packages",
				"host-service",
				"src",
				"terminal",
				"terminal-screen-tracker.ts",
			),
			"utf8",
		);

		expect(terminalScreenTrackerSource).toContain(
			'require("@xterm/addon-serialize")',
		);
		expect(buildDistSource).toContain('"@xterm/addon-serialize"');
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
		const electronBuilderConfig = readFileSync(
			join(import.meta.dirname, "electron-builder.ts"),
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
		expect(buildWorkflow).toContain("macos_runner");
		expect(buildWorkflow).toContain("compile-macos-zip-dist");
		expect(buildWorkflow).toContain("Compile - macOS fast dist (arm64)");
		expect(buildWorkflow).toContain("runs-on: ubuntu-latest");
		expect(buildWorkflow).toContain("TARGET_PLATFORM: darwin");
		expect(electronBuilderConfig).toContain('format: "ULFO"');
		expect(buildWorkflow).toContain(
			"$" + "{{ inputs.artifact_prefix }}-mac-arm64-precompiled-dist",
		);
		expect(buildWorkflow).toContain("Download precompiled dist");
		expect(buildWorkflow).toContain("Install desktop dependency graph");
		expect(buildWorkflow).toContain(
			"bun install --frozen --ignore-scripts --minimum-release-age=0 --filter @superset/desktop",
		);
		expect(buildWorkflow).toContain(
			"Installing only the desktop workspace dependency graph for macOS arm64 fast packaging.",
		);
		expect(buildWorkflow).toContain(
			"inputs.macos_artifact_mode != 'full' && matrix.arch == 'arm64'",
		);
		expect(buildWorkflow).toContain('gh run download "$GITHUB_RUN_ID"');
		expect(buildWorkflow).toContain(
			"Waiting for precompiled dist artifact $PRECOMPILED_DIST_ARTIFACT",
		);
		expect(buildWorkflow).toContain("runs-on: $" + "{{ inputs.macos_runner }}");
		expect(buildWorkflow).toContain("zip_only");
		expect(buildWorkflow).toContain("quick_full");
		expect(buildWorkflow).toContain(
			"macOS artifact mode is quick_full; building DMG+ZIP from precompiled dist.",
		);
		expect(buildWorkflow).toContain(
			"Build Electron app ($" +
				"{{ inputs.macos_artifact_mode == 'zip_only' && 'ZIP only' || 'DMG+ZIP' }})",
		);
		expect(buildWorkflow).toContain('PACKAGE_TARGET_ARGS=("--mac" "zip"');
		expect(buildWorkflow).toContain("Ensure file icons");
		expect(buildWorkflow).toContain("bun run ensure:icons");
		expect(buildWorkflow).not.toContain("bun run generate:icons");
		expect(buildWorkflow).toContain(
			"if: $" +
				"{{ inputs.macos_artifact_mode == 'full' || matrix.arch != 'arm64' }}",
		);
		expect(buildWorkflow).toContain(
			'if [[ "$MACOS_ARTIFACT_MODE" != "full" && "$TARGET_ARCH" == "arm64" ]]',
		);
		expect(buildWorkflow).toContain(
			"Skipping target optional dependency install for macOS arm64 fast packaging.",
		);
		expect(buildWorkflow).toContain("if: inputs.macos_artifact_mode == 'full'");
		expect(buildWorkflow).toContain(
			"if: inputs.macos_artifact_mode == 'full' || inputs.upload_resource_pack_artifacts",
		);
		expect(buildWorkflow).toContain(
			"Verify macOS auto-update metadata and CLI delivery",
		);
		expect(buildWorkflow).toContain("Upload auto-update manifest");
		expect(buildWorkflow).not.toContain(
			"Upload auto-update manifest\n        if: inputs.macos_artifact_mode == 'full'",
		);
		expect(buildWorkflow).toContain("upload_resource_pack_artifacts");
		expect(buildWorkflow).toContain("upload_resource_pack_object_storage");
		expect(buildWorkflow).toContain("require_resource_pack_object_storage");
		expect(buildWorkflow).toContain("bundle_cli");
		expect(buildWorkflow).toContain("upload_sourcemaps");
		expect(buildWorkflow).toContain("parallel_compile");
		expect(buildWorkflow).toContain("capture_compile_bundle_stats");
		expect(buildWorkflow).toContain(
			"DESKTOP_COMPILE_PARALLEL: $" + "{{ inputs.parallel_compile }}",
		);
		expect(buildWorkflow).toContain(
			"DESKTOP_BUILD_STATS: $" + "{{ inputs.capture_compile_bundle_stats }}",
		);
		expect(buildWorkflow).toContain(
			"Upload compile bundle stats\n        if: inputs.capture_compile_bundle_stats",
		);
		expect(buildWorkflow).toContain(
			"Report package size after compile\n        if: inputs.macos_artifact_mode == 'full' || inputs.capture_compile_bundle_stats",
		);
		expect(buildWorkflow).toContain(
			"Report package size after compile\n        if: inputs.capture_compile_bundle_stats",
		);
		expect(buildWorkflow).toContain("Check package size budget");
		expect(buildWorkflow).toContain(
			"bun run check:package-budget -- --require-artifacts",
		);
		expect(buildWorkflow).toContain("capture_runtime_performance");
		expect(buildWorkflow).toContain(
			"if: inputs.capture_runtime_performance && matrix.arch == 'arm64'",
		);
		expect(buildWorkflow).toContain(
			"always() && inputs.capture_runtime_performance && matrix.arch == 'arm64'",
		);
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
			"Published desktop builds require SUPERSET_OBJECT_STORAGE_* and SUPERSET_RESOURCE_PACK_BASE_URL secrets",
		);
		expect(buildWorkflow).toContain("SUPERSET_RESOURCE_PACK_BASE_URL");
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
		expect(buildWorkflow).toContain(
			"if: inputs.upload_resource_pack_artifacts && inputs.upload_resource_pack_object_storage",
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
		expect(buildWorkflow).toContain("Restore dependencies cache");
		expect(buildWorkflow).toContain("actions/cache/restore");
		expect(buildWorkflow).toContain("if: inputs.macos_artifact_mode != 'full'");
		expect(buildWorkflow).toContain("if: inputs.macos_artifact_mode == 'full'");
		expect(buildWorkflow).toContain(
			"if: inputs.macos_artifact_mode != 'zip_only'",
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
		expect(canaryWorkflow).toContain(
			"fetch-depth: $" +
				"{{ github.event.inputs.force_build == 'true' && 1 || 0 }}",
		);
		expect(canaryWorkflow).toContain("Quick canary requested: macOS arm64.");
		expect(canaryWorkflow).toContain(
			'if [[ "$PUBLISH_RELEASE" == "false" ]]; then',
		);
		expect(canaryWorkflow).toContain("macos_artifact_mode=quick_full");
		expect(canaryWorkflow).toContain(
			"Published quick canary requested: uploading resource packs and building macOS ZIP+DMG from precompiled dist without runtime telemetry.",
		);
		expect(canaryWorkflow).toContain(
			"upload_resource_pack_artifacts: $" +
				"{{ needs.check-changes.outputs.upload_resource_pack_artifacts == 'true' }}",
		);
		expect(canaryWorkflow).toContain(
			"upload_resource_pack_object_storage: $" +
				"{{ needs.check-changes.outputs.build_scope != 'quick' && needs.check-changes.outputs.upload_resource_pack_artifacts == 'true' }}",
		);
		expect(buildWorkflow).toContain(
			"inputs.macos_artifact_mode == 'full' || matrix.arch != 'arm64' || inputs.upload_resource_pack_artifacts",
		);
		expect(canaryWorkflow).toContain("macos_artifact_mode=zip_only");
		expect(canaryWorkflow).toContain(
			"macos_runner: $" +
				"{{ vars.DESKTOP_CANARY_MACOS_RUNNER || 'macos-latest' }}",
		);
		expect(canaryWorkflow).toContain(
			"runs-on: $" + "{{ vars.DESKTOP_CANARY_MACOS_RUNNER || 'macos-latest' }}",
		);
		expect(canaryWorkflow).toContain("upload_resource_pack_artifacts=false");
		expect(canaryWorkflow).toContain("upload_resource_pack_artifacts=true");
		expect(canaryWorkflow).toContain("bundle_cli=false");
		expect(canaryWorkflow).toContain("upload_sourcemaps=false");
		expect(canaryWorkflow).toContain(
			"parallel_compile: $" +
				"{{ needs.check-changes.outputs.build_scope == 'quick' }}",
		);
		expect(canaryWorkflow).toContain("capture_compile_bundle_stats=false");
		expect(canaryWorkflow).toContain("capture_compile_bundle_stats=true");
		expect(canaryWorkflow).toContain(
			"capture_compile_bundle_stats: $" +
				"{{ needs.check-changes.outputs.capture_compile_bundle_stats == 'true' }}",
		);
		expect(canaryWorkflow).toContain("capture_runtime_performance=false");
		expect(canaryWorkflow).toContain("capture_runtime_performance=true");
		expect(canaryWorkflow).toContain(
			"capture_runtime_performance: $" +
				"{{ needs.check-changes.outputs.capture_runtime_performance == 'true' }}",
		);
		expect(canaryWorkflow).toContain(
			"require_resource_pack_object_storage: $" +
				"{{ github.event.inputs.publish_release != 'false' }}",
		);
		expect(canaryWorkflow).toContain(
			"upload_resource_pack_object_storage: $" +
				"{{ needs.check-changes.outputs.build_scope != 'quick' && needs.check-changes.outputs.upload_resource_pack_artifacts == 'true' }}",
		);
		expect(canaryWorkflow).toContain(
			"name: Build and upload quick resource packs",
		);
		expect(canaryWorkflow).toContain(
			"needs.check-changes.outputs.build_scope == 'quick'",
		);
		expect(canaryWorkflow).toContain(
			"bun run upload:resource-packs -- --pack-dir dist/resource-packs --prefix packs --include-loose-files=false",
		);
		expect(canaryWorkflow).toContain(
			"bun run upload:resource-packs -- --pack-dir dist/resource-packs --prefix packs --include-loose-files=false --skip-existing=false",
		);
		expect(buildWorkflow).toContain(
			"bun run upload:resource-packs -- --pack-dir dist/resource-packs --prefix packs --include-loose-files=false --skip-existing=false",
		);
		expect(canaryWorkflow).toContain(
			"needs: [check-changes, build, resource-packs, resource-pack-release-preflight]",
		);
		expect(canaryWorkflow).toContain(
			"needs.resource-packs.result == 'success' || needs.resource-packs.result == 'skipped'",
		);
		expect(canaryWorkflow).toContain(
			"needs.resource-pack-release-preflight.result == 'success' || needs.resource-pack-release-preflight.result == 'skipped'",
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

	test("keeps MastraCode runtime packs to one native payload set", () => {
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
		expect(
			shouldIncludeMastracodeRuntimeDependency("@libsql/darwin-arm64", {
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toBe(true);
		expect(
			shouldIncludeMastracodeRuntimeDependency("@libsql/darwin-x64", {
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toBe(false);
		expect(
			shouldIncludeMastracodeRuntimeDependency("@libsql/linux-x64-gnu", {
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toBe(false);
		expect(
			getLibsqlPlatformPackageNames({
				targetArch: "universal",
				targetPlatform: "darwin",
			}),
		).toEqual(["@libsql/darwin-arm64", "@libsql/darwin-x64"]);
		expect(
			getLibsqlPlatformPackageNames({
				targetArch: "x64",
				targetPlatform: "linux",
			}),
		).toEqual(["@libsql/linux-x64-gnu", "@libsql/linux-x64-musl"]);
	});

	test("keeps bundled Superset CLI opt-in for local package builds", () => {
		const buildBundledCli = readFileSync(
			join(import.meta.dirname, "scripts", "build-bundled-cli.ts"),
			"utf8",
		);
		const ensureBundledCli = readFileSync(
			join(import.meta.dirname, "scripts", "ensure-bundled-cli.ts"),
			"utf8",
		);

		expect(packageJson.scripts["bundle:cli"]).toBe(
			"bun run scripts/build-bundled-cli.ts",
		);
		expect(packageJson.scripts["bundle:cli:bundled"]).toContain(
			"DESKTOP_BUNDLE_CLI=true",
		);
		expect(buildBundledCli).toContain(
			'process.env.DESKTOP_BUNDLE_CLI !== "true"',
		);
		expect(buildBundledCli).toContain(
			"set DESKTOP_BUNDLE_CLI=true to include it",
		);
		expect(ensureBundledCli).toContain(
			'process.env.DESKTOP_BUNDLE_CLI !== "true"',
		);
		expect(ensureBundledCli).toContain(
			"bundled CLI disabled; ensuring stale output is removed",
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

	test("keeps MastraCode, DuckDB, and libsql runtime modules pack-only", () => {
		for (const moduleName of [
			"mastracode",
			"@mastra/duckdb",
			"@mastra/memory",
			"@duckdb/node-api",
			"@duckdb/node-bindings",
			"libsql",
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
			"@libsql",
			"@neon-rs",
			"libsql",
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
		expect(packagedAsarUnpackGlobs).not.toContain(
			"**/node_modules/@libsql/**/*",
		);
		expect(packageJson.dependencies).not.toHaveProperty("libsql");
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
