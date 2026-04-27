import { run } from "../process-manager";
import { spawn } from "node:child_process";

export async function openEmulator(): Promise<{ ok: true; avd: string } | { ok: false; error: string }> {
	const result = await run("emulator", ["-list-avds"], { timeout: 8_000 });
	if (!result.ok) return { ok: false, error: result.stderr };
	const avd = result.stdout.split("\n").map((l) => l.trim()).find(Boolean);
	if (!avd) return { ok: false, error: "No Android Virtual Device found. Create one in Android Studio first." };

	const proc = spawn("emulator", ["-avd", avd], { stdio: "ignore", detached: true });
	proc.unref();
	return { ok: true, avd };
}
