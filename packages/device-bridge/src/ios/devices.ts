import type { IosDeviceInfo } from "../types";
import { run } from "../process-manager";

export function parseIosDevices(json: string, pointScale = 3): IosDeviceInfo[] {
	try {
		const data = JSON.parse(json);
		const devices = data?.devices ?? {};
		const result: IosDeviceInfo[] = [];
		for (const [runtime, list] of Object.entries(devices)) {
			if (!Array.isArray(list)) continue;
			for (const device of list) {
				result.push({
					id: device.udid,
					name: device.name,
					runtime,
					state: device.state,
					isAvailable: device.isAvailable !== false,
					pointScale,
				});
			}
		}
		return result;
	} catch {
		return [];
	}
}

export async function listIosDevices(pointScale?: number): Promise<{ devices: IosDeviceInfo[]; error: string | null }> {
	const result = await run("xcrun", ["simctl", "list", "devices", "available", "--json"], {
		timeout: 12_000,
		maxBuffer: 1024 * 1024 * 16,
	});
	if (!result.ok) return { devices: [], error: result.stderr };
	return { devices: parseIosDevices(result.stdout, pointScale), error: null };
}
