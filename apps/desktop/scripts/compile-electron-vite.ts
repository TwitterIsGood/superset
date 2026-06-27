import { performance } from "node:perf_hooks";
import { type ResolvedConfig, resolveConfig } from "electron-vite";
import { type UserConfig, build as viteBuild } from "vite";

type ElectronViteBuildTarget = "main" | "preload" | "renderer";

interface ResolvedElectronViteBuildConfig extends ResolvedConfig {
	config?: {
		main?: UserConfig;
		preload?: UserConfig;
		renderer?: UserConfig;
	};
}

const parallelCompile = process.env.DESKTOP_COMPILE_PARALLEL === "true";
const quietCompile = process.env.DESKTOP_COMPILE_QUIET === "true";

function prepareBuildConfig(config: UserConfig): UserConfig {
	const nextConfig: UserConfig = quietCompile
		? {
				...config,
				clearScreen: false,
				logLevel: "warn",
			}
		: config;

	if (nextConfig.build?.watch) {
		return {
			...nextConfig,
			build: {
				...nextConfig.build,
				watch: null,
			},
		};
	}
	return nextConfig;
}

async function buildTarget(
	target: ElectronViteBuildTarget,
	config: UserConfig,
): Promise<void> {
	const startedAt = performance.now();
	console.log(`[desktop] electron-vite ${target} build started`);
	await viteBuild(prepareBuildConfig(config));
	const durationSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`[desktop] electron-vite ${target} build finished in ${durationSeconds}s`,
	);
}

async function main(): Promise<void> {
	process.env.NODE_ENV_ELECTRON_VITE = "production";

	const resolved = (await resolveConfig(
		{},
		"build",
		"production",
	)) as ResolvedElectronViteBuildConfig;
	const targetConfigs = [
		["main", resolved.config?.main],
		["preload", resolved.config?.preload],
		["renderer", resolved.config?.renderer],
	] as const satisfies ReadonlyArray<
		readonly [ElectronViteBuildTarget, UserConfig | undefined]
	>;
	const targets = targetConfigs.filter(
		(entry): entry is readonly [ElectronViteBuildTarget, UserConfig] =>
			entry[1] !== undefined,
	);

	if (targets.length === 0) {
		console.log("[desktop] no electron-vite build targets found");
		return;
	}

	console.log(
		`[desktop] electron-vite build mode: ${parallelCompile ? "parallel" : "sequential"}`,
	);
	if (quietCompile) {
		console.log("[desktop] electron-vite quiet CI output enabled");
	}

	if (parallelCompile) {
		await Promise.all(
			targets.map(([target, config]) => buildTarget(target, config)),
		);
		return;
	}

	for (const [target, config] of targets) {
		await buildTarget(target, config);
	}
}

await main();
