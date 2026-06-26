import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import type { Plugin } from "vite";

import { main, resources } from "../package.json";

export const devPath = normalize(dirname(main)).split(/\/|\\/g)[0];

function normalizeEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function resolveEnvValue(
	value: string | undefined,
	fallback: string,
): string {
	return normalizeEnvValue(value) ?? fallback;
}

function copyPath({ src, dest }: { src: string; dest: string }): void {
	if (!existsSync(src)) return;

	if (existsSync(dest)) {
		rmSync(dest, { recursive: true });
	}
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(src, dest, { recursive: true });
}

export function defineEnv(
	value: string | undefined,
	fallback?: string,
): string {
	return JSON.stringify(normalizeEnvValue(value) ?? fallback);
}

type MutableEnv = Record<string, string | undefined>;

const DESKTOP_TARGET_ENV_OVERRIDES = [
	{
		target: "NEXT_PUBLIC_API_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_API_URL",
			"WORKTREE_DEV_EXTERNAL_API_URL",
		],
	},
	{
		target: "NEXT_PUBLIC_ELECTRIC_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_ELECTRIC_URL",
			"WORKTREE_DEV_EXTERNAL_ELECTRIC_URL",
		],
	},
	{
		target: "NEXT_PUBLIC_ELECTRIC_PROXY_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_ELECTRIC_URL",
			"WORKTREE_DEV_EXTERNAL_ELECTRIC_URL",
		],
	},
	{
		target: "RELAY_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_RELAY_URL",
			"WORKTREE_DEV_EXTERNAL_RELAY_URL",
		],
	},
	{
		target: "NEXT_PUBLIC_RELAY_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_RELAY_URL",
			"WORKTREE_DEV_EXTERNAL_RELAY_URL",
		],
	},
	{
		target: "NEXT_PUBLIC_WEB_URL",
		sources: [
			"SUPERSET_DESKTOP_TARGET_WEB_URL",
			"WORKTREE_DEV_EXTERNAL_WEB_URL",
		],
	},
] as const;

export function applyDesktopTargetEnvOverrides(
	env: MutableEnv = process.env as MutableEnv,
): string[] {
	const appliedTargets: string[] = [];

	for (const override of DESKTOP_TARGET_ENV_OVERRIDES) {
		const value = override.sources
			.map((source) => normalizeEnvValue(env[source]))
			.find((sourceValue): sourceValue is string => !!sourceValue);

		if (!value) continue;
		env[override.target] = value;
		appliedTargets.push(override.target);
	}

	return appliedTargets;
}

function createProxyOptions({
	origin,
	target,
}: {
	origin?: string;
	target: string;
}) {
	return {
		changeOrigin: true,
		cookieDomainRewrite: "",
		...(origin ? { headers: { Origin: origin } } : {}),
		secure: false,
		target,
	};
}

export function createDesktopApiProxy(
	target: string | undefined,
	origin?: string,
) {
	const normalizedTarget = normalizeEnvValue(target);
	if (!normalizedTarget) return undefined;
	const normalizedOrigin = normalizeEnvValue(origin);

	return {
		"/api": createProxyOptions({
			origin: normalizedOrigin,
			target: normalizedTarget,
		}),
		"/trpc": createProxyOptions({
			origin: normalizedOrigin,
			target: normalizedTarget,
		}),
	};
}

type CodeInspectorEnv = Record<string, string | undefined>;

export function isCodeInspectorEnabled(
	env: CodeInspectorEnv = process.env as CodeInspectorEnv,
): boolean {
	const value = normalizeEnvValue(
		env.DESKTOP_ENABLE_CODE_INSPECTOR ?? env.CODE_INSPECTOR,
	);
	if (!value) return false;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const generatedOutputWatchIgnores = [
	"**/dist/resource-packs/**",
	"**/dist/resource-packs-test/**",
	"**/release/**",
	"**/.tmp/**",
	"**/superset-dev-data/packs/**",
];

type BuildStatsEnv = Record<string, string | undefined>;

type BundleStatsPluginOptions = {
	target: "main" | "preload" | "renderer";
	env?: BuildStatsEnv;
};

type BundleOutputStats = {
	fileName: string;
	type: "asset" | "chunk";
	bytes: number;
	isEntry?: boolean;
	isDynamicEntry?: boolean;
	imports?: string[];
	dynamicImports?: string[];
	moduleCount?: number;
	largestModules?: Array<{
		id: string;
		renderedLength: number;
		originalLength: number;
	}>;
};

type RollupOutputAsset = {
	type: "asset";
	fileName: string;
	source: string | Uint8Array;
};

type RollupOutputChunk = {
	type: "chunk";
	fileName: string;
	code: string;
	isEntry: boolean;
	isDynamicEntry: boolean;
	imports: string[];
	dynamicImports: string[];
	modules: Record<
		string,
		{
			originalLength: number;
			renderedLength: number;
		}
	>;
};

type RollupOutput = RollupOutputAsset | RollupOutputChunk;
type RollupOutputBundle = Record<string, RollupOutput>;

function isBuildStatsEnabled(env: BuildStatsEnv): boolean {
	return normalizeEnvValue(env.DESKTOP_BUILD_STATS)?.toLowerCase() === "true";
}

function getBundleOutputBytes(output: RollupOutput): number {
	if (output.type === "asset") {
		if (typeof output.source === "string") {
			return Buffer.byteLength(output.source);
		}
		return output.source.byteLength;
	}
	return Buffer.byteLength(output.code);
}

function summarizeBundleOutput(
	bundle: RollupOutputBundle,
	cwd: string,
): BundleOutputStats[] {
	return Object.values(bundle)
		.map((output) => {
			const bytes = getBundleOutputBytes(output);
			if (output.type === "asset") {
				return {
					fileName: output.fileName,
					type: "asset" as const,
					bytes,
				};
			}

			const largestModules = Object.entries(output.modules)
				.map(([id, moduleInfo]) => ({
					id: relative(cwd, id),
					originalLength: moduleInfo.originalLength,
					renderedLength: moduleInfo.renderedLength,
				}))
				.sort((left, right) => right.renderedLength - left.renderedLength)
				.slice(0, 20);

			return {
				fileName: output.fileName,
				type: "chunk" as const,
				bytes,
				isEntry: output.isEntry,
				isDynamicEntry: output.isDynamicEntry,
				imports: output.imports,
				dynamicImports: output.dynamicImports,
				moduleCount: Object.keys(output.modules).length,
				largestModules,
			};
		})
		.sort((left, right) => right.bytes - left.bytes);
}

function formatBytes(bytes: number): string {
	const mib = bytes / 1024 / 1024;
	if (mib >= 1) return `${mib.toFixed(2)} MiB`;
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

function writeBundleStatsReport({
	outputs,
	reportDir,
	target,
}: {
	outputs: BundleOutputStats[];
	reportDir: string;
	target: BundleStatsPluginOptions["target"];
}): void {
	mkdirSync(reportDir, { recursive: true });
	const totalBytes = outputs.reduce((sum, output) => sum + output.bytes, 0);
	const jsonPath = join(reportDir, `${target}.json`);
	const markdownPath = join(reportDir, `${target}.md`);

	writeFileSync(
		jsonPath,
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				target,
				totalBytes,
				outputs,
			},
			null,
			2,
		)}\n`,
	);

	const lines = [
		`# ${target} bundle stats`,
		"",
		`Total output: ${formatBytes(totalBytes)}`,
		"",
		"## Largest outputs",
		"",
		"| File | Type | Size | Modules |",
		"| --- | --- | ---: | ---: |",
		...outputs
			.slice(0, 30)
			.map(
				(output) =>
					`| \`${output.fileName}\` | ${output.type} | ${formatBytes(output.bytes)} | ${output.moduleCount ?? ""} |`,
			),
	];

	for (const output of outputs.filter(
		(entry) => entry.type === "chunk" && entry.largestModules?.length,
	)) {
		lines.push(
			"",
			`## Largest modules in ${output.fileName}`,
			"",
			"| Module | Rendered | Original |",
			"| --- | ---: | ---: |",
			...(output.largestModules ?? []).map(
				(module) =>
					`| \`${module.id}\` | ${formatBytes(module.renderedLength)} | ${formatBytes(module.originalLength)} |`,
			),
		);
	}

	writeFileSync(markdownPath, `${lines.join("\n")}\n`);
	console.log(
		`[desktop] ${target} bundle stats written to ${relative(process.cwd(), reportDir)}`,
	);
}

export function createBundleStatsPlugin({
	target,
	env = process.env as BuildStatsEnv,
}: BundleStatsPluginOptions): Plugin | null {
	if (!isBuildStatsEnabled(env)) return null;
	const reportDir = resolve(
		normalizeEnvValue(env.DESKTOP_BUILD_STATS_DIR) ??
			"performance-reports/build-stats",
	);

	return {
		name: `desktop-bundle-stats:${target}`,
		generateBundle(_outputOptions, bundle) {
			writeBundleStatsReport({
				outputs: summarizeBundleOutput(
					bundle as RollupOutputBundle,
					process.cwd(),
				),
				reportDir,
				target,
			});
		},
	};
}

const RESOURCES_TO_COPY = [
	{
		src: resolve(__dirname, "..", resources, "sounds"),
		dest: resolve(__dirname, "..", devPath, "resources/sounds"),
	},
	{
		src: resolve(__dirname, "..", resources, "tray"),
		dest: resolve(__dirname, "..", devPath, "resources/tray"),
	},
	{
		src: resolve(__dirname, "..", resources, "browser-extension"),
		dest: resolve(__dirname, "..", devPath, "resources/browser-extension"),
	},
	{
		src: resolve(
			__dirname,
			"..",
			resources,
			"pack-system/pack-manifest-index.json",
		),
		dest: resolve(
			__dirname,
			"..",
			devPath,
			"resources/pack-system/pack-manifest-index.json",
		),
	},
	{
		src: resolve(__dirname, "../../../packages/local-db/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/migrations"),
	},
	{
		src: resolve(__dirname, "../../../packages/host-service/drizzle"),
		dest: resolve(__dirname, "..", devPath, "resources/host-migrations"),
	},
	{
		src: resolve(__dirname, "../src/main/lib/agent-setup/templates"),
		dest: resolve(__dirname, "..", devPath, "main/templates"),
	},
];

/**
 * Copies resources to dist/ for preview/production mode.
 * In preview mode, __dirname resolves relative to dist/main, so resources
 * need to be copied there for the main process to access them.
 */
export function copyResourcesPlugin(): Plugin {
	return {
		name: "copy-resources",
		writeBundle() {
			for (const resource of RESOURCES_TO_COPY) {
				copyPath(resource);
			}
		},
	};
}

/**
 * Injects environment variables into index.html CSP.
 */
export function htmlEnvTransformPlugin(): Plugin {
	return {
		name: "html-env-transform",
		transformIndexHtml(html) {
			return html
				.replace(
					/%NEXT_PUBLIC_API_URL%/g,
					resolveEnvValue(
						process.env.NEXT_PUBLIC_API_URL,
						"https://api.superset.sh",
					),
				)
				.replace(
					/%NEXT_PUBLIC_ELECTRIC_URL%/g,
					new URL(
						resolveEnvValue(
							process.env.NEXT_PUBLIC_ELECTRIC_URL,
							"https://electric-proxy.avi-6ac.workers.dev",
						),
					).origin,
				)
				.replace(
					/%NEXT_PUBLIC_STREAMS_URL%/g,
					resolveEnvValue(
						process.env.NEXT_PUBLIC_STREAMS_URL,
						"https://streams.superset.sh",
					),
				)
				.replace(
					/%RELAY_URL%/g,
					resolveEnvValue(process.env.RELAY_URL, "https://relay.superset.sh"),
				);
		},
	};
}
