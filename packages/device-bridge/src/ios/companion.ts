import type { ChildProcess } from "node:child_process";
import { run, type TrackedProcessManager } from "../process-manager";

export interface CompanionConfig {
	companionPath: string;
	frameworkPath: string;
	port: number;
	restart?: boolean;
}

async function getIdbCompanionPidsOnPort(port: number): Promise<number[]> {
	const result = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
	if (!result.ok) return [];
	return result.stdout
		.split("\n")
		.slice(1)
		.flatMap((line) => {
			const columns = line.trim().split(/\s+/);
			if (columns[0] !== "idb_companion") return [];
			const pid = Number(columns[1]);
			return Number.isFinite(pid) ? [pid] : [];
		});
}

async function waitForPortToClose(port: number): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 3_000) {
		const result = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
			timeout: 1_000,
		});
		if (!result.ok) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

export async function ensureCompanion(
	pm: TrackedProcessManager,
	udid: string,
	config: CompanionConfig,
): Promise<ChildProcess | null> {
	const probe = await run(
		"lsof",
		["-nP", `-iTCP:${config.port}`, "-sTCP:LISTEN"],
		{ timeout: 2_000 },
	);
	if (probe.ok) {
		if (!config.restart) return null;
		const pids = await getIdbCompanionPidsOnPort(config.port);
		if (pids.length === 0) {
			throw new Error(`Port ${config.port} is already in use.`);
		}
		for (const pid of pids) {
			try {
				process.kill(pid, "TERM");
			} catch {}
		}
		await waitForPortToClose(config.port);
	}

	const proc = pm.spawn(
		config.companionPath,
		["--udid", udid, "--grpc-port", String(config.port)],
		{
			stdio: ["ignore", "ignore", "pipe"],
			env: {
				...process.env,
				DYLD_FRAMEWORK_PATH: [
					config.frameworkPath,
					`${config.frameworkPath}/Frameworks`,
					process.env.DYLD_FRAMEWORK_PATH,
				]
					.filter(Boolean)
					.join(":"),
			},
		},
	);
	let stderr = "";
	proc.stderr?.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	await new Promise<void>((resolve, reject) => {
		const startedAt = Date.now();
		const timer = setInterval(async () => {
			const result = await run(
				"lsof",
				["-nP", `-iTCP:${config.port}`, "-sTCP:LISTEN"],
				{ timeout: 2_000 },
			);
			if (result.ok) {
				clearInterval(timer);
				resolve();
			} else if (proc.exitCode !== null) {
				clearInterval(timer);
				reject(
					new Error(
						`idb_companion exited with code ${proc.exitCode}: ${stderr.trim()}`,
					),
				);
			} else if (Date.now() - startedAt > 12_000) {
				clearInterval(timer);
				reject(
					new Error(`Timed out waiting for idb_companion. ${stderr.trim()}`),
				);
			}
		}, 300);
	});

	return proc;
}
