import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StreamConfig, LiveChunkPayload, DeviceBridgeOptions } from "../types";
import { TrackedProcessManager, run } from "../process-manager";
import { createCompanionClient, isIdbAvailable } from "./grpc-client";
import { ensureCompanion, type CompanionConfig } from "./companion";

async function getSimulatorSize(udid: string): Promise<{ width: number; height: number }> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "device-bridge-ios-size-"));
	const file = path.join(dir, "shot.png");
	try {
		const result = await run("xcrun", ["simctl", "io", udid, "screenshot", file], { timeout: 15_000 });
		if (!result.ok) throw new Error(result.stderr || "Could not capture simulator size");
		// Use electron's nativeImage or just default to iPhone 16 Pro size
		// Since we're in main process, read file and get PNG dimensions
		const buf = await readFile(file);
		// PNG width/height are at bytes 16-24 in the IHDR chunk
		const width = buf.readUInt32BE(16);
		const height = buf.readUInt32BE(20);
		return { width, height };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

export interface IosStreamState {
	stream: any;
	companion: import("node:child_process").ChildProcess | null;
}

export interface IosStreamCallbacks {
	onChunk: (chunk: LiveChunkPayload) => void;
	onStatus: (message: string) => void;
	onEnd: () => void;
}

export async function startIosStream(
	pm: TrackedProcessManager,
	udid: string,
	webContents: Electron.WebContents,
	callbacks: IosStreamCallbacks,
	options: DeviceBridgeOptions,
): Promise<{ state: IosStreamState; config: StreamConfig } | { ok: false; error: string }> {
	const port = options.grpcPort ?? 10_882;
	const protoPath = options.protoPath;
	const scale = 1;
	const fps = options.streamFps ?? 60;

	if (!isIdbAvailable(protoPath)) {
		return { ok: false, error: "idb proto not available." };
	}

	const companionConfig: CompanionConfig = {
		companionPath: options.companionPath ?? "",
		frameworkPath: options.companionFrameworkPath ?? path.dirname(options.companionPath ?? ""),
		port,
	};

	let companion: import("node:child_process").ChildProcess | null = null;
	let size: { width: number; height: number };

	try {
		if (companionConfig.companionPath) {
			companion = await ensureCompanion(pm, udid, companionConfig);
		}
		const probe = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { timeout: 2_000 });
		if (!probe.ok) return { ok: false, error: "idb_companion is not running and no companionPath provided." };

		size = await getSimulatorSize(udid);
	} catch (error: any) {
		if (companion && !companion.killed) companion.kill();
		return { ok: false, error: String(error.message ?? error) };
	}

	const width = Math.floor(size.width * scale);
	const height = Math.floor(size.height * scale);
	const client = createCompanionClient(port, protoPath);
	const stream = client.video_stream();
	const state: IosStreamState = { stream, companion };

	stream.on("data", (response: any) => {
		const data = response.payload?.data;
		if (!data || webContents.isDestroyed()) return;
		callbacks.onChunk({
			data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
			timestamp: Date.now(),
		});
	});

	stream.on("error", (error: any) => {
		callbacks.onStatus(`idb live stream error: ${error.message}`);
		if (stream) try { stream.end(); } catch {}
		callbacks.onEnd();
	});

	stream.on("end", () => {
		callbacks.onStatus("idb live stream stopped.");
		callbacks.onEnd();
	});

	stream.write({
		start: {
			fps,
			format: "H264",
			compression_quality: 1,
			scale_factor: scale,
			avg_bitrate: options.h264Bitrate ?? 50_000_000,
			key_frame_rate: fps,
		},
	});

	return {
		state,
		config: { width, height, codec: "h264", fps, scale },
	};
}

export function stopIosStream(state: IosStreamState | null): void {
	if (!state) return;
	if (state.stream) {
		try { state.stream.write({ stop: {} }); state.stream.end(); } catch {}
	}
	if (state.companion && !state.companion.killed) state.companion.kill();
}
