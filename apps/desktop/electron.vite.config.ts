import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import reactPlugin from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { config } from "dotenv";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import injectProcessEnvPlugin from "rollup-plugin-inject-process-env";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { dependencies, resources, version } from "./package.json";
import { mainExternalizedDependencies } from "./runtime-dependencies";
import {
	applyDesktopTargetEnvOverrides,
	copyResourcesPlugin,
	createBundleStatsPlugin,
	createDesktopApiProxy,
	defineEnv,
	devPath,
	generatedOutputWatchIgnores,
	htmlEnvTransformPlugin,
	isCodeInspectorEnabled,
} from "./vite/helpers";

// override: true ensures .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true, quiet: true });
applyDesktopTargetEnvOverrides();

const DEV_SERVER_PORT = Number(process.env.DESKTOP_VITE_PORT);
const desktopApiProxy = createDesktopApiProxy(
	process.env.SUPERSET_DESKTOP_PROXY_API_TARGET,
	process.env.SUPERSET_DESKTOP_PROXY_ORIGIN,
);

// Validate required env vars at build time using the Zod schema (single source of truth)
await import("./src/main/env.main");

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

const workspaceDependencies = Object.keys(dependencies).filter((dependency) =>
	dependency.startsWith("@superset/"),
);
const buildSourcemap =
	process.env.SENTRY_AUTH_TOKEN ||
	process.env.DESKTOP_INCLUDE_SOURCEMAPS === "true"
		? "hidden"
		: false;

// Sentry plugin for uploading sourcemaps (only in CI with auth token)
const sentryPlugin = process.env.SENTRY_AUTH_TOKEN
	? sentryVitePlugin({
			org: "superset-sh",
			project: "desktop",
			authToken: process.env.SENTRY_AUTH_TOKEN,
			release: { name: version },
		})
	: null;
const codeInspectorVitePlugin = isCodeInspectorEnabled()
	? codeInspectorPlugin({
			bundler: "vite",
			hotKeys: ["altKey"],
			hideConsole: true,
			port: Number(process.env.CODE_INSPECTOR_PORT) || undefined,
		})
	: null;
const mainBundleStatsPlugin = createBundleStatsPlugin({ target: "main" });
const preloadBundleStatsPlugin = createBundleStatsPlugin({ target: "preload" });
const rendererBundleStatsPlugin = createBundleStatsPlugin({
	target: "renderer",
});

const lucideNamedImportRegex =
	/import\s*\{([^{}]*?)\}\s*from\s*["']lucide-react["'];?/g;

function toLucideIconFileName(iconName: string): string {
	const withoutIconSuffix =
		iconName.endsWith("Icon") && iconName !== "Icon"
			? iconName.slice(0, -"Icon".length)
			: iconName;

	return withoutIconSuffix
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.replace(/([A-Za-z])([0-9])/g, "$1-$2")
		.toLowerCase();
}

function isLucideDirectIconImportTarget(id: string): boolean {
	const cleanId = id.split("?", 1)[0] ?? id;
	if (!/\.[cm]?[tj]sx?$/.test(cleanId)) {
		return false;
	}

	return (
		cleanId.includes("/src/renderer/") ||
		cleanId.includes("/packages/ui/src/") ||
		cleanId.includes("/packages/panes/src/") ||
		cleanId.startsWith("/routes/") ||
		cleanId.startsWith("/components/") ||
		cleanId.startsWith("/screens/") ||
		cleanId.startsWith("/hooks/") ||
		cleanId.startsWith("/lib/") ||
		cleanId.startsWith("/stores/")
	);
}

function lucideDirectIconImportsPlugin() {
	return {
		name: "superset-lucide-direct-icon-imports",
		enforce: "pre" as const,
		transform(code: string, id: string) {
			if (
				!isLucideDirectIconImportTarget(id) ||
				!code.includes("lucide-react")
			) {
				return null;
			}

			let transformed = code;
			let didTransform = false;
			transformed = transformed.replace(
				lucideNamedImportRegex,
				(_statement, specifierList: string) => {
					const valueImports: string[] = [];
					const typeImports: string[] = [];

					for (const rawSpecifier of specifierList.split(",")) {
						const specifier = rawSpecifier.trim();
						if (!specifier) continue;

						const typeMatch = specifier.match(/^type\s+(.+)$/);
						if (typeMatch?.[1]) {
							typeImports.push(typeMatch[1].trim());
							continue;
						}

						const [importedName, localName = importedName] = specifier
							.split(/\s+as\s+/)
							.map((part) => part.trim());
						if (!importedName || !localName) continue;

						const fileName = toLucideIconFileName(importedName);
						valueImports.push(
							`import ${localName} from "lucide-react/dist/esm/icons/${fileName}.js";`,
						);
					}

					if (valueImports.length === 0 && typeImports.length === 0) {
						return _statement;
					}

					didTransform = true;
					return [
						typeImports.length
							? `import type { ${typeImports.join(", ")} } from "lucide-react";`
							: null,
						...valueImports,
					]
						.filter(Boolean)
						.join("\n");
				},
			);

			return didTransform ? { code: transformed, map: null } : null;
		},
	};
}

export default defineConfig({
	main: {
		plugins: [tsconfigPaths, copyResourcesPlugin()],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_STREAMS_URL": defineEnv(
				process.env.NEXT_PUBLIC_STREAMS_URL,
				"https://streams.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_MARKETING_URL": defineEnv(
				process.env.NEXT_PUBLIC_MARKETING_URL,
				"https://superset.sh",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
			"process.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			"process.env.RELAY_URL": defineEnv(process.env.RELAY_URL),
			// Must match renderer for analytics in main process
			"process.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"process.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"process.env.STREAMS_URL": defineEnv(
				process.env.STREAMS_URL,
				"https://superset-stream.fly.dev",
			),
			"process.env.DESKTOP_VITE_PORT": defineEnv(process.env.DESKTOP_VITE_PORT),
			"process.env.DESKTOP_NOTIFICATIONS_PORT": defineEnv(
				process.env.DESKTOP_NOTIFICATIONS_PORT,
			),
			"process.env.ELECTRIC_PORT": defineEnv(process.env.ELECTRIC_PORT),
			"process.env.SUPERSET_WORKSPACE_NAME": defineEnv(
				process.env.SUPERSET_WORKSPACE_NAME,
			),
		},

		build: {
			sourcemap: buildSourcemap,
			reportCompressedSize: false,
			rollupOptions: {
				watch: {
					exclude: generatedOutputWatchIgnores,
				},
				input: {
					index: resolve("src/main/index.ts"),
					// Terminal host daemon process - runs separately for terminal persistence
					"terminal-host": resolve("src/main/terminal-host/index.ts"),
					// PTY subprocess - spawned by terminal-host for each terminal
					"pty-subprocess": resolve("src/main/terminal-host/pty-subprocess.ts"),
					// Worker-thread entrypoint for heavy git/status computations
					"git-task-worker": resolve("src/main/git-task-worker.ts"),
					// Workspace service - local HTTP/tRPC server per org
					"host-service": resolve("src/main/host-service/index.ts"),
					// pty-daemon - long-lived per-org Unix-socket server that owns PTYs.
					// Spawned by PtyDaemonCoordinator; survives host-service restarts.
					"pty-daemon": resolve("src/main/pty-daemon/index.ts"),
				},
				output: {
					dir: resolve(devPath, "main"),
				},
				external: ["electron", ...mainExternalizedDependencies],
				plugins: [sentryPlugin, mainBundleStatsPlugin].filter(Boolean),
			},
		},
		resolve: {
			alias: {
				// @xterm/headless 6.0.0 has a packaging bug: `module` field points to
				// non-existent `lib/xterm.mjs`. Force Vite to use the CJS entry instead.
				"@xterm/headless": "@xterm/headless/lib-headless/xterm-headless.js",
			},
		},
	},

	preload: {
		plugins: [
			tsconfigPaths,
			externalizeDepsPlugin({
				exclude: [
					"trpc-electron",
					"@sentry/electron",
					...workspaceDependencies,
				],
			}),
		],

		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "production"),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			__APP_VERSION__: defineEnv(version),
		},

		build: {
			reportCompressedSize: false,
			outDir: resolve(devPath, "preload"),
			rollupOptions: {
				watch: {
					exclude: generatedOutputWatchIgnores,
				},
				plugins: [preloadBundleStatsPlugin].filter(Boolean),
				input: {
					index: resolve("src/preload/index.ts"),
				},
			},
		},
	},

	renderer: {
		define: {
			"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV),
			"process.env.SKIP_ENV_VALIDATION": defineEnv(
				process.env.SKIP_ENV_VALIDATION,
				"",
			),
			"process.platform": defineEnv(process.platform),
			"process.env.NEXT_PUBLIC_API_URL": defineEnv(
				process.env.NEXT_PUBLIC_API_URL,
				"https://api.superset.sh",
			),
			"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
				process.env.NEXT_PUBLIC_WEB_URL,
				"https://app.superset.sh",
			),
			"process.env.NEXT_PUBLIC_MARKETING_URL": defineEnv(
				process.env.NEXT_PUBLIC_MARKETING_URL,
				"https://superset.sh",
			),
			"process.env.NEXT_PUBLIC_ELECTRIC_URL": defineEnv(
				process.env.NEXT_PUBLIC_ELECTRIC_URL,
				"https://electric-proxy.avi-6ac.workers.dev",
			),
			"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
				process.env.NEXT_PUBLIC_DOCS_URL,
				"https://docs.superset.sh",
			),
			"import.meta.env.DEV_SERVER_PORT": defineEnv(String(DEV_SERVER_PORT)),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_KEY,
			),
			"import.meta.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
				process.env.NEXT_PUBLIC_POSTHOG_HOST,
			),
			"import.meta.env.SENTRY_DSN_DESKTOP": defineEnv(
				process.env.SENTRY_DSN_DESKTOP,
			),
			"process.env.RELAY_URL": defineEnv(process.env.RELAY_URL),
			"process.env.STREAMS_URL": defineEnv(
				process.env.STREAMS_URL,
				"https://superset-stream.fly.dev",
			),
			"process.env.DESKTOP_VITE_PORT": defineEnv(process.env.DESKTOP_VITE_PORT),
			"process.env.DESKTOP_NOTIFICATIONS_PORT": defineEnv(
				process.env.DESKTOP_NOTIFICATIONS_PORT,
			),
			"process.env.ELECTRIC_PORT": defineEnv(process.env.ELECTRIC_PORT),
			"process.env.SUPERSET_WORKSPACE_NAME": defineEnv(
				process.env.SUPERSET_WORKSPACE_NAME,
			),
		},

		server: {
			port: DEV_SERVER_PORT,
			strictPort: false,
			...(desktopApiProxy ? { proxy: desktopApiProxy } : {}),
			watch: {
				ignored: generatedOutputWatchIgnores,
			},
		},
		optimizeDeps: {
			exclude: [
				"@codemirror/commands",
				"@codemirror/lang-cpp",
				"@codemirror/lang-css",
				"@codemirror/lang-go",
				"@codemirror/lang-html",
				"@codemirror/lang-java",
				"@codemirror/lang-javascript",
				"@codemirror/lang-json",
				"@codemirror/lang-markdown",
				"@codemirror/lang-php",
				"@codemirror/lang-python",
				"@codemirror/lang-rust",
				"@codemirror/lang-sql",
				"@codemirror/lang-xml",
				"@codemirror/lang-yaml",
				"@codemirror/language",
				"@codemirror/legacy-modes",
				"@codemirror/search",
				"@codemirror/state",
				"@codemirror/view",
				"@sentry/electron/renderer",
				"@xterm/addon-webgl",
				"@xterm/xterm",
				"lucide-react",
				"react-day-picker",
				"shiki",
			],
			esbuildOptions: {
				sourcemap: false,
			},
		},

		plugins: [
			tanstackRouter({
				target: "react",
				routesDirectory: resolve("src/renderer/routes"),
				generatedRouteTree: resolve("src/renderer/routeTree.gen.ts"),
				indexToken: "page",
				routeToken: "layout",
				autoCodeSplitting: true,
				routeFileIgnorePattern:
					"^(?!(__root|page|layout)\\.tsx$).*\\.(tsx?|jsx?)$",
			}),
			tsconfigPaths,
			tailwindcss(),
			...(codeInspectorVitePlugin ? [codeInspectorVitePlugin] : []),
			lucideDirectIconImportsPlugin(),
			reactPlugin(),
			htmlEnvTransformPlugin(),
		],

		worker: {
			format: "es",
		},

		resolve: {
			alias: [
				{
					find: /^shiki$/,
					replacement: resolve(
						"src/renderer/lib/shikiLimitedManifest/shiki.ts",
					),
				},
				{
					find: "shiki/dist/langs.mjs",
					replacement: resolve(
						"src/renderer/lib/shikiLimitedManifest/languages.ts",
					),
				},
				{
					find: "shiki/dist/themes.mjs",
					replacement: resolve(
						"src/renderer/lib/shikiLimitedManifest/themes.ts",
					),
				},
				{
					find: /^shiki\/wasm$/,
					replacement: resolve(
						"src/renderer/lib/shikiLimitedManifest/empty-wasm.ts",
					),
				},
			],
		},

		publicDir: resolve(resources, "public"),

		build: {
			sourcemap: buildSourcemap,
			reportCompressedSize: false,
			outDir: resolve(devPath, "renderer"),

			rollupOptions: {
				watch: {
					exclude: generatedOutputWatchIgnores,
				},
				plugins: [
					injectProcessEnvPlugin({
						NODE_ENV: "production",
						platform: process.platform,
					}),
					sentryPlugin,
					rendererBundleStatsPlugin,
				].filter(Boolean),

				input: {
					index: resolve("src/renderer/index.html"),
				},
			},
		},
	},
});
