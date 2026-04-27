import type { AndroidDeviceInfo } from "../types";
import { run } from "../process-manager";

export function parseAdbDevices(output: string): AndroidDeviceInfo[] {
	return output
		.split("\n")
		.slice(1)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const parts = line.split(/\s+/);
			const id = parts[0] ?? "";
			const state = parts[1] ?? "";
			return { id, state, kind: (id.startsWith("emulator-") ? "emulator" : "device") as AndroidDeviceInfo["kind"] };
		});
}

export async function listAndroidDevices(): Promise<{ devices: AndroidDeviceInfo[]; error: string | null }> {
	const result = await run("adb", ["devices"], { timeout: 8_000 });
	if (!result.ok) return { devices: [], error: result.stderr };
	return { devices: parseAdbDevices(result.stdout), error: null };
}
