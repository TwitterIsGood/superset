import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

interface Options {
	rootDir: string;
	baselineReportPath?: string;
	localDbProject?: string;
	maxCurrentMiB?: number;
	topLimit: number;
	json: boolean;
}

interface ProcessRow {
	pid: number;
	ppid: number;
	rssBytes: number;
	footprintBytes: number;
	command: string;
}

interface ContainerRow {
	name: string;
	memoryBytes: number;
	usage: string;
}

interface GroupSummary {
	label: string;
	totalBytes: number;
	count: number;
	top: ProcessRow[];
}

interface MemoryTotals {
	currentWorktreeBytes: number;
	currentWorktreeWithLooseHelpersBytes: number;
	developerToolingBytes: number;
	visibleSupersetRelatedBytes: number;
}

interface MemoryComparison {
	baselineGeneratedAt?: string;
	baselineReportPath: string;
	deltas: MemoryTotals;
}

const rootDir = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function parseOptions(argv: string[]): Options {
	const options: Options = {
		rootDir,
		topLimit: 8,
		json: false,
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
			case "baseline-report":
				options.baselineReportPath = resolve(nextValue());
				break;
			case "root":
				options.rootDir = resolve(nextValue());
				break;
			case "local-db-project":
				options.localDbProject = nextValue();
				break;
			case "max-current-mib":
				options.maxCurrentMiB = Number.parseFloat(nextValue());
				break;
			case "top":
				options.topLimit = Number.parseInt(nextValue(), 10);
				break;
			case "json":
				options.json = true;
				break;
			default:
				throw new Error(`Unknown option: --${name}`);
		}
	}

	if (!Number.isFinite(options.topLimit) || options.topLimit < 1) {
		throw new Error("--top must be a positive integer");
	}
	if (
		options.maxCurrentMiB !== undefined &&
		(!Number.isFinite(options.maxCurrentMiB) || options.maxCurrentMiB <= 0)
	) {
		throw new Error("--max-current-mib must be a positive number");
	}

	options.localDbProject ??= readEnvValue("LOCAL_DB_PROJECT", options.rootDir);
	return options;
}

function readEnvValue(name: string, root: string): string | undefined {
	const envPath = resolve(root, ".env");
	if (!existsSync(envPath)) return undefined;

	for (const line of readFileSync(envPath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex === -1) continue;
		if (trimmed.slice(0, equalsIndex) !== name) continue;
		return trimmed
			.slice(equalsIndex + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "");
	}
	return undefined;
}

function readBaselineTotals(path: string): {
	generatedAt?: string;
	totals: MemoryTotals;
} {
	if (!existsSync(path)) {
		throw new Error(`--baseline-report file not found: ${path}`);
	}
	const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new Error(`--baseline-report must contain a JSON object: ${path}`);
	}
	const record = raw as Record<string, unknown>;
	const totals = record.totals;
	if (typeof totals !== "object" || totals === null || Array.isArray(totals)) {
		throw new Error(`--baseline-report is missing totals: ${path}`);
	}
	const totalsRecord = totals as Record<string, unknown>;
	return {
		...(typeof record.generatedAt === "string" && {
			generatedAt: record.generatedAt,
		}),
		totals: {
			currentWorktreeBytes: readMemoryTotal(
				totalsRecord.currentWorktreeBytes,
				"currentWorktreeBytes",
				path,
			),
			currentWorktreeWithLooseHelpersBytes: readMemoryTotal(
				totalsRecord.currentWorktreeWithLooseHelpersBytes,
				"currentWorktreeWithLooseHelpersBytes",
				path,
			),
			developerToolingBytes: readMemoryTotal(
				totalsRecord.developerToolingBytes,
				"developerToolingBytes",
				path,
			),
			visibleSupersetRelatedBytes: readMemoryTotal(
				totalsRecord.visibleSupersetRelatedBytes,
				"visibleSupersetRelatedBytes",
				path,
			),
		},
	};
}

function readMemoryTotal(value: unknown, field: string, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(
			`--baseline-report totals.${field} must be a number: ${path}`,
		);
	}
	return value;
}

function compareTotals(
	current: MemoryTotals,
	baseline: MemoryTotals,
): MemoryTotals {
	return {
		currentWorktreeBytes:
			current.currentWorktreeBytes - baseline.currentWorktreeBytes,
		currentWorktreeWithLooseHelpersBytes:
			current.currentWorktreeWithLooseHelpersBytes -
			baseline.currentWorktreeWithLooseHelpersBytes,
		developerToolingBytes:
			current.developerToolingBytes - baseline.developerToolingBytes,
		visibleSupersetRelatedBytes:
			current.visibleSupersetRelatedBytes -
			baseline.visibleSupersetRelatedBytes,
	};
}

function listProcesses(): ProcessRow[] {
	const result = spawnSync("ps", ["-axo", "pid=,ppid=,rss=,command="], {
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || "ps failed");
	}

	const rows: ProcessRow[] = [];
	for (const line of result.stdout.split("\n")) {
		const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
		if (!match) continue;
		const rssBytes = Number.parseInt(match[3], 10) * 1024;
		rows.push({
			pid: Number.parseInt(match[1], 10),
			ppid: Number.parseInt(match[2], 10),
			rssBytes,
			footprintBytes: rssBytes,
			command: match[4],
		});
	}
	return rows;
}

function enrichWithFootprints(rows: ProcessRow[]): void {
	try {
		const metrics = require(
			resolve(rootDir, "packages/macos-process-metrics"),
		) as {
			getPhysFootprints?: (pids: number[]) => Record<number, number>;
		};
		if (typeof metrics.getPhysFootprints !== "function") return;
		const footprints = metrics.getPhysFootprints(rows.map((row) => row.pid));
		for (const row of rows) {
			const footprint = footprints[row.pid];
			if (typeof footprint === "number" && footprint > 0) {
				row.footprintBytes = footprint;
			}
		}
	} catch {
		// RSS fallback keeps the report usable on non-macOS or before native build.
	}
}

function isCurrentWorktreeProcess(row: ProcessRow, options: Options): boolean {
	if (!row.command.includes(options.rootDir)) return false;
	if (isDevMemoryReportProcess(row)) return false;
	if (isOnlineLikeServiceProcess(row)) return false;
	return (
		isSupersetProcess(row) ||
		row.command.includes(".tmp/worktree-dev") ||
		row.command.includes(".superset/worktree-dev.sh run-service") ||
		row.command.includes("/electron@") ||
		row.command.includes("/@esbuild+")
	);
}

function isDevMemoryReportProcess(row: ProcessRow): boolean {
	return row.command.includes("scripts/dev-memory-report.ts");
}

function isCurrentWorktreeAssociatedProcess(
	row: ProcessRow,
	options: Options,
): boolean {
	if (!row.command.includes(options.rootDir)) return false;
	if (isDevMemoryReportProcess(row)) return false;
	if (isOnlineLikeServiceProcess(row)) return false;
	return true;
}

function isSupersetProcess(row: ProcessRow): boolean {
	return (
		isOnlineLikeServiceProcess(row) ||
		row.command.includes("Superset (") ||
		row.command.includes("Superset.app/Contents/MacOS") ||
		row.command.includes("Superset Canary.app/Contents/MacOS") ||
		row.command.includes("electron-vite dev") ||
		row.command.includes("/apps/desktop") ||
		row.command.includes("/apps/api") ||
		row.command.includes("/apps/electric-proxy") ||
		row.command.includes("/apps/relay")
	);
}

function isOnlineLikeServiceProcess(row: ProcessRow): boolean {
	return (
		row.command.includes("scripts/superset-online.sh") ||
		row.command.includes(".tmp/online-service") ||
		row.command.includes("superset-online-")
	);
}

function isCodexAppProcess(row: ProcessRow): boolean {
	return (
		row.command.includes("/Applications/Codex.app/") ||
		row.command.includes("Codex (Renderer)") ||
		row.command.includes("Codex (Service)") ||
		row.command.includes("Codex Computer Use.app") ||
		row.command.includes("SkyComputerUse")
	);
}

function isContainerRuntimeProcess(row: ProcessRow): boolean {
	return (
		row.command.includes("/Applications/OrbStack.app/") ||
		row.command.includes("/Applications/Docker.app/") ||
		row.command.includes("com.docker.backend") ||
		row.command.includes("com.docker.vmnetd") ||
		row.command.includes("containerd") ||
		row.command.includes("dockerd")
	);
}

function summarize(
	label: string,
	rows: ProcessRow[],
	topLimit: number,
): GroupSummary {
	const sorted = [...rows].sort(
		(left, right) => right.footprintBytes - left.footprintBytes,
	);
	return {
		label,
		totalBytes: sorted.reduce((total, row) => total + row.footprintBytes, 0),
		count: sorted.length,
		top: sorted.slice(0, topLimit),
	};
}

function listContainers(): ContainerRow[] {
	const result = spawnSync(
		"docker",
		["stats", "--no-stream", "--format", "{{.Name}}\t{{.MemUsage}}"],
		{ encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
	);
	if (result.status !== 0) return [];

	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [name, usage = ""] = line.split("\t");
			const value = usage.split(" / ")[0]?.trim() ?? "";
			return {
				name,
				usage,
				memoryBytes: parseDockerMemoryBytes(value),
			};
		});
}

function parseDockerMemoryBytes(value: string): number {
	const match = value.match(/^([0-9.]+)\s*([KMGT]?i?B)$/i);
	if (!match) return 0;
	const number = Number.parseFloat(match[1]);
	const unit = match[2].toLowerCase();
	const factor =
		unit === "b"
			? 1
			: unit === "kb" || unit === "kib"
				? 1024
				: unit === "mb" || unit === "mib"
					? 1024 ** 2
					: unit === "gb" || unit === "gib"
						? 1024 ** 3
						: unit === "tb" || unit === "tib"
							? 1024 ** 4
							: 1;
	return Math.round(number * factor);
}

function formatBytes(bytes: number): string {
	const abs = Math.abs(bytes);
	if (abs >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
	if (abs >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
	if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${bytes} B`;
}

function truncate(value: string, length: number): string {
	return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}

function printProcessGroup(group: GroupSummary): void {
	console.log(
		`  ${group.label.padEnd(28)} ${formatBytes(group.totalBytes)} (${group.count} processes)`,
	);
	for (const row of group.top) {
		console.log(
			`    ${formatBytes(row.footprintBytes).padStart(10)}  rss ${formatBytes(row.rssBytes).padStart(10)}  pid ${String(row.pid).padEnd(7)} ${truncate(row.command, 120)}`,
		);
	}
}

function printContainerGroup(label: string, rows: ContainerRow[]): void {
	const total = rows.reduce((sum, row) => sum + row.memoryBytes, 0);
	console.log(
		`  ${label.padEnd(28)} ${formatBytes(total)} (${rows.length} containers)`,
	);
	for (const row of rows
		.sort((left, right) => right.memoryBytes - left.memoryBytes)
		.slice(0, 8)) {
		console.log(
			`    ${formatBytes(row.memoryBytes).padStart(10)}  ${row.name}  ${row.usage}`,
		);
	}
}

function printTotals(totals: MemoryTotals): void {
	console.log("totals:");
	console.log(
		`  current worktree app + loose helpers ${formatBytes(totals.currentWorktreeWithLooseHelpersBytes)}`,
	);
	console.log(
		`  visible Superset-related memory    ${formatBytes(totals.visibleSupersetRelatedBytes)}`,
	);
	console.log(
		`  developer tooling incl. Codex      ${formatBytes(totals.developerToolingBytes)}`,
	);
}

function printComparison(comparison: MemoryComparison): void {
	console.log("baseline comparison:");
	if (comparison.baselineGeneratedAt) {
		console.log(
			`  baseline generated at            ${comparison.baselineGeneratedAt}`,
		);
	}
	console.log(
		`  baseline report                  ${comparison.baselineReportPath}`,
	);
	console.log(
		`  current worktree delta           ${formatBytes(comparison.deltas.currentWorktreeWithLooseHelpersBytes)}`,
	);
	console.log(
		`  visible Superset-related delta   ${formatBytes(comparison.deltas.visibleSupersetRelatedBytes)}`,
	);
	console.log(
		`  developer tooling delta          ${formatBytes(comparison.deltas.developerToolingBytes)}`,
	);
}

function main() {
	const options = parseOptions(Bun.argv.slice(2));
	const processes = listProcesses();
	enrichWithFootprints(processes);

	const current = processes.filter((row) =>
		isCurrentWorktreeProcess(row, options),
	);
	const currentLooseHelpers = processes.filter(
		(row) =>
			!isCurrentWorktreeProcess(row, options) &&
			isCurrentWorktreeAssociatedProcess(row, options) &&
			!isCodexAppProcess(row),
	);
	const otherSuperset = processes.filter(
		(row) =>
			!isCurrentWorktreeProcess(row, options) &&
			!currentLooseHelpers.includes(row) &&
			isSupersetProcess(row) &&
			!isCodexAppProcess(row),
	);
	const codex = processes.filter((row) => isCodexAppProcess(row));
	const containerRuntime = processes.filter((row) =>
		isContainerRuntimeProcess(row),
	);
	const containers = listContainers();
	const currentContainers = containers.filter((container) =>
		options.localDbProject
			? container.name.startsWith(`${options.localDbProject}-`)
			: false,
	);
	const otherSupersetContainers = containers.filter(
		(container) =>
			container.name.startsWith("superset-") &&
			!currentContainers.includes(container),
	);
	const currentWorktreeSummary = summarize(
		"current worktree app",
		current,
		options.topLimit,
	);
	const currentLooseHelpersSummary = summarize(
		"current worktree loose helpers",
		currentLooseHelpers,
		options.topLimit,
	);
	const otherSupersetSummary = summarize(
		"other Superset apps",
		otherSuperset,
		options.topLimit,
	);
	const codexSummary = summarize("Codex app", codex, options.topLimit);
	const containerRuntimeSummary = summarize(
		"container runtime",
		containerRuntime,
		options.topLimit,
	);
	const currentContainerBytes = currentContainers.reduce(
		(sum, row) => sum + row.memoryBytes,
		0,
	);
	const otherSupersetContainerBytes = otherSupersetContainers.reduce(
		(sum, row) => sum + row.memoryBytes,
		0,
	);
	const totals: MemoryTotals = {
		currentWorktreeBytes: currentWorktreeSummary.totalBytes,
		currentWorktreeWithLooseHelpersBytes:
			currentWorktreeSummary.totalBytes + currentLooseHelpersSummary.totalBytes,
		visibleSupersetRelatedBytes:
			currentWorktreeSummary.totalBytes +
			currentLooseHelpersSummary.totalBytes +
			otherSupersetSummary.totalBytes +
			currentContainerBytes +
			otherSupersetContainerBytes,
		developerToolingBytes:
			currentWorktreeSummary.totalBytes +
			currentLooseHelpersSummary.totalBytes +
			otherSupersetSummary.totalBytes +
			codexSummary.totalBytes +
			containerRuntimeSummary.totalBytes +
			currentContainerBytes +
			otherSupersetContainerBytes,
	};
	const baseline = options.baselineReportPath
		? readBaselineTotals(options.baselineReportPath)
		: undefined;
	const comparison: MemoryComparison | undefined = baseline
		? {
				baselineGeneratedAt: baseline.generatedAt,
				baselineReportPath: options.baselineReportPath as string,
				deltas: compareTotals(totals, baseline.totals),
			}
		: undefined;

	const report = {
		generatedAt: new Date().toISOString(),
		rootDir: options.rootDir,
		localDbProject: options.localDbProject,
		budget: { maxCurrentMiB: options.maxCurrentMiB },
		totals,
		...(comparison && { comparison }),
		processes: {
			currentWorktree: currentWorktreeSummary,
			currentWorktreeLooseHelpers: currentLooseHelpersSummary,
			otherSuperset: otherSupersetSummary,
			codex: codexSummary,
			containerRuntime: containerRuntimeSummary,
		},
		containers: {
			currentWorktree: currentContainers,
			otherSuperset: otherSupersetContainers,
		},
	};

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	console.log("macOS footprint memory:");
	console.log(
		"  Note: footprint is the Activity Monitor / Force Quit style memory metric; RSS is shown only for comparison.",
	);
	printProcessGroup(report.processes.currentWorktree);
	if (
		options.maxCurrentMiB !== undefined &&
		report.totals.currentWorktreeWithLooseHelpersBytes >
			options.maxCurrentMiB * 1024 * 1024
	) {
		console.error(
			`  ! current worktree app + loose helpers exceeds budget: ${formatBytes(report.totals.currentWorktreeWithLooseHelpersBytes)} > ${options.maxCurrentMiB.toFixed(0)} MiB`,
		);
		process.exitCode = 1;
	}
	if (report.processes.currentWorktreeLooseHelpers.count > 0) {
		printProcessGroup(report.processes.currentWorktreeLooseHelpers);
	}
	if (report.processes.otherSuperset.count > 0) {
		printProcessGroup(report.processes.otherSuperset);
	}
	if (report.processes.codex.count > 0) {
		printProcessGroup(report.processes.codex);
	}
	if (report.processes.containerRuntime.count > 0) {
		printProcessGroup(report.processes.containerRuntime);
	}
	if (currentContainers.length > 0 || otherSupersetContainers.length > 0) {
		console.log("docker memory:");
		if (currentContainers.length > 0) {
			printContainerGroup("current worktree docker", currentContainers);
		}
		if (otherSupersetContainers.length > 0) {
			printContainerGroup("other Superset docker", otherSupersetContainers);
		}
	}
	printTotals(report.totals);
	if (comparison) {
		printComparison(comparison);
	}
}

main();
