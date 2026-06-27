import { execFile } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { DesktopAutomation } from "../../../packages/desktop-mcp/src/automation/index.ts";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

type ProcessRole =
	| "desktop-dev-runner"
	| "electron-main"
	| "electron-renderer"
	| "electron-gpu"
	| "electron-network"
	| "electron-utility"
	| "host-service"
	| "pty-daemon"
	| "terminal-host"
	| "api"
	| "relay"
	| "electric-proxy"
	| "workerd"
	| "other-service"
	| "other";

interface CliOptions {
	actionSettleMs: number;
	automation: boolean;
	cycles: number;
	idleMs: number;
	jsonOut?: string;
	markdownOut?: string;
	maxActionFailures?: number;
	maxConsoleErrors?: number;
	maxDesktopGrowthPercent?: number;
	maxGrowthPercent?: number;
	maxPeakDesktopProcessCount?: number;
	maxPeakProcessCount?: number;
	reportDir: string;
	routes: string[];
	sampleIntervalMs: number;
	terminalCount: number;
	topLimit: number;
}

interface ProcessRow {
	pid: number;
	ppid: number;
	cpu: number;
	rssBytes: number;
	memoryBytes: number;
	command: string;
}

interface GroupMetrics {
	role: ProcessRole;
	count: number;
	cpu: number;
	memoryBytes: number;
}

interface ProcessPoint {
	pid: number;
	ppid: number;
	role: ProcessRole;
	cpu: number;
	memoryBytes: number;
	command: string;
}

interface ProcessSample {
	sampledAt: string;
	elapsedMs: number;
	desktop: GroupMetrics;
	services: GroupMetrics;
	all: GroupMetrics;
	groups: GroupMetrics[];
	processes: ProcessPoint[];
}

interface RendererSnapshot {
	href: string;
	title: string;
	readyState: string;
	visibilityState: string;
	nodeCount: number;
	usedJsHeapSize?: number;
	totalJsHeapSize?: number;
	jsHeapSizeLimit?: number;
}

interface MemorySnapshot {
	label: string;
	sampledAt: string;
	process: ProcessSample;
	renderer?: RendererSnapshot;
	rendererError?: string;
}

interface ScenarioAction {
	label: string;
	startedAt: string;
	durationMs: number;
	ok: boolean;
	error?: string;
}

interface ConsoleLogEntry {
	level: number;
	message: string;
	timestamp: number;
}

interface LifecycleRoleDelta {
	label: string;
	fromSnapshot: string;
	toSnapshot: string;
	elapsedMs: number;
	role: ProcessRole;
	startMemoryBytes: number;
	endMemoryBytes: number;
	memoryDeltaBytes: number;
	startProcessCount: number;
	endProcessCount: number;
	processCountDelta: number;
}

interface ProcessSummary {
	pid: number;
	role: ProcessRole;
	samples: number;
	maxMemoryBytes: number;
	latestMemoryBytes: number;
	maxCpu: number;
	avgCpu: number;
	command: string;
}

interface MemoryScenarioReport {
	generatedAt: string;
	options: CliOptions;
	summary: {
		startMemoryBytes: number;
		endMemoryBytes: number;
		deltaMemoryBytes: number;
		growthPercent: number | null;
		peakMemoryBytes: number;
		peakProcessCount: number;
		startDesktopMemoryBytes: number;
		endDesktopMemoryBytes: number;
		deltaDesktopMemoryBytes: number;
		desktopGrowthPercent: number | null;
		peakDesktopMemoryBytes: number;
		peakDesktopProcessCount: number;
		actionCount: number;
		actionFailureCount: number;
		snapshotCount: number;
		durationMs: number;
	};
	snapshots: MemorySnapshot[];
	actions: ScenarioAction[];
	consoleErrors: ConsoleLogEntry[];
	lifecycleRoleDeltas: LifecycleRoleDelta[];
	topProcessesByMemory: ProcessSummary[];
	outputs: {
		markdownPath: string;
		jsonPath: string;
	};
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");
const defaultReportDir = resolve(
	rootDir,
	".tmp",
	"desktop-performance-reports",
);
const defaultIdleMs = 60 * 60 * 1000;
const defaultSampleIntervalMs = 30_000;
const execTimeoutMs = 15_000;
const maxBuffer = 20 * 1024 * 1024;

function loadRootEnv(): void {
	const envPath = resolve(rootDir, ".env");
	if (!existsSync(envPath)) return;

	for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const equalsIndex = line.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] ??= value
			.replaceAll("\\n", "\n")
			.replaceAll('\\"', '"')
			.replaceAll("\\$", "$")
			.replaceAll("\\\\", "\\");
	}
}

loadRootEnv();
process.env.DESKTOP_AUTOMATION_PORT ??= "9322";

let getPhysFootprints: ((pids: number[]) => Record<number, number>) | undefined;
try {
	const metricsModule = require("@superset/macos-process-metrics") as {
		getPhysFootprints?: unknown;
	};
	if (typeof metricsModule.getPhysFootprints === "function") {
		getPhysFootprints = metricsModule.getPhysFootprints as (
			pids: number[],
		) => Record<number, number>;
	}
} catch {
	getPhysFootprints = undefined;
}

export function parseCliOptions(argv: string[]): CliOptions {
	const options: CliOptions = {
		actionSettleMs: 750,
		automation: true,
		cycles: 5,
		idleMs: defaultIdleMs,
		reportDir: defaultReportDir,
		routes: [],
		sampleIntervalMs: defaultSampleIntervalMs,
		terminalCount: 3,
		topLimit: 12,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) continue;

		const equalsIndex = arg.indexOf("=");
		const name = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
		const inlineValue =
			equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
		const nextValue = () => {
			if (inlineValue !== undefined) return inlineValue;
			index += 1;
			const value = argv[index];
			if (!value || value.startsWith("--")) {
				throw new Error(`--${name} requires a value`);
			}
			return value;
		};

		switch (name) {
			case "action-settle":
			case "action-settle-ms":
				options.actionSettleMs = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "automation":
				options.automation = parseBoolean(nextValue(), name);
				break;
			case "no-automation":
				options.automation = false;
				break;
			case "cycles":
				options.cycles = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "idle":
			case "idle-ms":
				options.idleMs = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "interval":
			case "sample-interval":
			case "sample-interval-ms":
				options.sampleIntervalMs = parsePositiveInteger(nextValue(), name);
				break;
			case "json-out":
				options.jsonOut = resolveWorkspacePath(nextValue());
				break;
			case "markdown-out":
				options.markdownOut = resolveWorkspacePath(nextValue());
				break;
			case "max-action-failures":
				options.maxActionFailures = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "max-console-errors":
				options.maxConsoleErrors = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "max-desktop-growth-percent":
				options.maxDesktopGrowthPercent = parseNonNegativeNumber(
					nextValue(),
					name,
				);
				break;
			case "max-growth-percent":
				options.maxGrowthPercent = parseNonNegativeNumber(nextValue(), name);
				break;
			case "max-peak-desktop-process-count":
				options.maxPeakDesktopProcessCount = parsePositiveInteger(
					nextValue(),
					name,
				);
				break;
			case "max-peak-process-count":
				options.maxPeakProcessCount = parsePositiveInteger(nextValue(), name);
				break;
			case "report-dir":
				options.reportDir = resolveWorkspacePath(nextValue());
				break;
			case "route":
				options.routes.push(normalizeRoutePath(nextValue()));
				break;
			case "terminal-count":
				options.terminalCount = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "top":
				options.topLimit = parsePositiveInteger(nextValue(), name);
				break;
			default:
				throw new Error(`Unknown option --${name}`);
		}
	}

	if (options.idleMs > 0 && options.idleMs < options.sampleIntervalMs) {
		options.sampleIntervalMs = options.idleMs;
	}

	return options;
}

function parseNonNegativeNumber(value: string, name: string): number {
	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`--${name} must be 0 or greater`);
	}
	return parsed;
}

function parsePositiveInteger(
	value: string,
	name: string,
	{ allowZero = false }: { allowZero?: boolean } = {},
): number {
	const parsed = Number.parseInt(value, 10);
	const minimum = allowZero ? 0 : 1;
	if (!Number.isFinite(parsed) || parsed < minimum) {
		throw new Error(
			`--${name} must be ${allowZero ? "0 or greater" : "positive"}`,
		);
	}
	return parsed;
}

function parseBoolean(value: string, name: string): boolean {
	if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
	if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
	throw new Error(`--${name} must be true or false`);
}

function resolveWorkspacePath(path: string): string {
	const resolvedPath = isAbsolute(path)
		? resolve(path)
		: resolve(rootDir, path);
	if (resolvedPath !== rootDir && !resolvedPath.startsWith(`${rootDir}/`)) {
		throw new Error(`Output path must stay inside this repository: ${path}`);
	}
	return resolvedPath;
}

function normalizeRoutePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) throw new Error("--route cannot be empty");
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function timestampForFile(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function formatBytes(bytes: number): string {
	const sign = bytes < 0 ? "-" : "";
	const units = ["B", "KB", "MB", "GB"];
	let value = Math.abs(bytes);
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${sign}${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMs(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) return "n/a";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	return `${(ms / 1000).toFixed(2)} s`;
}

function formatPercent(percent: number | null): string {
	if (percent === null || !Number.isFinite(percent)) return "n/a";
	return `${percent.toFixed(1)}%`;
}

function trimCommand(command: string, limit = 160): string {
	const normalized = command.replaceAll(rootDir, "<repo>");
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, limit - 1)}...`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function listProcesses(): Promise<ProcessRow[]> {
	const { stdout } = await execFileAsync(
		"ps",
		["-axo", "pid=,ppid=,pcpu=,rss=,command="],
		{ maxBuffer, timeout: execTimeoutMs },
	);
	const rows: ProcessRow[] = [];
	for (const line of stdout.split("\n")) {
		const match = line
			.trim()
			.match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(\d+)\s+(.+)$/);
		if (!match) continue;
		const pid = Number.parseInt(match[1], 10);
		const ppid = Number.parseInt(match[2], 10);
		const cpu = Number.parseFloat(match[3]);
		const rssKb = Number.parseInt(match[4], 10);
		const command = match[5];
		if (
			!Number.isFinite(pid) ||
			!Number.isFinite(ppid) ||
			!Number.isFinite(cpu) ||
			!Number.isFinite(rssKb)
		) {
			continue;
		}
		rows.push({
			pid,
			ppid,
			cpu: Math.max(0, cpu),
			rssBytes: Math.max(0, rssKb) * 1024,
			memoryBytes: Math.max(0, rssKb) * 1024,
			command,
		});
	}
	return rows;
}

function createChildrenMap(rows: ProcessRow[]): Map<number, number[]> {
	const children = new Map<number, number[]>();
	for (const row of rows) {
		const existing = children.get(row.ppid);
		if (existing) {
			existing.push(row.pid);
		} else {
			children.set(row.ppid, [row.pid]);
		}
	}
	return children;
}

function collectSubtreePids(
	seedPids: Iterable<number>,
	childrenByParent: Map<number, number[]>,
): Set<number> {
	const result = new Set<number>();
	const stack = [...seedPids];
	while (stack.length > 0) {
		const pid = stack.pop();
		if (pid === undefined || result.has(pid)) continue;
		result.add(pid);
		for (const child of childrenByParent.get(pid) ?? []) {
			stack.push(child);
		}
	}
	return result;
}

function findDesktopSeedPids(rows: ProcessRow[]): number[] {
	return rows
		.filter((row) => isDesktopSeedCommand(row.command))
		.map((row) => row.pid);
}

function findServiceSeedPids(rows: ProcessRow[]): number[] {
	return rows
		.filter((row) => isServiceSeedCommand(row.command))
		.map((row) => row.pid);
}

export function isDesktopSeedCommand(command: string): boolean {
	return (
		command.includes("bun run --cwd apps/desktop dev") ||
		command.includes(`${desktopDir}/node_modules/.bin/electron-vite`) ||
		command.includes("electron-vite dev --watch") ||
		command.includes("/Superset.app/Contents/MacOS/Superset") ||
		command.includes("/Superset Canary.app/Contents/MacOS/Superset")
	);
}

export function isServiceSeedCommand(command: string): boolean {
	return (
		command.includes("bun run --cwd apps/api dev") ||
		command.includes("bun run --cwd apps/electric-proxy dev") ||
		command.includes("bun --cwd apps/relay") ||
		command.includes(`${rootDir}/apps/api`) ||
		command.includes(`${rootDir}/apps/electric-proxy`) ||
		command.includes(`${rootDir}/apps/relay`) ||
		command.includes("wrangler dev --port") ||
		command.includes("workerd serve --binary")
	);
}

function hasAncestor(
	ancestorCommands: readonly string[],
	predicate: (command: string) => boolean,
): boolean {
	return ancestorCommands.some((ancestorCommand) => predicate(ancestorCommand));
}

function isApiCommand(command: string): boolean {
	return (
		command.includes("bun run --cwd apps/api dev") ||
		command.includes(`${rootDir}/apps/api`) ||
		command.includes("next dev --port") ||
		command.includes("next-server")
	);
}

function isRelayCommand(command: string): boolean {
	return (
		command.includes("bun --cwd apps/relay") ||
		command.includes(`${rootDir}/apps/relay`)
	);
}

function isElectricProxyCommand(command: string): boolean {
	return (
		command.includes("bun run --cwd apps/electric-proxy dev") ||
		command.includes(`${rootDir}/apps/electric-proxy`) ||
		command.includes("wrangler dev --port")
	);
}

export function classifyProcessCommand(
	command: string,
	ancestorCommands: readonly string[] = [],
): ProcessRole {
	if (command.includes("host-service.js")) return "host-service";
	if (command.includes("pty-daemon.js")) return "pty-daemon";
	if (command.includes("terminal-host.js")) return "terminal-host";
	if (command.includes("@esbuild") || command.includes("/esbuild ")) {
		if (hasAncestor(ancestorCommands, isDesktopSeedCommand)) {
			return "desktop-dev-runner";
		}
		if (hasAncestor(ancestorCommands, isApiCommand)) return "api";
		if (hasAncestor(ancestorCommands, isElectricProxyCommand)) {
			return "electric-proxy";
		}
	}
	if (command.includes("--type=renderer")) return "electron-renderer";
	if (command.includes("--type=gpu-process")) return "electron-gpu";
	if (command.includes("--utility-sub-type=network")) return "electron-network";
	if (command.includes("--type=utility")) return "electron-utility";
	if (command.includes("Electron.app/Contents/MacOS/Electron")) {
		return "electron-main";
	}
	if (
		command.includes("bun run --cwd apps/desktop dev") ||
		command.includes("electron-vite dev --watch") ||
		command.includes(`${desktopDir}/node_modules/.bin/electron-vite`)
	) {
		return "desktop-dev-runner";
	}
	if (isApiCommand(command)) return "api";
	if (isRelayCommand(command)) return "relay";
	if (isElectricProxyCommand(command)) return "electric-proxy";
	if (command.includes("workerd serve --binary")) return "workerd";
	return "other";
}

function getAncestorCommands(
	row: ProcessRow,
	rowsByPid: Map<number, ProcessRow>,
): string[] {
	const ancestors: string[] = [];
	let parent = rowsByPid.get(row.ppid);
	const visited = new Set<number>();
	while (parent && !visited.has(parent.pid)) {
		visited.add(parent.pid);
		ancestors.push(parent.command);
		parent = rowsByPid.get(parent.ppid);
	}
	return ancestors;
}

function classifyProcess(
	row: ProcessRow,
	rowsByPid: Map<number, ProcessRow>,
): ProcessRole {
	return classifyProcessCommand(
		row.command,
		getAncestorCommands(row, rowsByPid),
	);
}

function roleSortValue(role: ProcessRole): number {
	const order: ProcessRole[] = [
		"electron-renderer",
		"electron-main",
		"host-service",
		"pty-daemon",
		"terminal-host",
		"electron-gpu",
		"electron-network",
		"electron-utility",
		"desktop-dev-runner",
		"api",
		"relay",
		"electric-proxy",
		"workerd",
		"other-service",
		"other",
	];
	return order.indexOf(role) === -1 ? order.length : order.indexOf(role);
}

function enrichWithMacosFootprint(rows: ProcessRow[], pids: Set<number>): void {
	if (!getPhysFootprints || pids.size === 0) return;
	try {
		const footprints = getPhysFootprints([...pids]);
		for (const row of rows) {
			if (!pids.has(row.pid)) continue;
			const footprint = footprints[row.pid];
			if (typeof footprint === "number" && footprint > 0) {
				row.memoryBytes = footprint;
			}
		}
	} catch {
		// Keep RSS fallback.
	}
}

function aggregateGroup(
	role: ProcessRole,
	processes: ProcessPoint[],
): GroupMetrics {
	return processes.reduce<GroupMetrics>(
		(total, process) => ({
			role,
			count: total.count + 1,
			cpu: total.cpu + process.cpu,
			memoryBytes: total.memoryBytes + process.memoryBytes,
		}),
		{ role, count: 0, cpu: 0, memoryBytes: 0 },
	);
}

async function captureProcessSample(
	startedAtMs: number,
): Promise<ProcessSample> {
	const rows = await listProcesses();
	const rowsByPid = new Map(rows.map((row) => [row.pid, row]));
	const childrenByParent = createChildrenMap(rows);
	const desktopPids = collectSubtreePids(
		findDesktopSeedPids(rows),
		childrenByParent,
	);
	const servicePids = collectSubtreePids(
		findServiceSeedPids(rows),
		childrenByParent,
	);
	const relevantPids = new Set([...desktopPids, ...servicePids]);

	enrichWithMacosFootprint(rows, relevantPids);

	const processes = rows
		.filter((row) => relevantPids.has(row.pid))
		.map<ProcessPoint>((row) => ({
			pid: row.pid,
			ppid: row.ppid,
			role: classifyProcess(row, rowsByPid),
			cpu: row.cpu,
			memoryBytes: row.memoryBytes,
			command: row.command,
		}));
	const desktopProcesses = processes.filter((process) =>
		desktopPids.has(process.pid),
	);
	const serviceProcesses = processes.filter(
		(process) => servicePids.has(process.pid) && !desktopPids.has(process.pid),
	);
	const grouped = new Map<ProcessRole, ProcessPoint[]>();
	for (const process of processes) {
		const existing = grouped.get(process.role);
		if (existing) {
			existing.push(process);
		} else {
			grouped.set(process.role, [process]);
		}
	}

	return {
		sampledAt: new Date().toISOString(),
		elapsedMs: Date.now() - startedAtMs,
		desktop: aggregateGroup("other", desktopProcesses),
		services: aggregateGroup("other-service", serviceProcesses),
		all: aggregateGroup("other", processes),
		groups: [...grouped.entries()]
			.map(([role, groupProcesses]) => aggregateGroup(role, groupProcesses))
			.sort(
				(left, right) => roleSortValue(left.role) - roleSortValue(right.role),
			),
		processes,
	};
}

const rendererSnapshotScript = `(() => {
	const memory = performance.memory || {};
	return JSON.stringify({
		href: location.href,
		title: document.title,
		readyState: document.readyState,
		visibilityState: document.visibilityState,
		nodeCount: document.querySelectorAll("*").length,
		usedJsHeapSize: memory.usedJSHeapSize,
		totalJsHeapSize: memory.totalJSHeapSize,
		jsHeapSizeLimit: memory.jsHeapSizeLimit,
	});
})()`;

function parseJsonFromOutput<T>(output: unknown): T {
	if (typeof output !== "string") return output as T;
	const trimmed = output.trim();
	try {
		return JSON.parse(trimmed) as T;
	} catch {
		// Some CLI paths prefix logs before the JSON payload. Fall through to the
		// object/array extraction used by the desktop automation helpers.
	}
	const objectStart = trimmed.indexOf("{");
	const arrayStart = trimmed.indexOf("[");
	const start =
		objectStart === -1
			? arrayStart
			: arrayStart === -1
				? objectStart
				: Math.min(objectStart, arrayStart);
	if (start === -1) {
		throw new Error(
			`No JSON payload found in output: ${trimmed.slice(0, 120)}`,
		);
	}
	const endObject = trimmed.lastIndexOf("}");
	const endArray = trimmed.lastIndexOf("]");
	const end = Math.max(endObject, endArray);
	if (end < start) {
		throw new Error(`Incomplete JSON payload: ${trimmed.slice(0, 120)}`);
	}
	return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

async function captureRendererSnapshot(
	automation: DesktopAutomation | null,
): Promise<{ renderer?: RendererSnapshot; error?: string }> {
	if (!automation) return { error: "Automation disabled by --no-automation" };
	try {
		return {
			renderer: parseJsonFromOutput<RendererSnapshot>(
				await automation.evaluateJs(rendererSnapshotScript),
			),
		};
	} catch (error) {
		return { error: stringifyError(error) };
	}
}

async function captureMemorySnapshot({
	automation,
	label,
	startedAtMs,
}: {
	automation: DesktopAutomation | null;
	label: string;
	startedAtMs: number;
}): Promise<MemorySnapshot> {
	const [process, rendererSnapshot] = await Promise.all([
		captureProcessSample(startedAtMs),
		captureRendererSnapshot(automation),
	]);
	return {
		label,
		sampledAt: process.sampledAt,
		process,
		...(rendererSnapshot.renderer && { renderer: rendererSnapshot.renderer }),
		...(rendererSnapshot.error && { rendererError: rendererSnapshot.error }),
	};
}

function platformHotkey(mac: string[], other: string[]): string[] {
	return process.platform === "darwin" ? mac : other;
}

const splitPaneHotkey = platformHotkey(
	["Meta", "e"],
	["Control", "Shift", "e"],
);
const closePaneHotkey = platformHotkey(
	["Meta", "w"],
	["Control", "Shift", "w"],
);
const toggleRightSidebarHotkey = platformHotkey(
	["Meta", "l"],
	["Control", "Shift", "l"],
);

async function runAction(
	actions: ScenarioAction[],
	label: string,
	action: () => Promise<void>,
): Promise<void> {
	const startedAtMs = Date.now();
	const startedAt = new Date(startedAtMs).toISOString();
	try {
		await action();
		actions.push({
			label,
			startedAt,
			durationMs: Date.now() - startedAtMs,
			ok: true,
		});
	} catch (error) {
		actions.push({
			label,
			startedAt,
			durationMs: Date.now() - startedAtMs,
			ok: false,
			error: stringifyError(error),
		});
	}
}

async function hasVisibleSidebarTabs(
	automation: DesktopAutomation,
): Promise<boolean> {
	try {
		const result = await automation.evaluateJs(`(() => {
			const tabNames = new Set(["Files", "Changes", "Review", "Models"]);
			const buttons = Array.from(document.querySelectorAll("button"));
			return JSON.stringify(buttons.some((button) => {
				const text = (button.textContent || "").trim();
				const label = (button.getAttribute("aria-label") || "").trim();
				return tabNames.has(text) || tabNames.has(label) || [...tabNames].some((tab) => label.startsWith(tab + " ("));
			}));
		})()`);
		const hasTabButtons = parseJsonFromOutput<boolean>(result);
		if (hasTabButtons) return true;
		const elements = await automation.inspectDom({ interactiveOnly: true });
		const labels = new Set(
			elements
				.flatMap((element) => [element.text.trim()])
				.filter((text) => text.length > 0),
		);
		return ["Files", "Changes", "Review", "Models"].some((label) =>
			labels.has(label),
		);
	} catch {
		return false;
	}
}

async function clickRightSidebarToggle(
	automation: DesktopAutomation,
): Promise<boolean> {
	const result = await automation.evaluateJs(`(() => {
		const button = document.querySelector('[data-testid="workspace-right-sidebar-toggle"], button[aria-label="Open workspace sidebar"]');
		if (!(button instanceof HTMLButtonElement)) return JSON.stringify({ ok: false });
		button.click();
		return JSON.stringify({ ok: true });
	})()`);
	return parseJsonFromOutput<{ ok: boolean }>(result).ok;
}

async function waitForRightSidebarToggle(
	automation: DesktopAutomation,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await automation.evaluateJs(`(() => {
			return JSON.stringify(Boolean(document.querySelector('[data-testid="workspace-right-sidebar-toggle"], button[aria-label="Open workspace sidebar"], button[aria-label="Close workspace sidebar"]')));
		})()`);
		if (parseJsonFromOutput<boolean>(result)) return true;
		await sleep(100);
	}
	return false;
}

async function waitForSidebarTabs(
	automation: DesktopAutomation,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await hasVisibleSidebarTabs(automation)) return;
		await sleep(100);
	}
	throw new Error(
		`Workspace sidebar tabs did not appear within ${timeoutMs}ms`,
	);
}

async function ensureRightSidebarOpen(
	automation: DesktopAutomation,
	settleMs: number,
): Promise<void> {
	if (await hasVisibleSidebarTabs(automation)) return;
	await waitForRightSidebarToggle(automation, 5_000);
	if (!(await clickRightSidebarToggle(automation))) {
		await automation.sendKeys({ keys: toggleRightSidebarHotkey });
	}
	await waitForSidebarTabs(automation, 5_000);
	await sleep(settleMs);
}

async function clickButtonByExactText(
	automation: DesktopAutomation,
	text: string,
): Promise<void> {
	const result = await automation.evaluateJs(`(() => {
		const targetText = ${JSON.stringify(text)};
		const buttons = Array.from(document.querySelectorAll("button"));
		const button = buttons.find((candidate) =>
			(candidate.textContent || "").trim() === targetText
		);
		if (!button) return JSON.stringify({ ok: false });
		button.scrollIntoView({ block: "nearest", inline: "nearest" });
		(button).click();
		return JSON.stringify({ ok: true });
	})()`);
	const parsed = parseJsonFromOutput<{ ok: boolean }>(result);
	if (!parsed.ok) {
		throw new Error(`Button not found: ${text}`);
	}
}

async function toggleSidebarTabs(
	automation: DesktopAutomation,
	settleMs: number,
	actions: ScenarioAction[],
	cycle: number,
): Promise<void> {
	await runAction(actions, `cycle ${cycle}: open right sidebar`, () =>
		ensureRightSidebarOpen(automation, settleMs),
	);
	for (const tab of ["Files", "Changes", "Review", "Models"]) {
		await runAction(actions, `cycle ${cycle}: show ${tab} tab`, async () => {
			try {
				await automation.click({ text: tab, fuzzy: false });
			} catch {
				await clickButtonByExactText(automation, tab);
			}
			await sleep(settleMs);
		});
	}
}

async function exerciseTerminals(
	automation: DesktopAutomation,
	options: CliOptions,
	actions: ScenarioAction[],
	cycle: number,
): Promise<void> {
	for (let index = 0; index < options.terminalCount; index += 1) {
		await runAction(
			actions,
			`cycle ${cycle}: split terminal ${index + 1}`,
			async () => {
				await automation.sendKeys({ keys: splitPaneHotkey });
				await sleep(options.actionSettleMs);
			},
		);
	}

	for (let index = 0; index < options.terminalCount; index += 1) {
		await runAction(
			actions,
			`cycle ${cycle}: close terminal ${index + 1}`,
			async () => {
				await automation.sendKeys({ keys: closePaneHotkey });
				await sleep(options.actionSettleMs);
			},
		);
	}
}

async function navigateToRoute(
	automation: DesktopAutomation,
	route: string,
	settleMs: number,
): Promise<void> {
	await automation.navigate({ path: route });
	await automation.waitFor({
		urlIncludes: `#${route}`,
		timeoutMs: 10_000,
	});
	if (route.startsWith("/v2-workspace/")) {
		await waitForRightSidebarToggle(automation, 10_000);
	}
	await sleep(settleMs);
}

async function runScenarioCycles({
	actions,
	automation,
	options,
	snapshots,
	startedAtMs,
}: {
	actions: ScenarioAction[];
	automation: DesktopAutomation | null;
	options: CliOptions;
	snapshots: MemorySnapshot[];
	startedAtMs: number;
}): Promise<void> {
	if (!automation) return;

	if (options.routes.length > 0) {
		await runAction(actions, "navigate initial route", () =>
			navigateToRoute(automation, options.routes[0], options.actionSettleMs),
		);
		snapshots.push(
			await captureMemorySnapshot({
				automation,
				label: "after-initial-route",
				startedAtMs,
			}),
		);
	}

	for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
		const route =
			options.routes.length === 0
				? null
				: options.routes[(cycle - 1) % options.routes.length];
		if (route) {
			await runAction(actions, `cycle ${cycle}: navigate ${route}`, () =>
				navigateToRoute(automation, route, options.actionSettleMs),
			);
		}
		await toggleSidebarTabs(automation, options.actionSettleMs, actions, cycle);
		await exerciseTerminals(automation, options, actions, cycle);
		snapshots.push(
			await captureMemorySnapshot({
				automation,
				label: `after-cycle-${cycle}`,
				startedAtMs,
			}),
		);
	}
}

async function runIdleSampling({
	automation,
	options,
	snapshots,
	startedAtMs,
}: {
	automation: DesktopAutomation | null;
	options: CliOptions;
	snapshots: MemorySnapshot[];
	startedAtMs: number;
}): Promise<void> {
	snapshots.push(
		await captureMemorySnapshot({
			automation,
			label: "idle-start",
			startedAtMs,
		}),
	);
	if (options.idleMs === 0) return;

	const idleStartedAtMs = Date.now();
	let sampleIndex = 1;
	while (Date.now() - idleStartedAtMs < options.idleMs) {
		const elapsedMs = Date.now() - idleStartedAtMs;
		await sleep(Math.min(options.sampleIntervalMs, options.idleMs - elapsedMs));
		snapshots.push(
			await captureMemorySnapshot({
				automation,
				label: `idle-${sampleIndex}`,
				startedAtMs,
			}),
		);
		sampleIndex += 1;
	}
}

function summarizeProcesses(
	snapshots: MemorySnapshot[],
	topLimit: number,
): ProcessSummary[] {
	const byPid = new Map<
		number,
		{
			role: ProcessRole;
			command: string;
			cpuValues: number[];
			memoryValues: number[];
		}
	>();
	for (const snapshot of snapshots) {
		for (const process of snapshot.process.processes) {
			const existing = byPid.get(process.pid);
			if (existing) {
				existing.role = process.role;
				existing.command = process.command;
				existing.cpuValues.push(process.cpu);
				existing.memoryValues.push(process.memoryBytes);
			} else {
				byPid.set(process.pid, {
					role: process.role,
					command: process.command,
					cpuValues: [process.cpu],
					memoryValues: [process.memoryBytes],
				});
			}
		}
	}
	return [...byPid.entries()]
		.map(([pid, info]) => ({
			pid,
			role: info.role,
			samples: info.cpuValues.length,
			maxMemoryBytes: Math.max(0, ...info.memoryValues),
			latestMemoryBytes: info.memoryValues.at(-1) ?? 0,
			maxCpu: Math.max(0, ...info.cpuValues),
			avgCpu: average(info.cpuValues),
			command: info.command,
		}))
		.sort((left, right) => right.maxMemoryBytes - left.maxMemoryBytes)
		.slice(0, topLimit);
}

function groupMetricsByRole(
	sample: ProcessSample,
): Map<ProcessRole, GroupMetrics> {
	return new Map(sample.groups.map((group) => [group.role, group]));
}

export function buildLifecycleRoleDeltas(
	snapshots: MemorySnapshot[],
): LifecycleRoleDelta[] {
	const deltas: LifecycleRoleDelta[] = [];
	for (let index = 1; index < snapshots.length; index += 1) {
		const from = snapshots[index - 1];
		const to = snapshots[index];
		const fromGroups = groupMetricsByRole(from.process);
		const toGroups = groupMetricsByRole(to.process);
		const roles = new Set<ProcessRole>([
			...fromGroups.keys(),
			...toGroups.keys(),
		]);

		for (const role of roles) {
			const start = fromGroups.get(role);
			const end = toGroups.get(role);
			const startMemoryBytes = start?.memoryBytes ?? 0;
			const endMemoryBytes = end?.memoryBytes ?? 0;
			const startProcessCount = start?.count ?? 0;
			const endProcessCount = end?.count ?? 0;
			const memoryDeltaBytes = endMemoryBytes - startMemoryBytes;
			const processCountDelta = endProcessCount - startProcessCount;
			if (memoryDeltaBytes === 0 && processCountDelta === 0) continue;

			deltas.push({
				label: `${from.label} -> ${to.label}`,
				fromSnapshot: from.label,
				toSnapshot: to.label,
				elapsedMs: Math.max(0, to.process.elapsedMs - from.process.elapsedMs),
				role,
				startMemoryBytes,
				endMemoryBytes,
				memoryDeltaBytes,
				startProcessCount,
				endProcessCount,
				processCountDelta,
			});
		}
	}

	return deltas;
}

function buildSummary(
	snapshots: MemorySnapshot[],
	actions: ScenarioAction[],
): MemoryScenarioReport["summary"] {
	const first = snapshots[0];
	const last = snapshots.at(-1);
	const startMemoryBytes = first?.process.all.memoryBytes ?? 0;
	const endMemoryBytes = last?.process.all.memoryBytes ?? 0;
	const startDesktopMemoryBytes = first?.process.desktop.memoryBytes ?? 0;
	const endDesktopMemoryBytes = last?.process.desktop.memoryBytes ?? 0;
	const durationMs =
		first && last
			? Math.max(0, last.process.elapsedMs - first.process.elapsedMs)
			: 0;
	return {
		startMemoryBytes,
		endMemoryBytes,
		deltaMemoryBytes: endMemoryBytes - startMemoryBytes,
		growthPercent:
			startMemoryBytes > 0
				? ((endMemoryBytes - startMemoryBytes) / startMemoryBytes) * 100
				: null,
		peakMemoryBytes: Math.max(
			0,
			...snapshots.map((snapshot) => snapshot.process.all.memoryBytes),
		),
		peakProcessCount: Math.max(
			0,
			...snapshots.map((snapshot) => snapshot.process.all.count),
		),
		startDesktopMemoryBytes,
		endDesktopMemoryBytes,
		deltaDesktopMemoryBytes: endDesktopMemoryBytes - startDesktopMemoryBytes,
		desktopGrowthPercent:
			startDesktopMemoryBytes > 0
				? ((endDesktopMemoryBytes - startDesktopMemoryBytes) /
						startDesktopMemoryBytes) *
					100
				: null,
		peakDesktopMemoryBytes: Math.max(
			0,
			...snapshots.map((snapshot) => snapshot.process.desktop.memoryBytes),
		),
		peakDesktopProcessCount: Math.max(
			0,
			...snapshots.map((snapshot) => snapshot.process.desktop.count),
		),
		actionCount: actions.length,
		actionFailureCount: actions.filter((action) => !action.ok).length,
		snapshotCount: snapshots.length,
		durationMs,
	};
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatBudgetValue(value: number | undefined, suffix = ""): string {
	return value === undefined ? "not set" : `${value}${suffix}`;
}

function hasScenarioBudgets(options: CliOptions): boolean {
	return [
		options.maxActionFailures,
		options.maxConsoleErrors,
		options.maxDesktopGrowthPercent,
		options.maxGrowthPercent,
		options.maxPeakDesktopProcessCount,
		options.maxPeakProcessCount,
	].some((value) => value !== undefined);
}

export function findScenarioBudgetFailures(
	report: Pick<MemoryScenarioReport, "consoleErrors" | "options" | "summary">,
): string[] {
	const failures: string[] = [];
	const { options, summary } = report;
	if (
		options.maxActionFailures !== undefined &&
		summary.actionFailureCount > options.maxActionFailures
	) {
		failures.push(
			`Action failures ${summary.actionFailureCount} exceeded ${options.maxActionFailures}`,
		);
	}
	if (
		options.maxConsoleErrors !== undefined &&
		report.consoleErrors.length > options.maxConsoleErrors
	) {
		failures.push(
			`Renderer console errors ${report.consoleErrors.length} exceeded ${options.maxConsoleErrors}`,
		);
	}
	if (
		options.maxGrowthPercent !== undefined &&
		summary.growthPercent !== null &&
		summary.growthPercent > options.maxGrowthPercent
	) {
		failures.push(
			`Process-tree memory growth ${summary.growthPercent.toFixed(1)}% exceeded ${options.maxGrowthPercent}%`,
		);
	}
	if (
		options.maxDesktopGrowthPercent !== undefined &&
		summary.desktopGrowthPercent !== null &&
		summary.desktopGrowthPercent > options.maxDesktopGrowthPercent
	) {
		failures.push(
			`Desktop subtree memory growth ${summary.desktopGrowthPercent.toFixed(1)}% exceeded ${options.maxDesktopGrowthPercent}%`,
		);
	}
	if (
		options.maxPeakProcessCount !== undefined &&
		summary.peakProcessCount > options.maxPeakProcessCount
	) {
		failures.push(
			`Peak process-tree process count ${summary.peakProcessCount} exceeded ${options.maxPeakProcessCount}`,
		);
	}
	if (
		options.maxPeakDesktopProcessCount !== undefined &&
		summary.peakDesktopProcessCount > options.maxPeakDesktopProcessCount
	) {
		failures.push(
			`Peak desktop subtree process count ${summary.peakDesktopProcessCount} exceeded ${options.maxPeakDesktopProcessCount}`,
		);
	}
	return failures;
}

function stringifyError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function markdownTable(headers: string[], rows: string[][]): string {
	const headerRow = `| ${headers.join(" | ")} |`;
	const separator = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
	return [
		headerRow,
		separator,
		body || `| ${headers.map(() => "n/a").join(" | ")} |`,
	].join("\n");
}

function snapshotRows(snapshots: MemorySnapshot[]): string[][] {
	return snapshots.map((snapshot) => [
		snapshot.label,
		formatMs(snapshot.process.elapsedMs),
		formatBytes(snapshot.process.desktop.memoryBytes),
		String(snapshot.process.desktop.count),
		formatBytes(snapshot.process.all.memoryBytes),
		String(snapshot.process.all.count),
		snapshot.renderer?.nodeCount === undefined
			? "n/a"
			: String(snapshot.renderer.nodeCount),
		snapshot.renderer?.usedJsHeapSize === undefined
			? "n/a"
			: formatBytes(snapshot.renderer.usedJsHeapSize),
		snapshot.rendererError
			? `\`${snapshot.rendererError.replaceAll("|", "\\|").slice(0, 120)}\``
			: "",
	]);
}

function actionRows(actions: ScenarioAction[]): string[][] {
	return actions
		.filter((action) => !action.ok)
		.map((action) => [
			action.label,
			formatMs(action.durationMs),
			`\`${(action.error ?? "unknown").replaceAll("|", "\\|").slice(0, 180)}\``,
		]);
}

function processRows(processes: ProcessSummary[]): string[][] {
	return processes.map((process) => [
		String(process.pid),
		process.role,
		String(process.samples),
		formatBytes(process.maxMemoryBytes),
		formatBytes(process.latestMemoryBytes),
		`${process.avgCpu.toFixed(1)}%`,
		`${process.maxCpu.toFixed(1)}%`,
		`\`${trimCommand(process.command).replaceAll("|", "\\|")}\``,
	]);
}

function lifecycleRoleDeltaRows(deltas: LifecycleRoleDelta[]): string[][] {
	return deltas.map((delta) => [
		delta.label,
		formatMs(delta.elapsedMs),
		delta.role,
		`${formatBytes(delta.startMemoryBytes)} -> ${formatBytes(delta.endMemoryBytes)}`,
		formatBytes(delta.memoryDeltaBytes),
		`${delta.startProcessCount} -> ${delta.endProcessCount}`,
		delta.processCountDelta > 0
			? `+${delta.processCountDelta}`
			: String(delta.processCountDelta),
	]);
}

function renderMarkdown(report: MemoryScenarioReport): string {
	const { summary } = report;
	const failedActions = actionRows(report.actions);
	const budgetFailures = findScenarioBudgetFailures(report);
	const budgetLines = hasScenarioBudgets(report.options)
		? [
				`- Max action failures: ${formatBudgetValue(report.options.maxActionFailures)}`,
				`- Max renderer console errors: ${formatBudgetValue(report.options.maxConsoleErrors)}`,
				`- Max process-tree memory growth: ${formatBudgetValue(report.options.maxGrowthPercent, "%")}`,
				`- Max desktop subtree memory growth: ${formatBudgetValue(report.options.maxDesktopGrowthPercent, "%")}`,
				`- Max peak process-tree process count: ${formatBudgetValue(report.options.maxPeakProcessCount)}`,
				`- Max peak desktop process count: ${formatBudgetValue(report.options.maxPeakDesktopProcessCount)}`,
				"",
				budgetFailures.length === 0
					? "- Result: pass"
					: `- Result: fail\n${budgetFailures.map((failure) => `  - ${failure}`).join("\n")}`,
			].join("\n")
		: "- None configured";
	const consoleErrors =
		report.consoleErrors.length === 0
			? "- None"
			: report.consoleErrors
					.map(
						(entry) =>
							`- ${new Date(entry.timestamp).toISOString()} - \`${entry.message.slice(0, 240)}\``,
					)
					.join("\n");

	return `# Desktop Runtime Memory Scenario

Generated at: ${report.generatedAt}

## Capture

- Cycles: ${report.options.cycles}
- Terminal split/close count per cycle: ${report.options.terminalCount}
- Idle duration: ${formatMs(report.options.idleMs)}
- Idle sample interval: ${formatMs(report.options.sampleIntervalMs)}
- Routes: ${report.options.routes.length === 0 ? "current route only" : report.options.routes.map((route) => `\`${route}\``).join(", ")}
- Automation: ${report.options.automation ? "enabled" : "disabled"}

## Summary

- Duration: ${formatMs(summary.durationMs)}
- Process-tree memory: ${formatBytes(summary.startMemoryBytes)} -> ${formatBytes(summary.endMemoryBytes)} (${formatBytes(summary.deltaMemoryBytes)} / ${formatPercent(summary.growthPercent)})
- Peak process-tree memory: ${formatBytes(summary.peakMemoryBytes)}
- Peak process-tree process count: ${summary.peakProcessCount}
- Desktop subtree memory: ${formatBytes(summary.startDesktopMemoryBytes)} -> ${formatBytes(summary.endDesktopMemoryBytes)} (${formatBytes(summary.deltaDesktopMemoryBytes)} / ${formatPercent(summary.desktopGrowthPercent)})
- Peak desktop subtree memory: ${formatBytes(summary.peakDesktopMemoryBytes)}
- Peak desktop process count: ${summary.peakDesktopProcessCount}
- Actions: ${summary.actionCount}, failures: ${summary.actionFailureCount}
- Snapshots: ${summary.snapshotCount}

## Budgets

${budgetLines}

## Snapshots

${markdownTable(["Label", "Elapsed", "Desktop memory", "Desktop procs", "All memory", "All procs", "DOM nodes", "JS heap", "Renderer error"], snapshotRows(report.snapshots))}

## Role Memory Deltas By Lifecycle Step

${markdownTable(["Step", "Elapsed", "Role", "Memory", "Memory delta", "Processes", "Process delta"], lifecycleRoleDeltaRows(report.lifecycleRoleDeltas))}

## Failed Actions

${failedActions.length === 0 ? "- None" : markdownTable(["Action", "Duration", "Error"], failedActions)}

## Top Processes By Memory

${markdownTable(["PID", "Role", "Samples", "Max memory", "Latest memory", "Avg CPU", "Max CPU", "Command"], processRows(report.topProcessesByMemory))}

## Renderer Console Errors

${consoleErrors}

## Notes

- Memory uses macOS \`phys_footprint\` when the native helper is available; otherwise it falls back to RSS.
- Scenario actions are best-effort. A selector or hotkey failure is recorded above, but memory sampling continues.
- The JSON report contains raw per-snapshot process data for leak triage.
`;
}

async function main(): Promise<void> {
	const options = parseCliOptions(process.argv.slice(2));
	const timestamp = timestampForFile();
	const reportDir = resolveWorkspacePath(options.reportDir);
	const markdownPath =
		options.markdownOut ??
		resolve(reportDir, `runtime-memory-scenario-${timestamp}.md`);
	const jsonPath =
		options.jsonOut ??
		resolve(reportDir, `runtime-memory-scenario-${timestamp}.json`);
	const automation = options.automation ? new DesktopAutomation() : null;
	const actions: ScenarioAction[] = [];
	const snapshots: MemorySnapshot[] = [];
	const startedAtMs = Date.now();
	let consoleErrors: ConsoleLogEntry[] = [];

	try {
		snapshots.push(
			await captureMemorySnapshot({
				automation,
				label: "start",
				startedAtMs,
			}),
		);
		await runScenarioCycles({
			actions,
			automation,
			options,
			snapshots,
			startedAtMs,
		});
		await runIdleSampling({
			automation,
			options,
			snapshots,
			startedAtMs,
		});
		snapshots.push(
			await captureMemorySnapshot({
				automation,
				label: "end",
				startedAtMs,
			}),
		);
		if (automation) {
			try {
				consoleErrors = await automation.getConsoleLogs({
					level: "error",
					limit: 50,
				});
			} catch {
				consoleErrors = [];
			}
		}
	} finally {
		automation?.disconnect();
	}

	const report: MemoryScenarioReport = {
		generatedAt: new Date().toISOString(),
		options,
		summary: buildSummary(snapshots, actions),
		snapshots,
		actions,
		consoleErrors,
		lifecycleRoleDeltas: buildLifecycleRoleDeltas(snapshots),
		topProcessesByMemory: summarizeProcesses(snapshots, options.topLimit),
		outputs: {
			markdownPath,
			jsonPath,
		},
	};
	const markdown = renderMarkdown(report);

	mkdirSync(reportDir, { recursive: true });
	writeFileSync(markdownPath, markdown);
	writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

	console.log(markdown);
	console.log(`\nMarkdown report: ${markdownPath}`);
	console.log(`JSON report: ${jsonPath}`);
	const budgetFailures = findScenarioBudgetFailures(report);
	if (budgetFailures.length > 0) {
		console.error(
			`[runtime-memory-scenario] ${budgetFailures.length} budget failure(s):\n${budgetFailures
				.map((failure) => `- ${failure}`)
				.join("\n")}`,
		);
		process.exitCode = 1;
	}

	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${markdown}\n`);
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(stringifyError(error));
		process.exitCode = 1;
	});
}
