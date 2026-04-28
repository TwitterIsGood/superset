import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunOptions {
	timeout?: number;
	maxBuffer?: number;
	encoding?: BufferEncoding | "buffer";
	env?: NodeJS.ProcessEnv;
}

export interface RunResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	code?: string;
}

export async function run(
	command: string,
	args: string[],
	options: RunOptions = {},
): Promise<RunResult> {
	try {
		const result = await execFileAsync(command, args, {
			timeout: options.timeout ?? 15_000,
			maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
			env: options.env ?? process.env,
			encoding: options.encoding ?? "utf8",
		});
		return {
			ok: true,
			stdout: result.stdout as string,
			stderr: result.stderr as string,
		};
	} catch (error) {
		const failed = error as Partial<{
			stdout: unknown;
			stderr: unknown;
			message: unknown;
			code: string;
		}>;
		return {
			ok: false,
			stdout: String(failed.stdout ?? ""),
			stderr: String(failed.stderr ?? failed.message),
			code: failed.code,
		};
	}
}

export class TrackedProcessManager {
	private processes: Set<ChildProcess> = new Set();

	track(proc: ChildProcess): ChildProcess {
		this.processes.add(proc);
		proc.on("exit", () => this.processes.delete(proc));
		return proc;
	}

	spawn(
		command: string,
		args: string[],
		options?: Parameters<typeof spawn>[2],
	): ChildProcess {
		const proc = spawn(command, args, options ?? {});
		return this.track(proc);
	}

	async killAll(): Promise<void> {
		for (const proc of this.processes) {
			if (!proc.killed) proc.kill();
		}
		this.processes.clear();
	}
}
