import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

interface ByteBudget {
	maxBytes: number;
	targetBytes?: number;
}

interface CountBudget {
	max: number;
	target?: number;
}

interface MillisecondBudget {
	maxMs: number;
	targetMs?: number;
}

interface RuntimePerfBudget {
	startup?: {
		required?: boolean;
		maxRegressionPercent?: number;
		baselinePath?: string;
		marks?: Record<string, MillisecondBudget>;
	};
	runtime?: {
		processTree?: {
			desktopMemory?: ByteBudget;
			allMemory?: ByteBudget;
			desktopProcessCount?: CountBudget;
			allProcessCount?: CountBudget;
		};
		renderer?: {
			domNodes?: CountBudget;
			usedJsHeap?: ByteBudget;
			consoleErrors?: CountBudget;
		};
		routes?: {
			openDuration?: MillisecondBudget;
		};
	};
}

interface PerfBaseline {
	startup?: {
		measured?: boolean;
		marks?: Record<string, { elapsedMs: number }>;
	};
}

interface RuntimeReportLike {
	startup?: {
		report?: {
			marks?: Array<{ name: string; elapsedMs: number }>;
		};
		error?: string;
	};
	automation?: {
		renderer?: {
			nodeCount?: number;
			usedJsHeapSize?: number;
		};
		consoleErrors?: unknown[];
		error?: string;
	};
	routeMeasurements?: Array<{
		path: string;
		durationMs?: number;
		error?: string;
	}>;
	processSummary?: {
		desktop?: {
			maxMemoryBytes?: number;
			maxCount?: number;
		};
		all?: {
			maxMemoryBytes?: number;
			maxCount?: number;
		};
	};
}

interface CliOptions {
	baselinePath?: string;
	budgetPath: string;
	json: boolean;
	reportDir: string;
	reportPaths: string[];
	requireReport: boolean;
}

interface RuntimeBudgetFinding {
	reportPath: string;
	message: string;
}

interface RuntimeBudgetResult {
	checkedReports: string[];
	failures: RuntimeBudgetFinding[];
	warnings: RuntimeBudgetFinding[];
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");

function fail(message: string): never {
	console.error(`[check-runtime-budget] ${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		budgetPath: resolve(desktopDir, "perf-budget.json"),
		json: false,
		reportDir: resolve(desktopDir, "performance-reports"),
		reportPaths: [],
		requireReport: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--require-report") {
			options.requireReport = true;
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
		if (arg === "--baseline") {
			const value = argv[index + 1];
			if (!value) fail("--baseline requires a value");
			options.baselinePath = resolve(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--baseline=")) {
			options.baselinePath = resolve(arg.slice("--baseline=".length));
			continue;
		}
		if (arg === "--report") {
			const value = argv[index + 1];
			if (!value) fail("--report requires a value");
			options.reportPaths.push(resolve(value));
			index += 1;
			continue;
		}
		if (arg.startsWith("--report=")) {
			options.reportPaths.push(resolve(arg.slice("--report=".length)));
			continue;
		}
		if (arg === "--report-dir") {
			const value = argv[index + 1];
			if (!value) fail("--report-dir requires a value");
			options.reportDir = resolve(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--report-dir=")) {
			options.reportDir = resolve(arg.slice("--report-dir=".length));
			continue;
		}
		fail(`Unknown argument: ${arg}`);
	}

	return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(path: string): unknown {
	if (!existsSync(path)) {
		fail(`File not found: ${path}`);
	}
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
	if (!isRecord(value)) fail(`Invalid budget: ${path} must be an object`);
	return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function optionalNumber(
	value: unknown,
	path: string,
	{ allowZero = false }: { allowZero?: boolean } = {},
): number | undefined {
	if (value === undefined) return undefined;
	const minimum = allowZero ? 0 : 0;
	const invalid =
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < minimum ||
		(!allowZero && value === 0);
	if (invalid) {
		fail(
			`Invalid budget: ${path} must be ${allowZero ? "0 or greater" : "a positive number"}`,
		);
	}
	return value;
}

function readByteBudget(value: unknown, path: string): ByteBudget | undefined {
	if (value === undefined) return undefined;
	const record = requireRecord(value, path);
	const maxBytes = optionalNumber(record.maxBytes, `${path}.maxBytes`);
	if (maxBytes === undefined)
		fail(`Invalid budget: ${path}.maxBytes is required`);
	const targetBytes = optionalNumber(record.targetBytes, `${path}.targetBytes`);
	return {
		maxBytes,
		...(targetBytes !== undefined && { targetBytes }),
	};
}

function readCountBudget(
	value: unknown,
	path: string,
): CountBudget | undefined {
	if (value === undefined) return undefined;
	const record = requireRecord(value, path);
	const max = optionalNumber(record.max, `${path}.max`, { allowZero: true });
	if (max === undefined) fail(`Invalid budget: ${path}.max is required`);
	const target = optionalNumber(record.target, `${path}.target`, {
		allowZero: true,
	});
	return {
		max,
		...(target !== undefined && { target }),
	};
}

function readMillisecondBudget(
	value: unknown,
	path: string,
): MillisecondBudget | undefined {
	if (value === undefined) return undefined;
	const record = requireRecord(value, path);
	const maxMs = optionalNumber(record.maxMs, `${path}.maxMs`);
	if (maxMs === undefined) fail(`Invalid budget: ${path}.maxMs is required`);
	const targetMs = optionalNumber(record.targetMs, `${path}.targetMs`);
	return {
		maxMs,
		...(targetMs !== undefined && { targetMs }),
	};
}

function readRuntimePerfBudget(budgetPath: string): RuntimePerfBudget {
	const raw = readJsonFile(budgetPath);
	const root = requireRecord(raw, "root");
	const startup = optionalRecord(root.startup);
	const runtime = optionalRecord(root.runtime);
	const result: RuntimePerfBudget = {};

	if (startup) {
		const marksRaw = optionalRecord(startup.marks);
		const marks: Record<string, MillisecondBudget> = {};
		if (marksRaw) {
			for (const [name, value] of Object.entries(marksRaw)) {
				const budget = readMillisecondBudget(value, `startup.marks.${name}`);
				if (budget) marks[name] = budget;
			}
		}
		result.startup = {
			required: startup.required === true,
			...(typeof startup.maxRegressionPercent === "number" && {
				maxRegressionPercent: startup.maxRegressionPercent,
			}),
			...(typeof startup.baselinePath === "string" && {
				baselinePath: startup.baselinePath,
			}),
			...(Object.keys(marks).length > 0 && { marks }),
		};
	}

	if (runtime) {
		const processTree = optionalRecord(runtime.processTree);
		const renderer = optionalRecord(runtime.renderer);
		const routes = optionalRecord(runtime.routes);
		result.runtime = {
			...(processTree && {
				processTree: {
					desktopMemory: readByteBudget(
						processTree.desktopMemory,
						"runtime.processTree.desktopMemory",
					),
					allMemory: readByteBudget(
						processTree.allMemory,
						"runtime.processTree.allMemory",
					),
					desktopProcessCount: readCountBudget(
						processTree.desktopProcessCount,
						"runtime.processTree.desktopProcessCount",
					),
					allProcessCount: readCountBudget(
						processTree.allProcessCount,
						"runtime.processTree.allProcessCount",
					),
				},
			}),
			...(renderer && {
				renderer: {
					domNodes: readCountBudget(
						renderer.domNodes,
						"runtime.renderer.domNodes",
					),
					usedJsHeap: readByteBudget(
						renderer.usedJsHeap,
						"runtime.renderer.usedJsHeap",
					),
					consoleErrors: readCountBudget(
						renderer.consoleErrors,
						"runtime.renderer.consoleErrors",
					),
				},
			}),
			...(routes && {
				routes: {
					openDuration: readMillisecondBudget(
						routes.openDuration,
						"runtime.routes.openDuration",
					),
				},
			}),
		};
	}

	return result;
}

function readPerfBaseline(path: string | undefined): PerfBaseline | undefined {
	if (!path || !existsSync(path)) return undefined;
	const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!isRecord(raw)) return undefined;
	const startup = optionalRecord(raw.startup);
	const measured = startup?.measured === true;
	const marksRaw = optionalRecord(startup?.marks);
	const marks: Record<string, { elapsedMs: number }> = {};
	for (const [name, value] of Object.entries(marksRaw ?? {})) {
		if (!isRecord(value)) continue;
		if (
			typeof value.elapsedMs !== "number" ||
			!Number.isFinite(value.elapsedMs)
		) {
			continue;
		}
		marks[name] = { elapsedMs: value.elapsedMs };
	}
	return Object.keys(marks).length > 0
		? { startup: { marks, measured } }
		: undefined;
}

function collectReportPaths(options: CliOptions): string[] {
	if (options.reportPaths.length > 0) return options.reportPaths;
	if (!existsSync(options.reportDir)) return [];
	const stats = lstatSync(options.reportDir);
	if (!stats.isDirectory()) return [];
	return readdirSync(options.reportDir)
		.filter((name) => /^runtime-performance-.+\.json$/.test(name))
		.map((name) => join(options.reportDir, name))
		.sort((left, right) => left.localeCompare(right));
}

function resolveBaselinePath(
	options: CliOptions,
	budget: RuntimePerfBudget,
): string | undefined {
	if (options.baselinePath) return options.baselinePath;
	const configured = budget.startup?.baselinePath;
	if (!configured) return undefined;
	return isAbsolute(configured) ? configured : resolve(desktopDir, configured);
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMs(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function relativeToRoot(path: string): string {
	const rel = relative(rootDir, path);
	return rel || basename(path);
}

function markMap(report: RuntimeReportLike): Map<string, number> {
	const marks = report.startup?.report?.marks ?? [];
	const map = new Map<string, number>();
	for (const mark of marks) map.set(mark.name, mark.elapsedMs);
	return map;
}

function pushMetricFinding(args: {
	budget: ByteBudget | CountBudget | MillisecondBudget;
	failures: RuntimeBudgetFinding[];
	format: (value: number) => string;
	label: string;
	reportPath: string;
	value: number | undefined;
	warnings: RuntimeBudgetFinding[];
}): void {
	if (args.value === undefined || !Number.isFinite(args.value)) {
		args.warnings.push({
			reportPath: args.reportPath,
			message: `${args.label} is unavailable in report.`,
		});
		return;
	}

	if ("maxBytes" in args.budget) {
		if (args.value > args.budget.maxBytes) {
			args.failures.push({
				reportPath: args.reportPath,
				message: `${args.label} ${args.format(args.value)} exceeds hard limit ${args.format(args.budget.maxBytes)}.`,
			});
			return;
		}
		if (
			args.budget.targetBytes !== undefined &&
			args.value > args.budget.targetBytes
		) {
			args.warnings.push({
				reportPath: args.reportPath,
				message: `${args.label} ${args.format(args.value)} exceeds target ${args.format(args.budget.targetBytes)}.`,
			});
		}
		return;
	}

	if ("maxMs" in args.budget) {
		if (args.value > args.budget.maxMs) {
			args.failures.push({
				reportPath: args.reportPath,
				message: `${args.label} ${args.format(args.value)} exceeds hard limit ${args.format(args.budget.maxMs)}.`,
			});
			return;
		}
		if (
			args.budget.targetMs !== undefined &&
			args.value > args.budget.targetMs
		) {
			args.warnings.push({
				reportPath: args.reportPath,
				message: `${args.label} ${args.format(args.value)} exceeds target ${args.format(args.budget.targetMs)}.`,
			});
		}
		return;
	}

	if (args.value > args.budget.max) {
		args.failures.push({
			reportPath: args.reportPath,
			message: `${args.label} ${args.value} exceeds hard limit ${args.budget.max}.`,
		});
		return;
	}
	if (args.budget.target !== undefined && args.value > args.budget.target) {
		args.warnings.push({
			reportPath: args.reportPath,
			message: `${args.label} ${args.value} exceeds target ${args.budget.target}.`,
		});
	}
}

export function evaluateRuntimeBudget(args: {
	baseline?: PerfBaseline;
	budget: RuntimePerfBudget;
	report: RuntimeReportLike;
	reportPath: string;
}): Pick<RuntimeBudgetResult, "failures" | "warnings"> {
	const failures: RuntimeBudgetFinding[] = [];
	const warnings: RuntimeBudgetFinding[] = [];
	const startupRequired = args.budget.startup?.required === true;
	const startupReport = args.report.startup?.report;
	if (!startupReport) {
		const message = args.report.startup?.error
			? `Startup capture unavailable: ${args.report.startup.error}`
			: "Startup capture is missing.";
		(startupRequired ? failures : warnings).push({
			reportPath: args.reportPath,
			message,
		});
	} else {
		const marks = markMap(args.report);
		for (const [name, markBudget] of Object.entries(
			args.budget.startup?.marks ?? {},
		)) {
			const elapsedMs = marks.get(name);
			pushMetricFinding({
				budget: markBudget,
				failures,
				format: formatMs,
				label: `Startup mark ${name}`,
				reportPath: args.reportPath,
				value: elapsedMs,
				warnings,
			});

			const baselineElapsed = args.baseline?.startup?.marks?.[name]?.elapsedMs;
			const maxRegressionPercent = args.budget.startup?.maxRegressionPercent;
			if (
				elapsedMs !== undefined &&
				baselineElapsed !== undefined &&
				maxRegressionPercent !== undefined
			) {
				if (args.baseline?.startup?.measured !== true) {
					warnings.push({
						reportPath: args.reportPath,
						message: `Startup mark ${name} has an unmeasured baseline; checked hard limit only. Record a measured baseline to enable the ${maxRegressionPercent}% regression gate.`,
					});
					continue;
				}
				const maxAllowed = baselineElapsed * (1 + maxRegressionPercent / 100);
				if (elapsedMs > maxAllowed) {
					failures.push({
						reportPath: args.reportPath,
						message: `Startup mark ${name} ${formatMs(elapsedMs)} regressed more than ${maxRegressionPercent}% from baseline ${formatMs(baselineElapsed)}.`,
					});
				}
			}
		}
	}

	const processTree = args.budget.runtime?.processTree;
	if (processTree?.desktopMemory) {
		pushMetricFinding({
			budget: processTree.desktopMemory,
			failures,
			format: formatBytes,
			label: "Desktop process-tree max memory",
			reportPath: args.reportPath,
			value: args.report.processSummary?.desktop?.maxMemoryBytes,
			warnings,
		});
	}
	if (processTree?.allMemory) {
		pushMetricFinding({
			budget: processTree.allMemory,
			failures,
			format: formatBytes,
			label: "All tracked process max memory",
			reportPath: args.reportPath,
			value: args.report.processSummary?.all?.maxMemoryBytes,
			warnings,
		});
	}
	if (processTree?.desktopProcessCount) {
		pushMetricFinding({
			budget: processTree.desktopProcessCount,
			failures,
			format: (value) => String(Math.round(value)),
			label: "Desktop process-tree max process count",
			reportPath: args.reportPath,
			value: args.report.processSummary?.desktop?.maxCount,
			warnings,
		});
	}
	if (processTree?.allProcessCount) {
		pushMetricFinding({
			budget: processTree.allProcessCount,
			failures,
			format: (value) => String(Math.round(value)),
			label: "All tracked process max process count",
			reportPath: args.reportPath,
			value: args.report.processSummary?.all?.maxCount,
			warnings,
		});
	}

	const renderer = args.budget.runtime?.renderer;
	if (renderer?.domNodes) {
		pushMetricFinding({
			budget: renderer.domNodes,
			failures,
			format: (value) => String(Math.round(value)),
			label: "Renderer DOM node count",
			reportPath: args.reportPath,
			value: args.report.automation?.renderer?.nodeCount,
			warnings,
		});
	}
	if (renderer?.usedJsHeap) {
		pushMetricFinding({
			budget: renderer.usedJsHeap,
			failures,
			format: formatBytes,
			label: "Renderer used JS heap",
			reportPath: args.reportPath,
			value: args.report.automation?.renderer?.usedJsHeapSize,
			warnings,
		});
	}
	if (renderer?.consoleErrors) {
		pushMetricFinding({
			budget: renderer.consoleErrors,
			failures,
			format: (value) => String(Math.round(value)),
			label: "Renderer console error count",
			reportPath: args.reportPath,
			value: args.report.automation?.consoleErrors?.length,
			warnings,
		});
	}

	const routeBudget = args.budget.runtime?.routes?.openDuration;
	if (routeBudget) {
		for (const route of args.report.routeMeasurements ?? []) {
			if (route.error) {
				failures.push({
					reportPath: args.reportPath,
					message: `Route ${route.path} measurement failed: ${route.error}`,
				});
				continue;
			}
			pushMetricFinding({
				budget: routeBudget,
				failures,
				format: formatMs,
				label: `Route ${route.path} open duration`,
				reportPath: args.reportPath,
				value: route.durationMs,
				warnings,
			});
		}
	}

	return { failures, warnings };
}

function checkRuntimeBudget(options: CliOptions): RuntimeBudgetResult {
	const budget = readRuntimePerfBudget(options.budgetPath);
	const baseline = readPerfBaseline(resolveBaselinePath(options, budget));
	const reportPaths = collectReportPaths(options);
	const failures: RuntimeBudgetFinding[] = [];
	const warnings: RuntimeBudgetFinding[] = [];

	if (reportPaths.length === 0) {
		const message =
			options.reportPaths.length > 0
				? "No runtime report files matched the provided --report arguments."
				: `No runtime reports found in ${relativeToRoot(options.reportDir)}. Run report:runtime first or pass --report=<path>.`;
		(options.requireReport ? failures : warnings).push({
			reportPath: options.reportDir,
			message,
		});
	}

	for (const reportPath of reportPaths) {
		const report = readJsonFile(reportPath) as RuntimeReportLike;
		const result = evaluateRuntimeBudget({
			baseline,
			budget,
			report,
			reportPath,
		});
		failures.push(...result.failures);
		warnings.push(...result.warnings);
	}

	return { checkedReports: reportPaths, failures, warnings };
}

function printHumanReport(result: RuntimeBudgetResult): void {
	console.log("# Desktop Runtime Budget Check");
	console.log("");
	if (result.checkedReports.length === 0) {
		console.log("- No runtime reports checked.");
	} else {
		console.log("## Reports");
		for (const reportPath of result.checkedReports) {
			console.log(`- \`${relativeToRoot(reportPath)}\``);
		}
	}

	if (result.warnings.length > 0) {
		console.log("");
		console.log("## Warnings");
		for (const warning of result.warnings) {
			console.log(
				`- \`${relativeToRoot(warning.reportPath)}\`: ${warning.message}`,
			);
		}
	}

	if (result.failures.length > 0) {
		console.log("");
		console.log("## Failures");
		for (const failure of result.failures) {
			console.log(
				`- \`${relativeToRoot(failure.reportPath)}\`: ${failure.message}`,
			);
		}
	}
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));
	const result = checkRuntimeBudget(options);
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		printHumanReport(result);
	}
	if (result.failures.length > 0) {
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
