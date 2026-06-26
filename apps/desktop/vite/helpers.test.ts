import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyDesktopTargetEnvOverrides,
	createBundleStatsPlugin,
	createDesktopApiProxy,
	defineEnv,
	generatedOutputWatchIgnores,
	isCodeInspectorEnabled,
	resolveEnvValue,
} from "./helpers";

describe("desktop Vite env helpers", () => {
	it("uses fallback values when CI secrets expand to empty strings", () => {
		expect(defineEnv("", "https://api.superset.sh")).toBe(
			JSON.stringify("https://api.superset.sh"),
		);
		expect(defineEnv("   ", "https://relay.superset.sh")).toBe(
			JSON.stringify("https://relay.superset.sh"),
		);
	});

	it("preserves explicit non-empty overrides after trimming accidental whitespace", () => {
		expect(
			defineEnv(" https://api.example.com ", "https://api.superset.sh"),
		).toBe(JSON.stringify("https://api.example.com"));
		expect(
			resolveEnvValue(
				" https://relay.example.com ",
				"https://relay.superset.sh",
			),
		).toBe("https://relay.example.com");
	});

	it("keeps undefined for optional env values without a fallback", () => {
		expect(defineEnv("", undefined)).toBe(undefined);
		expect(defineEnv(undefined, undefined)).toBe(undefined);
	});

	it("applies explicit desktop target env overrides after dotenv loads", () => {
		const env = {
			NEXT_PUBLIC_API_URL: "http://localhost:3001",
			NEXT_PUBLIC_ELECTRIC_URL: "http://localhost:3012",
			NEXT_PUBLIC_ELECTRIC_PROXY_URL: "http://localhost:3012",
			RELAY_URL: "http://localhost:3013",
			NEXT_PUBLIC_RELAY_URL: "http://localhost:3013",
			NEXT_PUBLIC_WEB_URL: "http://localhost:3000",
			WORKTREE_DEV_EXTERNAL_API_URL: "http://localhost:43001",
			WORKTREE_DEV_EXTERNAL_ELECTRIC_URL: "http://localhost:43012",
			WORKTREE_DEV_EXTERNAL_RELAY_URL: "http://localhost:43013",
			WORKTREE_DEV_EXTERNAL_WEB_URL: "http://localhost:43000",
		};

		expect(applyDesktopTargetEnvOverrides(env)).toEqual([
			"NEXT_PUBLIC_API_URL",
			"NEXT_PUBLIC_ELECTRIC_URL",
			"NEXT_PUBLIC_ELECTRIC_PROXY_URL",
			"RELAY_URL",
			"NEXT_PUBLIC_RELAY_URL",
			"NEXT_PUBLIC_WEB_URL",
		]);
		expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:43001");
		expect(env.NEXT_PUBLIC_ELECTRIC_URL).toBe("http://localhost:43012");
		expect(env.NEXT_PUBLIC_ELECTRIC_PROXY_URL).toBe("http://localhost:43012");
		expect(env.RELAY_URL).toBe("http://localhost:43013");
		expect(env.NEXT_PUBLIC_RELAY_URL).toBe("http://localhost:43013");
		expect(env.NEXT_PUBLIC_WEB_URL).toBe("http://localhost:43000");
	});

	it("prefers same-origin desktop API targets over external API targets", () => {
		const env = {
			NEXT_PUBLIC_API_URL: "http://localhost:3001",
			SUPERSET_DESKTOP_TARGET_API_URL: "http://localhost:3280",
			WORKTREE_DEV_EXTERNAL_API_URL: "http://localhost:43001",
		};

		expect(applyDesktopTargetEnvOverrides(env)).toContain(
			"NEXT_PUBLIC_API_URL",
		);
		expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3280");
	});

	it("creates a same-origin API proxy for desktop external service profiles", () => {
		expect(createDesktopApiProxy(undefined)).toBeUndefined();
		expect(createDesktopApiProxy("  ")).toBeUndefined();
		expect(createDesktopApiProxy(" http://localhost:43001 ")).toEqual({
			"/api": {
				changeOrigin: true,
				cookieDomainRewrite: "",
				secure: false,
				target: "http://localhost:43001",
			},
			"/trpc": {
				changeOrigin: true,
				cookieDomainRewrite: "",
				secure: false,
				target: "http://localhost:43001",
			},
		});
		expect(
			createDesktopApiProxy(
				"http://localhost:43001",
				" http://bj1.v.lhb.ink:63000 ",
			),
		).toEqual({
			"/api": {
				changeOrigin: true,
				cookieDomainRewrite: "",
				headers: { Origin: "http://bj1.v.lhb.ink:63000" },
				secure: false,
				target: "http://localhost:43001",
			},
			"/trpc": {
				changeOrigin: true,
				cookieDomainRewrite: "",
				headers: { Origin: "http://bj1.v.lhb.ink:63000" },
				secure: false,
				target: "http://localhost:43001",
			},
		});
	});

	it("keeps code inspector opt-in for desktop dev", () => {
		expect(isCodeInspectorEnabled({})).toBe(false);
		expect(isCodeInspectorEnabled({ CODE_INSPECTOR: "true" })).toBe(true);
		expect(isCodeInspectorEnabled({ DESKTOP_ENABLE_CODE_INSPECTOR: "1" })).toBe(
			true,
		);
		expect(isCodeInspectorEnabled({ CODE_INSPECTOR: "false" })).toBe(false);
	});

	it("keeps generated pack and release outputs out of desktop dev watch", () => {
		expect(generatedOutputWatchIgnores).toEqual(
			expect.arrayContaining([
				"**/dist/resource-packs/**",
				"**/dist/resource-packs-test/**",
				"**/release/**",
				"**/.tmp/**",
				"**/superset-dev-data/packs/**",
			]),
		);
	});

	it("keeps bundle stats opt-in and writes JSON plus Markdown reports", () => {
		expect(createBundleStatsPlugin({ target: "renderer", env: {} })).toBeNull();

		const reportDir = mkdtempSync(join(tmpdir(), "desktop-build-stats-"));
		const plugin = createBundleStatsPlugin({
			target: "renderer",
			env: {
				DESKTOP_BUILD_STATS: "true",
				DESKTOP_BUILD_STATS_DIR: reportDir,
			},
		});
		const generateBundle = plugin?.generateBundle;
		if (typeof generateBundle !== "function") {
			throw new Error("Expected bundle stats plugin to expose generateBundle");
		}

		const bundle = {
			"renderer/index.js": {
				type: "chunk",
				fileName: "renderer/index.js",
				code: "console.log('hello');",
				isEntry: true,
				isDynamicEntry: false,
				imports: [],
				dynamicImports: ["renderer/lazy.js"],
				modules: {
					[join(process.cwd(), "apps/desktop/src/renderer/index.tsx")]: {
						originalLength: 1200,
						renderedLength: 300,
					},
				},
			},
			"renderer/style.css": {
				type: "asset",
				fileName: "renderer/style.css",
				source: ".root{}",
			},
		};

		generateBundle.call(
			{} as ThisParameterType<typeof generateBundle>,
			{} as Parameters<typeof generateBundle>[0],
			bundle as Parameters<typeof generateBundle>[1],
			false as Parameters<typeof generateBundle>[2],
		);

		const jsonPath = join(reportDir, "renderer.json");
		const markdownPath = join(reportDir, "renderer.md");
		expect(existsSync(jsonPath)).toBe(true);
		expect(existsSync(markdownPath)).toBe(true);

		const stats = JSON.parse(readFileSync(jsonPath, "utf8")) as {
			target: string;
			outputs: Array<{
				fileName: string;
				largestModules?: Array<{ id: string }>;
			}>;
		};
		expect(stats.target).toBe("renderer");
		expect(stats.outputs[0]?.fileName).toBe("renderer/index.js");
		expect(stats.outputs[0]?.largestModules?.[0]?.id).toBe(
			"apps/desktop/src/renderer/index.tsx",
		);
		expect(readFileSync(markdownPath, "utf8")).toContain(
			"# renderer bundle stats",
		);
	});
});
