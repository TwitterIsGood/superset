import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
const compileTimingsDir = process.env.DESKTOP_COMPILE_TIMINGS_DIR;

interface CompileTiming {
	durationSeconds: number;
	finishedAt: string;
	startedAt: string;
	target: ElectronViteBuildTarget;
}

const compileTimings: CompileTiming[] = [];

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
	const startedAtIso = new Date().toISOString();
	console.log(`[desktop] electron-vite ${target} build started`);
	await viteBuild(prepareBuildConfig(config));
	const durationSeconds = (performance.now() - startedAt) / 1000;
	const finishedAtIso = new Date().toISOString();
	compileTimings.push({
		durationSeconds: Number(durationSeconds.toFixed(3)),
		finishedAt: finishedAtIso,
		startedAt: startedAtIso,
		target,
	});
	console.log(
		`[desktop] electron-vite ${target} build finished in ${durationSeconds.toFixed(1)}s`,
	);
}

function writeCompileTimingsReport(): void {
	if (!compileTimingsDir) return;

	const sortedTimings = [...compileTimings].sort((left, right) =>
		left.target.localeCompare(right.target),
	);
	const startedTimes = sortedTimings.map((timing) =>
		Date.parse(timing.startedAt),
	);
	const finishedTimes = sortedTimings.map((timing) =>
		Date.parse(timing.finishedAt),
	);
	const totalDurationSeconds =
		startedTimes.length > 0 && finishedTimes.length > 0
			? Math.max(
					0,
					(Math.max(...finishedTimes) - Math.min(...startedTimes)) / 1000,
				)
			: 0;
	const slowestTargetSeconds = Math.max(
		0,
		...sortedTimings.map((timing) => timing.durationSeconds),
	);
	const reportDir = resolve(compileTimingsDir);
	mkdirSync(reportDir, { recursive: true });
	writeFileSync(
		resolve(reportDir, "compile-timings.json"),
		`${JSON.stringify(
			{
				mode: parallelCompile ? "parallel" : "sequential",
				slowestTargetSeconds,
				targets: sortedTimings,
				totalDurationSeconds,
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		resolve(reportDir, "compile-timings.md"),
		[
			"# Electron Vite Compile Timings",
			"",
			`- Mode: ${parallelCompile ? "parallel" : "sequential"}`,
			`- Total wall time: ${totalDurationSeconds.toFixed(1)}s`,
			`- Slowest target: ${slowestTargetSeconds.toFixed(1)}s`,
			"",
			"| Target | Duration |",
			"| --- | ---: |",
			...sortedTimings.map(
				(timing) =>
					`| ${timing.target} | ${timing.durationSeconds.toFixed(1)}s |`,
			),
			"",
		].join("\n"),
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
		writeCompileTimingsReport();
		return;
	}

	for (const [target, config] of targets) {
		await buildTarget(target, config);
	}
	writeCompileTimingsReport();
}

await main();
