import { existsSync, readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

type CanaryBuildLane = "quick" | "publishedQuick" | "full";

interface BuildDurationBudget {
	maxSeconds: number;
	targetSeconds?: number;
	criticalPathMaxSeconds?: Record<string, number>;
}

interface GitHubStep {
	completedAt?: string | null;
	completed_at?: string | null;
	conclusion?: string | null;
	name?: string;
	number?: number;
	startedAt?: string | null;
	started_at?: string | null;
	status?: string | null;
}

interface GitHubJob {
	completedAt?: string | null;
	completed_at?: string | null;
	conclusion?: string | null;
	html_url?: string;
	id?: number;
	name?: string;
	run_attempt?: number;
	startedAt?: string | null;
	started_at?: string | null;
	status?: string | null;
	steps?: GitHubStep[];
}

interface GitHubJobsPage {
	jobs?: GitHubJob[];
	total_count?: number;
}

interface CliOptions {
	budgetPath: string;
	excludeJobNamePatterns: string[];
	includeJobNamePatterns: string[];
	inputPath?: string;
	json: boolean;
	lane?: CanaryBuildLane;
	owner?: string;
	repo?: string;
	runAttempt?: number;
	runId?: string;
	token?: string;
}

interface PhaseSummary {
	durationSeconds: number;
	jobNames: string[];
	name: string;
	stepNames: string[];
}

interface PhaseAccumulator extends PhaseSummary {
	fallbackDurationSeconds: number;
	intervals: Array<{ endMs: number; startMs: number }>;
}

interface BuildDurationFinding {
	message: string;
	phase?: string;
}

interface BuildDurationResult {
	artifactReadySeconds: number;
	checkedJobs: number;
	criticalPathSeconds: number;
	failures: BuildDurationFinding[];
	lane: CanaryBuildLane;
	phases: PhaseSummary[];
	targetWarnings: BuildDurationFinding[];
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");

function fail(message: string): never {
	console.error(`[check-canary-build-duration] ${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		budgetPath: resolve(desktopDir, "perf-budget.json"),
		excludeJobNamePatterns: [],
		includeJobNamePatterns: [],
		json: false,
		token: process.env.GITHUB_TOKEN,
		runId: process.env.GITHUB_RUN_ID,
		runAttempt: process.env.GITHUB_RUN_ATTEMPT
			? Number(process.env.GITHUB_RUN_ATTEMPT)
			: undefined,
	};

	const repository = process.env.GITHUB_REPOSITORY;
	if (repository?.includes("/")) {
		const [owner, repo] = repository.split("/");
		options.owner = owner;
		options.repo = repo;
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--budget") {
			const value = argv[index + 1];
			if (!value) fail("--budget requires a value");
			options.budgetPath = resolve(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--budget=")) {
			options.budgetPath = resolve(arg.slice("--budget=".length));
			continue;
		}
		if (arg === "--input") {
			const value = argv[index + 1];
			if (!value) fail("--input requires a value");
			options.inputPath = resolve(value);
			index += 1;
			continue;
		}
		if (arg === "--include-job-name") {
			const value = argv[index + 1];
			if (!value) fail("--include-job-name requires a value");
			options.includeJobNamePatterns.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--include-job-name=")) {
			options.includeJobNamePatterns.push(
				arg.slice("--include-job-name=".length),
			);
			continue;
		}
		if (arg === "--exclude-job-name") {
			const value = argv[index + 1];
			if (!value) fail("--exclude-job-name requires a value");
			options.excludeJobNamePatterns.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--exclude-job-name=")) {
			options.excludeJobNamePatterns.push(
				arg.slice("--exclude-job-name=".length),
			);
			continue;
		}
		if (arg.startsWith("--input=")) {
			options.inputPath = resolve(arg.slice("--input=".length));
			continue;
		}
		if (arg === "--lane") {
			const value = argv[index + 1];
			if (!value) fail("--lane requires a value");
			options.lane = parseLane(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--lane=")) {
			options.lane = parseLane(arg.slice("--lane=".length));
			continue;
		}
		if (arg === "--owner") {
			const value = argv[index + 1];
			if (!value) fail("--owner requires a value");
			options.owner = value;
			index += 1;
			continue;
		}
		if (arg === "--repo") {
			const value = argv[index + 1];
			if (!value) fail("--repo requires a value");
			options.repo = value;
			index += 1;
			continue;
		}
		if (arg === "--run-id") {
			const value = argv[index + 1];
			if (!value) fail("--run-id requires a value");
			options.runId = value;
			index += 1;
			continue;
		}
		if (arg === "--run-attempt") {
			const value = argv[index + 1];
			if (!value) fail("--run-attempt requires a value");
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed <= 0) {
				fail("--run-attempt must be a positive integer");
			}
			options.runAttempt = parsed;
			index += 1;
			continue;
		}
		if (arg === "--token") {
			const value = argv[index + 1];
			if (!value) fail("--token requires a value");
			options.token = value;
			index += 1;
			continue;
		}
		fail(`Unknown argument: ${arg}`);
	}

	return options;
}

function parseLane(value: string): CanaryBuildLane {
	if (value === "quick" || value === "publishedQuick" || value === "full") {
		return value;
	}
	fail(`Unsupported lane: ${value}`);
}

function readJsonFile(path: string): unknown {
	if (!existsSync(path)) fail(`File not found: ${path}`);
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function readBuildBudget(
	path: string,
	lane: CanaryBuildLane,
): BuildDurationBudget {
	const raw = asRecord(readJsonFile(path));
	const build = asRecord(raw?.build);
	const canary = asRecord(build?.canary);
	const budget = asRecord(canary?.[lane]);
	if (!budget) fail(`Missing build.canary.${lane} in ${path}`);
	const maxSeconds = readPositiveNumber(
		budget.maxSeconds,
		`build.canary.${lane}.maxSeconds`,
	);
	const targetSeconds =
		budget.targetSeconds === undefined
			? undefined
			: readPositiveNumber(
					budget.targetSeconds,
					`build.canary.${lane}.targetSeconds`,
				);
	const criticalPathRaw = asRecord(budget.criticalPathMaxSeconds);
	const criticalPathMaxSeconds: Record<string, number> = {};
	for (const [phase, value] of Object.entries(criticalPathRaw ?? {})) {
		criticalPathMaxSeconds[phase] = readPositiveNumber(
			value,
			`build.canary.${lane}.criticalPathMaxSeconds.${phase}`,
		);
	}
	return {
		maxSeconds,
		...(targetSeconds !== undefined && { targetSeconds }),
		...(Object.keys(criticalPathMaxSeconds).length > 0 && {
			criticalPathMaxSeconds,
		}),
	};
}

function readPositiveNumber(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		fail(`Invalid budget: ${path} must be a positive number`);
	}
	return value;
}

function inferLaneFromEnv(): CanaryBuildLane {
	const buildScope =
		process.env.BUILD_SCOPE || process.env.INPUT_BUILD_SCOPE || "quick";
	const publishRelease =
		process.env.PUBLISH_RELEASE || process.env.INPUT_PUBLISH_RELEASE || "true";
	if (buildScope === "full") return "full";
	if (buildScope === "quick" && publishRelease === "false") return "quick";
	if (buildScope === "quick") return "publishedQuick";
	fail(
		`Cannot infer lane from BUILD_SCOPE=${buildScope} PUBLISH_RELEASE=${publishRelease}`,
	);
}

function parseTimestamp(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function secondsBetween(
	startedAt: string | null | undefined,
	completedAt: string | null | undefined,
): number | undefined {
	const start = parseTimestamp(startedAt);
	const end = parseTimestamp(completedAt) ?? Date.now();
	if (start === undefined) return undefined;
	return Math.max(0, (end - start) / 1000);
}

function jobStartedAt(job: GitHubJob): string | null | undefined {
	return job.started_at ?? job.startedAt;
}

function jobCompletedAt(job: GitHubJob): string | null | undefined {
	return job.completed_at ?? job.completedAt;
}

function stepStartedAt(step: GitHubStep): string | null | undefined {
	return step.started_at ?? step.startedAt;
}

function stepCompletedAt(step: GitHubStep): string | null | undefined {
	return step.completed_at ?? step.completedAt;
}

function normalizeJobs(input: unknown): GitHubJob[] {
	if (Array.isArray(input)) return input.filter(isJobLike);
	const record = asRecord(input);
	const jobs = record?.jobs;
	return Array.isArray(jobs) ? jobs.filter(isJobLike) : [];
}

function isJobLike(value: unknown): value is GitHubJob {
	return asRecord(value) !== undefined;
}

function phaseForStep(jobName: string, stepName: string): string | undefined {
	const text = `${jobName} ${stepName}`.toLowerCase();
	if (text.includes("post cache")) return "postCache";
	if (text.includes("cache")) return "dependencyCache";
	if (
		text.includes("install dependencies") ||
		text.includes("install desktop dependency graph")
	)
		return "install";
	if (
		text.includes("install desktop native") ||
		text.includes("install target platform")
	)
		return "install";
	if (text.includes("compile app") || text.includes("electron-vite"))
		return "compile";
	if (text.includes("resource pack") || text.includes("resource-pack")) {
		return "resourcePackBuildUploadVerify";
	}
	if (
		text.includes("build electron app") ||
		text.includes("electron-builder")
	) {
		return "electronBuilderZip";
	}
	if (text.includes("upload") && text.includes("artifact"))
		return "artifactUpload";
	if (text.includes("download all artifacts")) return "artifactUpload";
	if (text.includes("release") || text.includes("canary release"))
		return "releaseUpdate";
	return undefined;
}

function phaseForJob(jobName: string): string | undefined {
	const lower = jobName.toLowerCase();
	if (lower.includes("macos") && lower.includes("arm64")) return "macArm64";
	if (lower.includes("macos") && lower.includes("x64")) return "macX64";
	if (lower.includes("linux")) return "linuxX64";
	return undefined;
}

function timestampInterval(
	startedAt: string | null | undefined,
	completedAt: string | null | undefined,
): { endMs: number; startMs: number } | undefined {
	const startMs = parseTimestamp(startedAt);
	const endMs = parseTimestamp(completedAt) ?? Date.now();
	if (startMs === undefined) return undefined;
	return {
		endMs: Math.max(startMs, endMs),
		startMs,
	};
}

function unionIntervalSeconds(
	intervals: Array<{ endMs: number; startMs: number }>,
): number {
	if (intervals.length === 0) return 0;
	const sorted = [...intervals].sort(
		(left, right) => left.startMs - right.startMs,
	);
	let totalMs = 0;
	let currentStartMs = sorted[0]?.startMs ?? 0;
	let currentEndMs = sorted[0]?.endMs ?? currentStartMs;

	for (const interval of sorted.slice(1)) {
		if (interval.startMs <= currentEndMs) {
			currentEndMs = Math.max(currentEndMs, interval.endMs);
			continue;
		}
		totalMs += currentEndMs - currentStartMs;
		currentStartMs = interval.startMs;
		currentEndMs = interval.endMs;
	}

	totalMs += currentEndMs - currentStartMs;
	return totalMs / 1000;
}

function createPhaseMap(jobs: GitHubJob[]): Map<string, PhaseSummary> {
	const phases = new Map<string, PhaseAccumulator>();
	const add = (
		phaseName: string,
		jobName: string,
		stepName: string,
		durationSeconds: number,
		interval?: { endMs: number; startMs: number },
	) => {
		const existing = phases.get(phaseName);
		if (!existing) {
			phases.set(phaseName, {
				durationSeconds,
				fallbackDurationSeconds: interval ? 0 : durationSeconds,
				intervals: interval ? [interval] : [],
				jobNames: [jobName],
				name: phaseName,
				stepNames: [stepName],
			});
			return;
		}
		if (interval) {
			existing.intervals.push(interval);
		} else {
			existing.fallbackDurationSeconds += durationSeconds;
		}
		existing.durationSeconds =
			unionIntervalSeconds(existing.intervals) +
			existing.fallbackDurationSeconds;
		if (!existing.jobNames.includes(jobName)) existing.jobNames.push(jobName);
		if (!existing.stepNames.includes(stepName))
			existing.stepNames.push(stepName);
	};

	for (const job of jobs) {
		const jobName = job.name ?? `job-${job.id ?? "unknown"}`;
		const jobPhase = phaseForJob(jobName);
		const jobDuration = secondsBetween(jobStartedAt(job), jobCompletedAt(job));
		if (jobPhase && jobDuration !== undefined) {
			add(
				jobPhase,
				jobName,
				"(whole job)",
				jobDuration,
				timestampInterval(jobStartedAt(job), jobCompletedAt(job)),
			);
		}
		for (const step of job.steps ?? []) {
			const stepName = step.name ?? `step-${step.number ?? "unknown"}`;
			const phase = phaseForStep(jobName, stepName);
			if (!phase) continue;
			const duration = secondsBetween(
				stepStartedAt(step),
				stepCompletedAt(step),
			);
			if (duration === undefined) continue;
			add(
				phase,
				jobName,
				stepName,
				duration,
				timestampInterval(stepStartedAt(step), stepCompletedAt(step)),
			);
		}
	}

	return new Map(
		Array.from(phases.entries()).map(([name, phase]) => [
			name,
			{
				durationSeconds:
					unionIntervalSeconds(phase.intervals) + phase.fallbackDurationSeconds,
				jobNames: phase.jobNames,
				name: phase.name,
				stepNames: phase.stepNames,
			},
		]),
	);
}

function criticalPathSeconds(jobs: GitHubJob[]): number {
	let startedAt: number | undefined;
	let completedAt: number | undefined;
	for (const job of jobs) {
		if (job.name?.toLowerCase().includes("canary build duration")) continue;
		const start = parseTimestamp(jobStartedAt(job));
		const end = parseTimestamp(jobCompletedAt(job));
		if (start !== undefined) startedAt = Math.min(startedAt ?? start, start);
		if (end !== undefined) completedAt = Math.max(completedAt ?? end, end);
		for (const step of job.steps ?? []) {
			const stepStart = parseTimestamp(stepStartedAt(step));
			const stepEnd = parseTimestamp(stepCompletedAt(step));
			if (stepStart !== undefined)
				startedAt = Math.min(startedAt ?? stepStart, stepStart);
			if (stepEnd !== undefined)
				completedAt = Math.max(completedAt ?? stepEnd, stepEnd);
		}
	}
	if (startedAt === undefined) return 0;
	return Math.max(0, ((completedAt ?? Date.now()) - startedAt) / 1000);
}

function artifactReadySeconds(jobs: GitHubJob[]): number {
	let startedAt: number | undefined;
	let artifactReadyAt: number | undefined;
	for (const job of jobs) {
		if (job.name?.toLowerCase().includes("canary build duration")) continue;
		const isArtifactJob = (job.steps ?? []).some((step) => {
			const stepName = (step.name ?? "").toLowerCase();
			return (
				stepName.includes("build electron app") ||
				stepName.includes("upload zip artifact") ||
				stepName.includes("upload auto-update manifest") ||
				stepName.includes("update canary release")
			);
		});
		if (!isArtifactJob) continue;
		const jobStart = parseTimestamp(jobStartedAt(job));
		if (jobStart !== undefined)
			startedAt = Math.min(startedAt ?? jobStart, jobStart);
		for (const step of job.steps ?? []) {
			const stepName = (step.name ?? "").toLowerCase();
			const stepStart = parseTimestamp(stepStartedAt(step));
			if (stepStart !== undefined)
				startedAt = Math.min(startedAt ?? stepStart, stepStart);
			if (
				stepName.includes("upload zip artifact") ||
				stepName.includes("upload auto-update manifest") ||
				stepName.includes("update canary release")
			) {
				const stepEnd = parseTimestamp(stepCompletedAt(step));
				if (stepEnd !== undefined)
					artifactReadyAt = Math.max(artifactReadyAt ?? stepEnd, stepEnd);
			}
		}
	}
	if (startedAt === undefined || artifactReadyAt === undefined) return 0;
	return Math.max(0, ((artifactReadyAt ?? Date.now()) - startedAt) / 1000);
}

export function evaluateCanaryBuildDuration(args: {
	budget: BuildDurationBudget;
	jobs: GitHubJob[];
	lane: CanaryBuildLane;
}): BuildDurationResult {
	const phases = Array.from(createPhaseMap(args.jobs).values()).sort(
		(left, right) => right.durationSeconds - left.durationSeconds,
	);
	const criticalSeconds = criticalPathSeconds(args.jobs);
	const readySeconds = artifactReadySeconds(args.jobs);
	const failures: BuildDurationFinding[] = [];
	const targetWarnings: BuildDurationFinding[] = [];

	if (args.jobs.length === 0) {
		failures.push({
			message: "No GitHub Actions jobs were available for duration evaluation.",
		});
	} else if (criticalSeconds === 0 && phases.length === 0) {
		failures.push({
			message:
				"No GitHub Actions job or step timestamps were available for duration evaluation.",
		});
	}

	const enforceArtifactReady = args.lane === "quick" && readySeconds > 0;
	const hardBudgetSeconds = enforceArtifactReady
		? readySeconds
		: criticalSeconds;
	const budgetLabel = enforceArtifactReady
		? "artifact-ready path"
		: "critical path";

	if (hardBudgetSeconds > args.budget.maxSeconds) {
		failures.push({
			message: `${args.lane} canary ${budgetLabel} ${formatSeconds(hardBudgetSeconds)} exceeds hard limit ${formatSeconds(args.budget.maxSeconds)}.`,
		});
	} else if (
		args.budget.targetSeconds !== undefined &&
		hardBudgetSeconds > args.budget.targetSeconds
	) {
		targetWarnings.push({
			message: `${args.lane} canary ${budgetLabel} ${formatSeconds(hardBudgetSeconds)} exceeds target ${formatSeconds(args.budget.targetSeconds)}.`,
		});
	}

	for (const [phase, maxSeconds] of Object.entries(
		args.budget.criticalPathMaxSeconds ?? {},
	)) {
		const summary = phases.find((candidate) => candidate.name === phase);
		if (!summary) continue;
		if (summary.durationSeconds > maxSeconds) {
			failures.push({
				phase,
				message: `${phase} ${formatSeconds(summary.durationSeconds)} exceeds hard limit ${formatSeconds(maxSeconds)}.`,
			});
		}
	}

	return {
		artifactReadySeconds: readySeconds,
		checkedJobs: args.jobs.length,
		criticalPathSeconds: criticalSeconds,
		failures,
		lane: args.lane,
		phases,
		targetWarnings,
	};
}

function formatSeconds(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds - minutes * 60);
	return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function relativeToRoot(path: string): string {
	const rel = relative(rootDir, path);
	return rel || basename(path);
}

async function fetchRunJobs(options: CliOptions): Promise<GitHubJob[]> {
	if (!options.owner || !options.repo || !options.runId || !options.token) {
		fail(
			"GitHub API mode requires --owner, --repo, --run-id, and GITHUB_TOKEN/--token, or pass --input.",
		);
	}
	const jobs: GitHubJob[] = [];
	let page = 1;
	for (;;) {
		const url = new URL(
			`https://api.github.com/repos/${options.owner}/${options.repo}/actions/runs/${options.runId}/jobs`,
		);
		url.searchParams.set("per_page", "100");
		url.searchParams.set("page", String(page));
		if (options.runAttempt !== undefined) {
			url.searchParams.set("filter", "latest");
		}
		const response = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${options.token}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
		if (!response.ok) {
			fail(
				`GitHub jobs API failed: ${response.status} ${await response.text()}`,
			);
		}
		const pageJson = (await response.json()) as GitHubJobsPage;
		const pageJobs = pageJson.jobs ?? [];
		jobs.push(
			...pageJobs.filter(
				(job) =>
					options.runAttempt === undefined ||
					job.run_attempt === undefined ||
					job.run_attempt === options.runAttempt,
			),
		);
		if (pageJobs.length < 100) break;
		page += 1;
	}
	return jobs;
}

function jobNameMatches(job: GitHubJob, patterns: string[]): boolean {
	const name = (job.name ?? "").toLowerCase();
	return patterns.some((pattern) => name.includes(pattern.toLowerCase()));
}

export function filterCanaryBuildDurationJobs(args: {
	excludeJobNamePatterns?: string[];
	includeJobNamePatterns?: string[];
	jobs: GitHubJob[];
}): GitHubJob[] {
	const includeJobNamePatterns = args.includeJobNamePatterns ?? [];
	const excludeJobNamePatterns = args.excludeJobNamePatterns ?? [];
	return args.jobs.filter((job) => {
		if (
			includeJobNamePatterns.length > 0 &&
			!jobNameMatches(job, includeJobNamePatterns)
		) {
			return false;
		}
		if (
			excludeJobNamePatterns.length > 0 &&
			jobNameMatches(job, excludeJobNamePatterns)
		) {
			return false;
		}
		return true;
	});
}

function printHumanReport(result: BuildDurationResult): void {
	console.log("# Desktop Canary Build Duration Check");
	console.log("");
	console.log(`- Lane: ${result.lane}`);
	console.log(`- Checked jobs: ${result.checkedJobs}`);
	console.log(
		`- Artifact ready: ${formatSeconds(result.artifactReadySeconds)}`,
	);
	console.log(`- Critical path: ${formatSeconds(result.criticalPathSeconds)}`);
	if (result.phases.length > 0) {
		console.log("");
		console.log("## Phase Timings");
		for (const phase of result.phases) {
			console.log(
				`- ${phase.name}: ${formatSeconds(phase.durationSeconds)} (${phase.jobNames.join(", ")}; ${phase.stepNames.join(", ")})`,
			);
		}
	}
	if (result.targetWarnings.length > 0) {
		console.log("");
		console.log("## Target Warnings");
		for (const warning of result.targetWarnings) {
			console.log(`- ${warning.message}`);
		}
	}
	if (result.failures.length > 0) {
		console.log("");
		console.log("## Failures");
		for (const failure of result.failures) {
			console.log(`- ${failure.message}`);
		}
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const lane = options.lane ?? inferLaneFromEnv();
	const budget = readBuildBudget(options.budgetPath, lane);
	const jobs = options.inputPath
		? normalizeJobs(readJsonFile(options.inputPath))
		: await fetchRunJobs(options);
	const result = evaluateCanaryBuildDuration({
		budget,
		jobs: filterCanaryBuildDurationJobs({
			excludeJobNamePatterns: options.excludeJobNamePatterns,
			includeJobNamePatterns: options.includeJobNamePatterns,
			jobs,
		}),
		lane,
	});
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		printHumanReport(result);
		if (options.inputPath) {
			console.log("");
			console.log(`Input: ${relativeToRoot(options.inputPath)}`);
		}
	}
	if (result.failures.length > 0) process.exit(1);
}

if (import.meta.main) {
	await main();
}
