import { execFile } from "node:child_process";

const DEFAULT_ESCALATION_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 50;

/**
 * Kill a process tree with escalation to SIGKILL if the process survives.
 * Sends SIGTERM, polls for exit, escalates to SIGKILL after timeout.
 */
export function treeKillWithEscalation({
	pid,
	signal = "SIGTERM",
	escalationTimeoutMs = DEFAULT_ESCALATION_TIMEOUT_MS,
}: {
	pid: number;
	signal?: string;
	escalationTimeoutMs?: number;
}): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		let resolved = false;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		let escalationTimer: ReturnType<typeof setTimeout> | null = null;

		const clearTimers = () => {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			if (escalationTimer) {
				clearTimeout(escalationTimer);
				escalationTimer = null;
			}
		};

		const doResolve = (result: { success: boolean; error?: string }) => {
			if (resolved) return;
			resolved = true;
			clearTimers();
			resolve(result);
		};

		void signalProcessTree(pid, signal).then((result) => {
			if (resolved) return;

			if (!result.success) {
				console.error(
					`[treeKillWithEscalation] Failed to ${signal} pid ${pid}:`,
					result.error,
				);
			}

			if (!isProcessAlive(pid)) {
				doResolve({ success: true });
				return;
			}

			pollTimer = setInterval(() => {
				if (!isProcessAlive(pid)) {
					doResolve({ success: true });
				}
			}, POLL_INTERVAL_MS);
			pollTimer.unref();
		});

		escalationTimer = setTimeout(() => {
			escalationTimer = null;
			if (resolved) return;

			if (!isProcessAlive(pid)) {
				doResolve({ success: true });
				return;
			}

			console.log(
				`[treeKillWithEscalation] Process ${pid} still alive after ${signal}, escalating to SIGKILL`,
			);

			void signalProcessTree(pid, "SIGKILL").then((result) => {
				if (resolved) return;

				if (!result.success) {
					console.error(
						`[treeKillWithEscalation] Failed to SIGKILL pid ${pid}:`,
						result.error,
					);
					doResolve({ success: false, error: result.error });
				} else {
					doResolve({ success: true });
				}
			});
		}, escalationTimeoutMs);
		escalationTimer.unref();
	});
}

async function signalProcessTree(
	pid: number,
	signal: string,
): Promise<{ success: boolean; error?: string }> {
	const pids = await collectProcessTree(pid);
	let lastError: string | undefined;

	for (const currentPid of pids) {
		try {
			process.kill(currentPid, signal as NodeJS.Signals);
		} catch (error) {
			if (isProcessNotFoundError(error as Error)) continue;
			lastError =
				error instanceof Error
					? error.message
					: `Failed to signal ${currentPid}`;
		}
	}

	return lastError ? { success: false, error: lastError } : { success: true };
}

async function collectProcessTree(
	pid: number,
	seen = new Set<number>(),
): Promise<number[]> {
	if (seen.has(pid)) return [];
	seen.add(pid);

	const children = await listChildPids(pid);
	const descendants: number[] = [];
	for (const child of children) {
		descendants.push(...(await collectProcessTree(child, seen)));
	}

	return [...descendants, pid];
}

function listChildPids(pid: number): Promise<number[]> {
	if (process.platform === "win32") return Promise.resolve([]);

	return new Promise((resolve) => {
		execFile(
			"pgrep",
			["-P", String(pid)],
			{ timeout: 1000 },
			(error, stdout) => {
				if (error || !stdout.trim()) {
					resolve([]);
					return;
				}

				resolve(
					stdout
						.split(/\s+/)
						.map((entry) => Number.parseInt(entry, 10))
						.filter((entry) => Number.isInteger(entry) && entry > 0),
				);
			},
		);
	});
}

/**
 * ESRCH = dead, EPERM = alive (process exists but we lack permission)
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

function isProcessNotFoundError(err: Error): boolean {
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ESRCH") return true;
	const message = err.message ?? "";
	return message.includes("ESRCH") || message.includes("No such process");
}
