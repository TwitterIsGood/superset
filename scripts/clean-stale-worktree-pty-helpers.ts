import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface Options {
	rootDir: string;
	minAgeMinutes: number;
	dryRun: boolean;
	json: boolean;
}

export interface ProcessRow {
	pid: number;
	ppid: number;
	pgid: number;
	rssKiB: number;
	elapsedSeconds: number;
	command: string;
}

interface CleanupResult {
	candidates: ProcessRow[];
	signalled: Array<{ pid: number; pgid: number; signal: NodeJS.Signals }>;
	errors: Array<{ pid: number; message: string }>;
}

const DEFAULT_MIN_AGE_MINUTES = 30;
const rootDir = resolve(import.meta.dirname, "..");

function parseOptions(argv: string[]): Options {
	const options: Options = {
		rootDir,
		minAgeMinutes: DEFAULT_MIN_AGE_MINUTES,
		dryRun: false,
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
			case "root":
				options.rootDir = resolve(nextValue());
				break;
			case "min-age-minutes":
				options.minAgeMinutes = Number.parseFloat(nextValue());
				break;
			case "dry-run":
				options.dryRun = true;
				break;
			case "json":
				options.json = true;
				break;
			default:
				throw new Error(`Unknown option: --${name}`);
		}
	}

	if (!Number.isFinite(options.minAgeMinutes) || options.minAgeMinutes < 0) {
		throw new Error("--min-age-minutes must be a non-negative number");
	}

	return options;
}

export function parseElapsedSeconds(value: string): number | null {
	const match = value.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d{1,2}):(\d{2})$/);
	if (!match) return null;

	const days = Number.parseInt(match[1] ?? "0", 10);
	const hours = Number.parseInt(match[2] ?? "0", 10);
	const minutes = Number.parseInt(match[3], 10);
	const seconds = Number.parseInt(match[4], 10);
	if (![days, hours, minutes, seconds].every((part) => Number.isFinite(part))) {
		return null;
	}

	return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

export function parsePsOutput(output: string): ProcessRow[] {
	const rows: ProcessRow[] = [];
	for (const line of output.split("\n")) {
		const match = line
			.trim()
			.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
		if (!match) continue;
		const elapsedSeconds = parseElapsedSeconds(match[5]);
		if (elapsedSeconds === null) continue;
		rows.push({
			pid: Number.parseInt(match[1], 10),
			ppid: Number.parseInt(match[2], 10),
			pgid: Number.parseInt(match[3], 10),
			rssKiB: Number.parseInt(match[4], 10),
			elapsedSeconds,
			command: match[6],
		});
	}
	return rows;
}

function listProcesses(): ProcessRow[] {
	const result = spawnSync(
		"ps",
		["-axo", "pid=,ppid=,pgid=,rss=,etime=,command="],
		{ encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		throw new Error(result.stderr || "ps failed");
	}
	return parsePsOutput(result.stdout);
}

export function isStaleWorktreePtyHelper(
	row: ProcessRow,
	options: Pick<Options, "rootDir" | "minAgeMinutes">,
): boolean {
	if (row.pid <= 1 || row.pgid <= 1) return false;
	if (row.pid === process.pid || row.pgid === process.pid) return false;
	if (row.ppid !== 1) return false;
	if (row.elapsedSeconds < options.minAgeMinutes * 60) return false;
	if (!row.command.includes(options.rootDir)) return false;
	if (!row.command.includes("node-pty@")) return false;
	if (!/(^|\s|\/)spawn-helper(\s|$)/.test(row.command)) return false;
	return true;
}

function cleanup(options: Options): CleanupResult {
	const candidates = listProcesses().filter((row) =>
		isStaleWorktreePtyHelper(row, options),
	);
	const result: CleanupResult = {
		candidates,
		signalled: [],
		errors: [],
	};

	if (options.dryRun) return result;

	for (const row of candidates) {
		try {
			process.kill(-row.pgid, "SIGTERM");
			result.signalled.push({
				pid: row.pid,
				pgid: row.pgid,
				signal: "SIGTERM",
			});
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ESRCH") continue;
			result.errors.push({
				pid: row.pid,
				message: (error as Error).message,
			});
		}
	}

	return result;
}

function printResult(result: CleanupResult, options: Options): void {
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (result.candidates.length === 0) {
		console.log("[clean-stale-worktree-pty-helpers] no stale helpers found");
		return;
	}

	const action = options.dryRun ? "would signal" : "signalled";
	for (const row of result.candidates) {
		console.log(
			`[clean-stale-worktree-pty-helpers] ${action} pid=${row.pid} pgid=${row.pgid} age=${Math.round(row.elapsedSeconds / 60)}m rss=${row.rssKiB}KiB ${row.command}`,
		);
	}
	for (const error of result.errors) {
		console.error(
			`[clean-stale-worktree-pty-helpers] failed pid=${error.pid}: ${error.message}`,
		);
	}
}

function main() {
	const options = parseOptions(Bun.argv.slice(2));
	const result = cleanup(options);
	printResult(result, options);
	if (result.errors.length > 0) {
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	main();
}
