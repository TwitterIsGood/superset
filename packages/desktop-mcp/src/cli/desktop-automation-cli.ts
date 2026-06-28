import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { config } from "dotenv";
import {
	type ConsoleLogsOptions,
	DesktopAutomation,
	type DomElement,
	type ScreenshotRect,
	type ScreenshotResult,
	type WaitForOptions,
	type WaitForResult,
	type WindowInfo,
} from "../automation/index.js";
import {
	formatVisualStabilityReport,
	normalizeVisualStabilityThresholds,
	type VisualStabilityAction,
	type VisualStabilityOptions,
	type VisualStabilityReport,
	type VisualStabilityThresholdInput,
} from "../automation/visual-stability.js";
import type { ConsoleLogEntry } from "../zod.js";
import {
	getBooleanFlag,
	getIntegerFlag,
	getNumberFlag,
	getStringFlag,
	getStringListFlag,
	type ParsedCliArgs,
	parseCliArgs,
} from "./args.js";

const HELP = `Desktop automation CLI

Usage:
  bun run desktop:automation -- <command> [options]

Commands:
  window-info                         Print current app URL, viewport, focus state
  inspect-dom [--interactive-only]    Print visible DOM elements
  wait-for --url-includes <text>      Wait for URL/text/selector/test-id readiness
  screenshot --path <file.png>        Save a screenshot artifact
  click [--selector|--text|--test-id] Click an element or --x/--y coordinates
  type-text --text <text>             Type text, optionally into --selector
  send-keys --keys Meta,t             Send a key chord
  console-logs [--level error]        Print buffered renderer console logs
  evaluate-js --code <js>             Evaluate JavaScript in the renderer
  navigate --path /settings           Navigate by hash path, or use --url
  smoke                               Run a Trellis-friendly desktop smoke
  visual-stability                    Detect flicker, blanking, remounts, layout jumps

Common:
  --json                              Print JSON instead of text

Smoke example:
  bun run desktop:automation -- smoke \\
    --url-includes "#/sign-in" \\
    --screenshot .trellis/tasks/<task>/artifacts/sign-in.png \\
    --report .trellis/tasks/<task>/artifacts/sign-in-smoke.json

Visual stability example:
  bun run desktop:automation -- visual-stability \\
    --click-text "Workspaces" \\
    --wait-url-includes "#/v2-workspaces" \\
    --persist-selector "app > div:nth-of-type(1)" \\
    --measure-selector "app > div:nth-of-type(1) > div:nth-of-type(1)" \\
    --sample-ms 800 \\
    --report .trellis/tasks/<task>/artifacts/workspaces-visual-stability.json
`;

const VISUAL_STABILITY_HELP = `Desktop automation visual-stability

Usage:
  bun run desktop:automation -- visual-stability [action] [observation] [thresholds] [artifacts]

Actions, choose exactly one:
  --click-selector <css>
  --click-text <text>
  --click-test-id <id>
  --click-x <number> --click-y <number>
  --navigate-path <path>
  --navigate-url <url>
  --action-js <code>

Readiness:
  --wait-url-includes <text>
  --wait-selector <css>
  --wait-text <text>
  --wait-test-id <id>
  --timeout-ms <ms>

Observation:
  --persist-selector <css>       Repeatable. Selector must stay mounted.
  --measure-selector <css>       Repeatable. Bounds are sampled for movement/resize.
  --churn-root-selector <css>    Repeatable. Defaults to body.
  --blank-rect x,y,width,height  Optional screenshot region for blank-frame checks.
  --sample-ms <ms>               Default 800.
  --sample-interval-ms <ms>      Default 50.

Thresholds:
  --max-removals <n>             Default 0.
  --max-layout-shift-px <n>      Default 2.
  --max-size-shift-px <n>        Default 2.
  --max-blank-frames <n>         Default 0.
  --blank-threshold <ratio>      Default 0.985.
  --max-dom-added <n>
  --max-dom-removed <n>
  --fail-on-console-error=false

Artifacts:
  --report <file.json>
  --before-screenshot <file.png>
  --after-screenshot <file.png>
  --failed-frame-dir <dir>

Example:
  DESKTOP_AUTOMATION_PORT=<port> bun run desktop:automation -- visual-stability \\
    --click-text "Workspaces" \\
    --wait-url-includes "#/v2-workspaces" \\
    --persist-selector "app > div:nth-of-type(1)" \\
    --measure-selector "app > div:nth-of-type(1) > div:nth-of-type(1)" \\
    --sample-ms 800 \\
    --report .trellis/tasks/<task>/artifacts/workspaces-visual-stability.json
`;

interface CliIO {
	write: (message: string) => void;
	writeError: (message: string) => void;
}

interface SmokeReport {
	startedAt: string;
	completedAt: string;
	windowInfo: WindowInfo;
	wait?: WaitForResult;
	dom: DomElement[];
	screenshot?: Omit<ScreenshotResult, "image">;
	consoleLogs: ConsoleLogEntry[];
}

const LEVEL_NAMES: Record<number, string> = {
	0: "DEBUG",
	1: "LOG",
	2: "WARN",
	3: "ERROR",
};

export function resolveWorkspaceJsonPath(
	path: string,
	cwd = process.cwd(),
): string {
	const resolvedCwd = resolve(cwd);
	const resolvedPath = isAbsolute(path)
		? resolve(path)
		: resolve(resolvedCwd, path);
	if (
		resolvedPath !== resolvedCwd &&
		!resolvedPath.startsWith(`${resolvedCwd}/`)
	) {
		throw new Error(
			`Report path must stay inside the repository workspace: ${path}`,
		);
	}
	if (!resolvedPath.endsWith(".json")) {
		throw new Error("Report path must end with .json");
	}
	return resolvedPath;
}

function parseRect(value: string | undefined): ScreenshotRect | undefined {
	if (!value) return undefined;
	const [x, y, width, height] = value.split(",").map(Number);
	if (
		x === undefined ||
		y === undefined ||
		width === undefined ||
		height === undefined ||
		![x, y, width, height].every(Number.isFinite)
	) {
		throw new Error("--rect must be x,y,width,height");
	}
	return { x, y, width, height };
}

function parseKeys(args: ParsedCliArgs): string[] {
	const flag = getStringFlag(args, "keys");
	const rawKeys = flag ? flag.split(",") : args.positionals;
	const keys = rawKeys.map((key) => key.trim()).filter(Boolean);
	if (keys.length === 0)
		throw new Error("send-keys requires --keys or positionals");
	return keys;
}

function waitOptionsFromArgs(args: ParsedCliArgs): WaitForOptions {
	const options: WaitForOptions = {
		selector: getStringFlag(args, "selector"),
		text: getStringFlag(args, "text"),
		testId: getStringFlag(args, "test-id"),
		urlIncludes: getStringFlag(args, "url-includes"),
		absent: getBooleanFlag(args, "absent"),
		fuzzy: !getBooleanFlag(args, "exact"),
		timeoutMs: getIntegerFlag(args, "timeout-ms"),
	};
	if (
		!options.selector &&
		!options.text &&
		!options.testId &&
		!options.urlIncludes
	) {
		throw new Error(
			"wait-for requires --url-includes, --selector, --text, or --test-id",
		);
	}
	return options;
}

function consoleOptionsFromArgs(args: ParsedCliArgs): ConsoleLogsOptions {
	const level = getStringFlag(args, "level") as ConsoleLogsOptions["level"];
	return {
		level,
		limit: getIntegerFlag(args, "limit"),
		clear: getBooleanFlag(args, "clear"),
	};
}

function textOrJson(
	args: ParsedCliArgs,
	value: unknown,
	formatter: () => string,
): string {
	return getBooleanFlag(args, "json")
		? JSON.stringify(value, null, 2)
		: formatter();
}

function formatWindowInfo(info: WindowInfo): string {
	return [
		`Title: ${info.title}`,
		`URL: ${info.url}`,
		`Viewport: ${info.viewportWidth}x${info.viewportHeight}`,
		`Focused: ${info.focused}`,
	].join("\n");
}

function formatDomElements(elements: DomElement[]): string {
	if (elements.length === 0) return "No elements found";
	return elements
		.map((el) => {
			const attrs = [
				el.interactive ? "interactive" : "",
				el.disabled ? "disabled" : "",
				el.focused ? "focused" : "",
				el.role ? `role=${el.role}` : "",
				el.testId ? `testid=${el.testId}` : "",
			]
				.filter(Boolean)
				.join(", ");
			return `[${el.tag}] ${el.selector}${el.text ? ` - "${el.text.slice(0, 80)}"` : ""}${attrs ? ` (${attrs})` : ""} @ ${el.bounds.x},${el.bounds.y} ${el.bounds.width}x${el.bounds.height}`;
		})
		.join("\n");
}

function formatWaitResult(result: WaitForResult): string {
	if (result.kind === "url") return `Wait condition satisfied: ${result.url}`;
	if (result.kind === "element") {
		return `Wait condition satisfied: <${result.tag}> ${result.selector} "${result.text ?? ""}"`;
	}
	return "Wait condition satisfied: condition absent";
}

function formatConsoleLogs(logs: ConsoleLogEntry[]): string {
	if (logs.length === 0) return "No console logs";
	return logs
		.map((log) => {
			const level = LEVEL_NAMES[log.level] ?? String(log.level);
			const time = new Date(log.timestamp).toISOString().slice(11, 23);
			return `[${time}] ${level}: ${log.message}`;
		})
		.join("\n");
}

function screenshotSummary(screenshot: ScreenshotResult) {
	return {
		path: screenshot.path,
		width: screenshot.width,
		height: screenshot.height,
	};
}

async function writeJsonFile(path: string, data: unknown): Promise<string> {
	const resolvedPath = resolveWorkspaceJsonPath(path);
	await mkdir(dirname(resolvedPath), { recursive: true });
	await writeFile(resolvedPath, `${JSON.stringify(data, null, 2)}\n`);
	return resolvedPath;
}

function requirePositiveInteger(
	value: number | undefined,
	fallback: number,
): number {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved <= 0) {
		throw new Error("visual-stability timing values must be positive integers");
	}
	return resolved;
}

function parseVisualStabilityAction(
	args: ParsedCliArgs,
): VisualStabilityAction {
	const hasClickTarget = Boolean(
		getStringFlag(args, "click-selector") ||
			getStringFlag(args, "click-text") ||
			getStringFlag(args, "click-test-id") ||
			getNumberFlag(args, "click-x") !== undefined ||
			getNumberFlag(args, "click-y") !== undefined,
	);
	const hasNavigateTarget = Boolean(
		getStringFlag(args, "navigate-path") || getStringFlag(args, "navigate-url"),
	);
	const actionJs = getStringFlag(args, "action-js");
	const actionCount =
		(hasClickTarget ? 1 : 0) + (hasNavigateTarget ? 1 : 0) + (actionJs ? 1 : 0);
	if (actionCount !== 1) {
		throw new Error(
			"visual-stability requires exactly one action: click, navigate, or --action-js",
		);
	}

	if (hasClickTarget) {
		const x = getNumberFlag(args, "click-x");
		const y = getNumberFlag(args, "click-y");
		if ((x === undefined) !== (y === undefined)) {
			throw new Error(
				"visual-stability coordinate clicks require both --click-x and --click-y",
			);
		}
		return {
			kind: "click",
			selector: getStringFlag(args, "click-selector"),
			text: getStringFlag(args, "click-text"),
			testId: getStringFlag(args, "click-test-id"),
			x,
			y,
			index: getIntegerFlag(args, "click-index"),
			fuzzy: !getBooleanFlag(args, "exact"),
		};
	}

	if (hasNavigateTarget) {
		return {
			kind: "navigate",
			path: getStringFlag(args, "navigate-path"),
			url: getStringFlag(args, "navigate-url"),
		};
	}

	return {
		kind: "evaluate-js",
		code: actionJs ?? "",
	};
}

function parseVisualStabilityWait(
	args: ParsedCliArgs,
): VisualStabilityOptions["wait"] {
	const wait = {
		selector: getStringFlag(args, "wait-selector"),
		text: getStringFlag(args, "wait-text"),
		testId: getStringFlag(args, "wait-test-id"),
		urlIncludes: getStringFlag(args, "wait-url-includes"),
		fuzzy: !getBooleanFlag(args, "wait-exact"),
		timeoutMs: getIntegerFlag(args, "timeout-ms"),
	};
	return wait.selector || wait.text || wait.testId || wait.urlIncludes
		? wait
		: undefined;
}

function parseVisualStabilityThresholds(args: ParsedCliArgs) {
	const input: VisualStabilityThresholdInput = {
		maxRemovals: getIntegerFlag(args, "max-removals"),
		maxLayoutShiftPx: getNumberFlag(args, "max-layout-shift-px"),
		maxSizeShiftPx: getNumberFlag(args, "max-size-shift-px"),
		maxBlankFrames: getIntegerFlag(args, "max-blank-frames"),
		blankThreshold: getNumberFlag(args, "blank-threshold"),
		maxDomAdded: getIntegerFlag(args, "max-dom-added"),
		maxDomRemoved: getIntegerFlag(args, "max-dom-removed"),
		failOnConsoleError: getBooleanFlag(args, "fail-on-console-error", true),
	};
	return normalizeVisualStabilityThresholds(input);
}

export function parseVisualStabilityCliOptions(args: ParsedCliArgs): {
	options: VisualStabilityOptions;
	reportPath?: string;
} {
	const reportPath = getStringFlag(args, "report");
	return {
		options: {
			action: parseVisualStabilityAction(args),
			wait: parseVisualStabilityWait(args),
			persistSelectors: getStringListFlag(args, "persist-selector"),
			measureSelectors: getStringListFlag(args, "measure-selector"),
			churnRootSelectors: getStringListFlag(args, "churn-root-selector"),
			blankRect: parseRect(getStringFlag(args, "blank-rect")),
			sampleMs: requirePositiveInteger(getIntegerFlag(args, "sample-ms"), 800),
			sampleIntervalMs: requirePositiveInteger(
				getIntegerFlag(args, "sample-interval-ms"),
				50,
			),
			thresholds: parseVisualStabilityThresholds(args),
			artifacts: {
				beforeScreenshotPath: getStringFlag(args, "before-screenshot"),
				afterScreenshotPath: getStringFlag(args, "after-screenshot"),
				failedFrameDir: getStringFlag(args, "failed-frame-dir"),
			},
		},
		...(reportPath ? { reportPath } : {}),
	};
}

async function runVisualStability(
	automation: DesktopAutomation,
	args: ParsedCliArgs,
): Promise<VisualStabilityReport> {
	const parsed = parseVisualStabilityCliOptions(args);
	const report = await automation.runVisualStabilityCheck(parsed.options);
	if (!parsed.reportPath) return report;
	const reportPath = resolveWorkspaceJsonPath(parsed.reportPath);
	const reportWithPath = {
		...report,
		artifacts: {
			...report.artifacts,
			reportPath,
		},
	};
	await writeJsonFile(parsed.reportPath, reportWithPath);
	return reportWithPath;
}

async function runSmoke(
	automation: DesktopAutomation,
	args: ParsedCliArgs,
): Promise<SmokeReport & { reportPath?: string }> {
	const startedAt = new Date().toISOString();
	const windowInfo = await automation.getWindowInfo();
	const hasWait =
		getStringFlag(args, "selector") ||
		getStringFlag(args, "text") ||
		getStringFlag(args, "test-id") ||
		getStringFlag(args, "url-includes");
	const wait = hasWait
		? await automation.waitFor(waitOptionsFromArgs(args))
		: undefined;
	const dom = await automation.inspectDom({
		selector: getStringFlag(args, "dom-selector"),
		interactiveOnly: getBooleanFlag(args, "interactive-only", true),
	});
	const screenshotPath = getStringFlag(args, "screenshot");
	const screenshot = screenshotPath
		? await automation.takeScreenshot({ path: screenshotPath })
		: undefined;
	const consoleLogs = await automation.getConsoleLogs(
		consoleOptionsFromArgs(args),
	);
	const completedAt = new Date().toISOString();
	const report: SmokeReport = {
		startedAt,
		completedAt,
		windowInfo,
		...(wait ? { wait } : {}),
		dom,
		...(screenshot ? { screenshot: screenshotSummary(screenshot) } : {}),
		consoleLogs,
	};
	const reportPath = getStringFlag(args, "report");
	if (!reportPath) return report;
	return { ...report, reportPath: await writeJsonFile(reportPath, report) };
}

async function runCommand(
	automation: DesktopAutomation,
	args: ParsedCliArgs,
): Promise<unknown> {
	switch (args.command) {
		case "help":
		case "--help":
		case "-h":
			return HELP;
		case "window-info":
			return automation.getWindowInfo();
		case "inspect-dom":
			return automation.inspectDom({
				selector: getStringFlag(args, "selector"),
				interactiveOnly: getBooleanFlag(args, "interactive-only"),
			});
		case "wait-for":
			return automation.waitFor(waitOptionsFromArgs(args));
		case "screenshot":
			return automation.takeScreenshot({
				path: getStringFlag(args, "path"),
				rect: parseRect(getStringFlag(args, "rect")),
			});
		case "click":
			return automation.click({
				selector: getStringFlag(args, "selector"),
				text: getStringFlag(args, "text"),
				testId: getStringFlag(args, "test-id"),
				x: getNumberFlag(args, "x"),
				y: getNumberFlag(args, "y"),
				index: getIntegerFlag(args, "index"),
				fuzzy: !getBooleanFlag(args, "exact"),
			});
		case "type-text": {
			const text = getStringFlag(args, "text") ?? args.positionals.join(" ");
			if (!text)
				throw new Error("type-text requires --text or positional text");
			return automation.typeText({
				text,
				selector: getStringFlag(args, "selector"),
				clearFirst: getBooleanFlag(args, "clear-first"),
			});
		}
		case "send-keys":
			return automation.sendKeys({ keys: parseKeys(args) });
		case "console-logs":
			return automation.getConsoleLogs(consoleOptionsFromArgs(args));
		case "evaluate-js": {
			const code = getStringFlag(args, "code") ?? args.positionals.join(" ");
			if (!code)
				throw new Error("evaluate-js requires --code or positional code");
			return automation.evaluateJs(code);
		}
		case "navigate":
			return automation.navigate({
				url: getStringFlag(args, "url"),
				path: getStringFlag(args, "path"),
			});
		case "smoke":
			return runSmoke(automation, args);
		case "visual-stability":
			if (getBooleanFlag(args, "help")) return VISUAL_STABILITY_HELP;
			return runVisualStability(automation, args);
		default:
			throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
	}
}

function formatResult(args: ParsedCliArgs, result: unknown): string {
	switch (args.command) {
		case "help":
		case "--help":
		case "-h":
			return String(result);
		case "window-info":
			return textOrJson(args, result, () =>
				formatWindowInfo(result as WindowInfo),
			);
		case "inspect-dom":
			return textOrJson(args, result, () =>
				formatDomElements(result as DomElement[]),
			);
		case "wait-for":
			return textOrJson(args, result, () =>
				formatWaitResult(result as WaitForResult),
			);
		case "screenshot": {
			const screenshot = result as ScreenshotResult;
			return textOrJson(args, screenshotSummary(screenshot), () =>
				screenshot.path
					? `Saved screenshot to ${screenshot.path}`
					: `Captured screenshot ${screenshot.width}x${screenshot.height}`,
			);
		}
		case "click":
		case "type-text":
		case "send-keys":
			return textOrJson(
				args,
				result,
				() => (result as { message: string }).message,
			);
		case "console-logs":
			return textOrJson(args, result, () =>
				formatConsoleLogs(result as ConsoleLogEntry[]),
			);
		case "evaluate-js":
		case "navigate":
			return typeof result === "string"
				? result
				: JSON.stringify(result, null, 2);
		case "smoke": {
			const report = result as SmokeReport & { reportPath?: string };
			return textOrJson(args, report, () => {
				const lines = [
					`Desktop smoke passed: ${report.windowInfo.url}`,
					`DOM elements: ${report.dom.length}`,
					`Console logs: ${report.consoleLogs.length}`,
				];
				if (report.screenshot?.path) {
					lines.push(`Screenshot: ${report.screenshot.path}`);
				}
				if (report.reportPath) lines.push(`Report: ${report.reportPath}`);
				return lines.join("\n");
			});
		}
		case "visual-stability": {
			if (typeof result === "string") return result;
			const report = result as VisualStabilityReport;
			return textOrJson(args, report, () =>
				formatVisualStabilityReport(report),
			);
		}
		default:
			return JSON.stringify(result, null, 2);
	}
}

function resultExitCode(args: ParsedCliArgs, result: unknown): number {
	if (args.command === "visual-stability") {
		if (typeof result === "string") return 0;
		return (result as VisualStabilityReport).passed ? 0 : 1;
	}
	return 0;
}

export async function runDesktopAutomationCli(
	argv = process.argv.slice(2),
	io: CliIO = {
		write: (message) => console.log(message),
		writeError: (message) => console.error(message),
	},
): Promise<number> {
	config({
		path: resolve(import.meta.dirname, "../../../../.env"),
		quiet: true,
	});
	process.env.DESKTOP_AUTOMATION_PORT ??= "9322";
	const args = parseCliArgs(argv);
	const automation = new DesktopAutomation();
	try {
		const result = await runCommand(automation, args);
		io.write(formatResult(args, result));
		return resultExitCode(args, result);
	} catch (error) {
		io.writeError(error instanceof Error ? error.message : String(error));
		return 1;
	} finally {
		automation.disconnect();
	}
}
