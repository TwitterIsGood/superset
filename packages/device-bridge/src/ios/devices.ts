import path from "node:path";
import { run } from "../process-manager";
import type { DeviceBridgeOptions, IosDeviceInfo } from "../types";

interface IdbTarget {
	model?: string;
	name?: string;
	os_version?: string;
	state?: string;
	type?: string;
	udid?: string;
}

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
					kind: "simulator",
				});
			}
		}
		return result;
	} catch {
		return [];
	}
}

export function parseIdbPhysicalDevices(output: string): IosDeviceInfo[] {
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("{"))
		.flatMap((line) => {
			try {
				const target = JSON.parse(line) as IdbTarget;
				if (target.type !== "Device" || !target.udid) return [];
				return [
					{
						id: target.udid,
						name: target.name ?? target.model ?? target.udid,
						runtime: target.os_version ?? "iOS Device",
						state: target.state ?? "Unknown",
						isAvailable: target.state !== "Shutdown",
						pointScale: 3,
						kind: "device" as const,
					},
				];
			} catch {
				return [];
			}
		});
}

async function listIosSimulators(
	pointScale?: number,
): Promise<{ devices: IosDeviceInfo[]; error: string | null }> {
	const result = await run(
		"xcrun",
		["simctl", "list", "devices", "available", "--json"],
		{
			timeout: 12_000,
			maxBuffer: 1024 * 1024 * 16,
		},
	);
	if (!result.ok) return { devices: [], error: result.stderr };
	return { devices: parseIosDevices(result.stdout, pointScale), error: null };
}

async function listPhysicalIosDevices(options: DeviceBridgeOptions): Promise<{
	devices: IosDeviceInfo[];
	error: string | null;
}> {
	if (!options.companionPath) return { devices: [], error: null };
	const frameworkPath =
		options.companionFrameworkPath ?? path.dirname(options.companionPath);
	const result = await run(
		options.companionPath,
		["--list", "1", "--only", "device"],
		{
			timeout: 20_000,
			maxBuffer: 1024 * 1024 * 16,
			env: {
				...process.env,
				DYLD_FRAMEWORK_PATH: [
					frameworkPath,
					`${frameworkPath}/Frameworks`,
					process.env.DYLD_FRAMEWORK_PATH,
				]
					.filter(Boolean)
					.join(":"),
			},
		},
	);
	if (!result.ok) return { devices: [], error: result.stderr };
	return { devices: parseIdbPhysicalDevices(result.stdout), error: null };
}

export async function listIosDevices(
	pointScale?: number,
	options: DeviceBridgeOptions = {},
): Promise<{
	devices: IosDeviceInfo[];
	error: string | null;
}> {
	const [simulators, physical] = await Promise.all([
		listIosSimulators(pointScale),
		listPhysicalIosDevices(options),
	]);
	return {
		devices: [...simulators.devices, ...physical.devices],
		error:
			[simulators.error, physical.error].filter(Boolean).join("\n") || null,
	};
}
