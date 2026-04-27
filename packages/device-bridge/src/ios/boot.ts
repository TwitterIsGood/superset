import { spawn } from "node:child_process";
import { run } from "../process-manager";

export async function boot(
	udid: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const result = await run("xcrun", ["simctl", "boot", udid], {
		timeout: 15_000,
	});
	if (
		!result.ok &&
		!/Unable to boot device in current state: Booted/i.test(result.stderr)
	) {
		return { ok: false, error: result.stderr };
	}
	spawn("open", ["-a", "Simulator"], {
		stdio: "ignore",
		detached: true,
	}).unref();
	return { ok: true };
}
