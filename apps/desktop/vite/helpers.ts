import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
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
