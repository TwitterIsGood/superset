import { run } from "../process-manager";

function deviceArgs(deviceId: string | undefined, ...base: string[]): string[] {
	return deviceId ? ["-s", deviceId, ...base] : base;
}

export async function tap(deviceId: string | undefined, x: number, y: number) {
	const result = await run(
		"adb",
		deviceArgs(deviceId, "shell", "input", "tap", String(x), String(y)),
		{ timeout: 8_000 },
	);
	return result.ok
		? { ok: true as const }
		: { ok: false as const, error: result.stderr };
}

export async function swipe(
	deviceId: string | undefined,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	duration?: number,
) {
	const dur = duration ?? 300;
	const result = await run(
		"adb",
		deviceArgs(
			deviceId,
			"shell",
			"input",
			"swipe",
			String(x1),
			String(y1),
			String(x2),
			String(y2),
			String(dur),
		),
		{ timeout: 8_000 },
	);
	return result.ok
		? { ok: true as const }
		: { ok: false as const, error: result.stderr };
}

export async function text(deviceId: string | undefined, value: string) {
	const escaped = value.replace(/%/g, "%s").replace(/\s/g, "%s");
	const result = await run(
		"adb",
		deviceArgs(deviceId, "shell", "input", "text", escaped),
		{ timeout: 8_000 },
	);
	return result.ok
		? { ok: true as const }
		: { ok: false as const, error: result.stderr };
}

export async function keyevent(deviceId: string | undefined, keyCode: number) {
	const result = await run(
		"adb",
		deviceArgs(deviceId, "shell", "input", "keyevent", String(keyCode)),
		{ timeout: 8_000 },
	);
	return result.ok
		? { ok: true as const }
		: { ok: false as const, error: result.stderr };
}

export async function home(deviceId: string | undefined) {
	return keyevent(deviceId, 3);
}

export async function back(deviceId: string | undefined) {
	return keyevent(deviceId, 4);
}
