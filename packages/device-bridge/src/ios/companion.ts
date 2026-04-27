import type { ChildProcess } from "node:child_process";
import { run, TrackedProcessManager } from "../process-manager";

export interface CompanionConfig {
	companionPath: string;
	frameworkPath: string;
	port: number;
}

export async function ensureCompanion(
	pm: TrackedProcessManager,
	udid: string,
	config: CompanionConfig,
): Promise<ChildProcess | null> {
	const probe = await run("lsof", ["-nP", `-iTCP:${config.port}`, "-sTCP:LISTEN"], { timeout: 2_000 });
	if (probe.ok) return null;

	const proc = pm.spawn(
		config.companionPath,
		["--udid", udid, "--grpc-port", String(config.port)],
		{
			stdio: "ignore",
			env: { ...process.env, DYLD_FRAMEWORK_PATH: config.frameworkPath },
		},
	);

	await new Promise<void>((resolve, reject) => {
		const startedAt = Date.now();
		const timer = setInterval(async () => {
			const result = await run("lsof", ["-nP", `-iTCP:${config.port}`, "-sTCP:LISTEN"], { timeout: 2_000 });
			if (result.ok) {
				clearInterval(timer);
				resolve();
			} else if (Date.now() - startedAt > 12_000) {
				clearInterval(timer);
				reject(new Error("Timed out waiting for idb_companion."));
			}
		}, 300);
	});

	return proc;
}
