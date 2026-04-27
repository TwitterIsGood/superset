import type { StreamConfig, LiveChunkPayload } from "../types";
import { run, TrackedProcessManager } from "../process-manager";

function parseWmSize(output: string): { width: number; height: number } | null {
	const match = output.match(/Physical size:\s*(\d+)x(\d+)/i) || output.match(/Override size:\s*(\d+)x(\d+)/i);
	if (!match) return null;
	return { width: Number(match[1]), height: Number(match[2]) };
}

export async function getAndroidSize(deviceId?: string): Promise<{ width: number; height: number }> {
	const args = deviceId ? ["-s", deviceId, "shell", "wm", "size"] : ["shell", "wm", "size"];
	const result = await run("adb", args, { timeout: 8_000 });
	if (!result.ok) throw new Error(result.stderr || "Could not read Android screen size");
	return parseWmSize(result.stdout) ?? { width: 1080, height: 2400 };
}

export interface AndroidStreamCallbacks {
	onChunk: (chunk: LiveChunkPayload) => void;
	onStatus: (message: string) => void;
	onEnd: () => void;
}

export async function startAndroidStream(
	pm: TrackedProcessManager,
	deviceId: string | undefined,
	callbacks: AndroidStreamCallbacks,
	bitrate = 30_000_000,
	fps = 60,
): Promise<{ config: StreamConfig; stop: () => void }> {
	const size = await getAndroidSize(deviceId);

	const sizeArgs = deviceId
		? ["-s", deviceId, "exec-out", "screenrecord", "--output-format=h264", "--bit-rate", String(bitrate), "--size", `${size.width}x${size.height}`, "-"]
		: ["exec-out", "screenrecord", "--output-format=h264", "--bit-rate", String(bitrate), "--size", `${size.width}x${size.height}`, "-"];

	const proc = pm.spawn("adb", sizeArgs as string[], { stdio: ["ignore", "pipe", "pipe"] });
	let stderr = "";

	proc.stdout!.on("data", (data: Buffer) => {
		callbacks.onChunk({
			data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
			timestamp: Date.now(),
		});
	});

	proc.stderr!.on("data", (data: Buffer) => {
		stderr += data.toString();
	});

	proc.on("close", (_code, signal) => {
		if (signal !== "SIGINT" && stderr.trim()) {
			callbacks.onStatus(stderr.trim());
		}
		callbacks.onEnd();
	});

	return {
		config: { width: size.width, height: size.height, codec: "h264", fps },
		stop: () => { if (!proc.killed) proc.kill("SIGINT"); },
	};
}
