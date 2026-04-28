import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run, type TrackedProcessManager } from "../process-manager";
import type {
	DeviceBridgeOptions,
	LiveChunkPayload,
	StreamConfig,
} from "../types";
import { type CompanionConfig, ensureCompanion } from "./companion";
import { createCompanionClient, isIdbAvailable } from "./grpc-client";

async function getSimulatorSize(
	udid: string,
): Promise<{ width: number; height: number }> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "device-bridge-ios-size-"));
	const file = path.join(dir, "shot.png");
	try {
		const result = await run(
			"xcrun",
			["simctl", "io", udid, "screenshot", file],
			{ timeout: 15_000 },
		);
		if (!result.ok)
			throw new Error(result.stderr || "Could not capture simulator size");
		const buf = await readFile(file);
		const width = buf.readUInt32BE(16);
		const height = buf.readUInt32BE(20);
		return { width, height };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function getPhysicalDeviceSize(
	udid: string,
): Promise<{ width: number; height: number }> {
	const dir = await mkdtemp(
		path.join(os.tmpdir(), "device-bridge-ios-display-"),
	);
	const jsonFile = path.join(dir, "displays.json");
	try {
		const result = await run(
			"xcrun",
			[
				"devicectl",
				"device",
				"info",
				"displays",
				"--device",
				udid,
				"--timeout",
				"15",
				"--json-output",
				jsonFile,
			],
			{ timeout: 25_000, maxBuffer: 1024 * 1024 * 4 },
		);
		if (!result.ok)
			throw new Error(
				result.stderr || "Could not read physical device display",
			);
		const data = JSON.parse(await readFile(jsonFile, "utf8"));
		const primary = data?.result?.displays?.find(
			(display: { primary?: boolean }) => display.primary,
		);
		const size = primary?.nativeSize;
		if (!Array.isArray(size) || size.length < 2) {
			throw new Error("Physical device display size is unavailable");
		}
		return { width: Math.round(size[0]), height: Math.round(size[1]) };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

interface IosGrpcStream {
	end: () => void;
	on: (event: string, callback: (...args: unknown[]) => void) => void;
	write: (value: unknown) => void;
}

interface IosVideoStreamResponse {
	payload?: { data?: Buffer };
}

export interface IosStreamState {
	stream: IosGrpcStream;
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
): Promise<
	{ state: IosStreamState; config: StreamConfig } | { ok: false; error: string }
> {
	const port = options.grpcPort ?? 10_882;
	const protoPath = options.protoPath;
	const scale = 1;
	const fps = options.streamFps ?? 60;
	const targetKind = options.targetKind ?? "simulator";

	if (!isIdbAvailable(protoPath)) {
		return { ok: false, error: "idb proto not available." };
	}

	const companionConfig: CompanionConfig = {
		companionPath: options.companionPath ?? "",
		frameworkPath:
			options.companionFrameworkPath ??
			path.dirname(options.companionPath ?? ""),
		port,
		restart: true,
	};

	let companion: import("node:child_process").ChildProcess | null = null;
	let size: { width: number; height: number };

	try {
		callbacks.onStatus(`starting iOS ${targetKind} stream for ${udid}`);
		if (companionConfig.companionPath) {
			companion = await ensureCompanion(pm, udid, companionConfig);
		}
		const probe = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
			timeout: 2_000,
		});
		if (!probe.ok)
			return {
				ok: false,
				error: "idb_companion is not running and no companionPath provided.",
			};

		size =
			targetKind === "device"
				? await getPhysicalDeviceSize(udid)
				: await getSimulatorSize(udid);
	} catch (error) {
		if (companion && !companion.killed) companion.kill();
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const width = Math.floor(size.width * scale);
	const height = Math.floor(size.height * scale);
	const client = createCompanionClient(port, protoPath);
	const stream = client.video_stream() as IosGrpcStream;
	const state: IosStreamState = { stream, companion };

	let chunkCount = 0;
	stream.on("data", (response: unknown) => {
		const data = (response as IosVideoStreamResponse).payload?.data;
		if (!data || webContents.isDestroyed()) return;
		chunkCount++;
		if (chunkCount === 1)
			callbacks.onStatus("iOS live stream received first chunk");
		callbacks.onChunk({
			data: data.buffer.slice(
				data.byteOffset,
				data.byteOffset + data.byteLength,
			) as ArrayBuffer,
			timestamp: Date.now(),
		});
	});

	stream.on("error", (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		callbacks.onStatus(`idb live stream error: ${message}`);
		if (stream)
			try {
				stream.end();
			} catch {}
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

export async function stopIosStream(
	state: IosStreamState | null,
): Promise<void> {
	if (!state) return;
	if (state.stream) {
		try {
			state.stream.write({ stop: {} });
			state.stream.end();
		} catch {}
	}
	if (state.companion && !state.companion.killed) {
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 2_000);
			state.companion?.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
			state.companion?.kill();
		});
	}
}
