/// <reference lib="dom" />

import type { IpcTransport, StreamConfig } from "../types";
import { AnnexBPacketizer } from "./annex-b-packetizer";
import { classifyGesture, type GestureStart } from "./gesture";
import { H264Decoder } from "./h264-decoder";
import { IpcClient } from "./ipc-client";

type Platform = "android" | "ios";
type LiveTarget =
	| { platform: "android"; deviceId?: string; pointScale: number }
	| { platform: "ios"; udid: string; pointScale: number };

export class DeviceStream {
	private ipc: IpcClient;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private decoder: H264Decoder | null = null;
	private packetizer: AnnexBPacketizer | null = null;
	private liveTarget: LiveTarget | null = null;
	private removeChunkListener: (() => void) | null = null;
	private removeStatusListener: (() => void) | null = null;
	private pendingChunks: Uint8Array[] = [];
	private pendingChunkBytes = 0;
	private readonly maxPendingChunkBytes = 8 * 1024 * 1024;

	// Canvas interaction
	private gestureStart: GestureStart | null = null;

	constructor(canvas: HTMLCanvasElement, transport: IpcTransport) {
		this.ipc = new IpcClient(transport);
		this.canvas = canvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas 2D context is unavailable.");
		this.ctx = ctx;

		canvas.addEventListener("pointerdown", this.onPointerDown);
		canvas.addEventListener("pointerup", this.onPointerUp);
		canvas.addEventListener("pointercancel", this.onPointerCancel);
		canvas.style.cursor = "pointer";
	}

	async listDevices() {
		return this.ipc.listDevices();
	}

	async screenshot(platform: Platform, id: string): Promise<string | null> {
		if (platform === "android") {
			const result = await this.ipc.androidScreenshot(id);
			return result.ok ? result.dataUrl : null;
		}
		const result = await this.ipc.iosScreenshot(id);
		return result.ok ? result.dataUrl : null;
	}

	async startLive(
		platform: Platform,
		opts: {
			deviceId?: string;
			udid?: string;
			pointScale?: number;
			targetKind?: "simulator" | "device";
		},
	): Promise<StreamConfig | null> {
		await this.stopLive();

		const pointScale = opts.pointScale ?? (platform === "ios" ? 3 : 1);

		if (platform === "android") {
			this.liveTarget = { platform, deviceId: opts.deviceId, pointScale };
			let config: StreamConfig | null = null;
			this.removeStatusListener = this.ipc.onAndroidLiveStatus((message) => {
				if (
					typeof message === "string" &&
					message.includes("Restarting Android")
				) {
					this.resetDecoder(config);
				}
			});
			this.removeChunkListener = this.ipc.onAndroidLiveChunk((chunk) => {
				this.appendLiveChunk(new Uint8Array(chunk.data));
			});

			const result = await this.ipc.androidLiveStart(opts.deviceId);
			if (!result.ok) {
				this.stopLive();
				throw new Error(result.error);
			}

			config = result;
			await this.initDecoder({ ...result, fps: result.fps });
			this.packetizer = new AnnexBPacketizer((unit) =>
				this.decoder?.decode(unit),
			);
			this.flushPendingChunks();
			return result;
		}

		if (!opts.udid) return null;
		this.liveTarget = { platform, udid: opts.udid, pointScale };
		this.removeStatusListener = this.ipc.onIosLiveStatus(() => {});
		this.removeChunkListener = this.ipc.onIosLiveChunk((chunk) => {
			this.packetizer?.append(new Uint8Array(chunk.data));
		});

		const result = await this.ipc.iosLiveStart(
			opts.udid,
			opts.targetKind ?? "simulator",
		);
		if (!result.ok) {
			this.stopLive();
			throw new Error(result.error);
		}

		await this.initDecoder({ ...result, fps: result.fps });
		this.packetizer = new AnnexBPacketizer((unit) =>
			this.decoder?.decode(unit),
		);
		return result;
	}

	async stopLive(): Promise<void> {
		const target = this.liveTarget;
		this.removeChunkListener?.();
		this.removeStatusListener?.();
		this.removeChunkListener = null;
		this.removeStatusListener = null;
		this.decoder?.close();
		this.decoder = null;
		this.packetizer = null;
		this.clearPendingChunks();
		this.liveTarget = null;
		this.canvas.style.display = "none";
		if (target?.platform === "android") await this.ipc.androidLiveStop();
		if (target?.platform === "ios") await this.ipc.iosLiveStop();
	}

	dispose(): void {
		void this.stopLive();
		this.canvas.removeEventListener("pointerdown", this.onPointerDown);
		this.canvas.removeEventListener("pointerup", this.onPointerUp);
		this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
	}

	private async initDecoder(config: {
		width: number;
		height: number;
		fps: number;
	}) {
		this.canvas.style.display = "block";
		this.decoder = new H264Decoder(this.canvas, this.ctx);
		await this.decoder.configure(config);
	}

	private resetDecoder(config: StreamConfig | null): void {
		if (!config) return;
		this.decoder?.close();
		this.packetizer?.reset();
		this.clearPendingChunks();
		this.decoder = new H264Decoder(this.canvas, this.ctx);
		void this.decoder.configure(config);
	}

	private appendLiveChunk(chunk: Uint8Array): void {
		if (this.packetizer) {
			this.packetizer.append(chunk);
			return;
		}

		this.pendingChunks.push(chunk);
		this.pendingChunkBytes += chunk.byteLength;
		while (
			this.pendingChunkBytes > this.maxPendingChunkBytes &&
			this.pendingChunks.length > 0
		) {
			const dropped = this.pendingChunks.shift();
			this.pendingChunkBytes -= dropped?.byteLength ?? 0;
		}
	}

	private flushPendingChunks(): void {
		const packetizer = this.packetizer;
		if (!packetizer) return;
		for (const chunk of this.pendingChunks) packetizer.append(chunk);
		this.clearPendingChunks();
	}

	private clearPendingChunks(): void {
		this.pendingChunks = [];
		this.pendingChunkBytes = 0;
	}

	private canvasToDevice(event: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.canvas.width / rect.width;
		const scaleY = this.canvas.height / rect.height;
		return {
			x: Math.round((event.clientX - rect.left) * scaleX),
			y: Math.round((event.clientY - rect.top) * scaleY),
		};
	}

	private onPointerDown = (event: PointerEvent): void => {
		if (!this.liveTarget || event.button !== 0) return;
		const pos = this.canvasToDevice(event);
		this.gestureStart = { ...pos, timestamp: Date.now() };
		this.canvas.setPointerCapture(event.pointerId);
	};

	private onPointerUp = (event: PointerEvent): void => {
		const start = this.gestureStart;
		this.gestureStart = null;
		if (!start) return;
		if (this.canvas.hasPointerCapture(event.pointerId)) {
			this.canvas.releasePointerCapture(event.pointerId);
		}
		const gesture = classifyGesture(
			start,
			this.canvasToDevice(event),
			Date.now(),
		);
		if (gesture.type === "tap") {
			this.forwardTap(gesture.x, gesture.y);
			return;
		}
		this.forwardSwipe(
			gesture.x1,
			gesture.y1,
			gesture.x2,
			gesture.y2,
			gesture.duration,
		);
	};

	private onPointerCancel = (event: PointerEvent): void => {
		this.gestureStart = null;
		if (this.canvas.hasPointerCapture(event.pointerId)) {
			this.canvas.releasePointerCapture(event.pointerId);
		}
	};

	private async forwardTap(x: number, y: number): Promise<void> {
		const t = this.liveTarget;
		if (!t) return;
		if (t.platform === "android") {
			await this.ipc.androidTap({ deviceId: t.deviceId, x, y });
		} else {
			await this.ipc.iosTap({
				udid: t.udid,
				x: Math.round(x / t.pointScale),
				y: Math.round(y / t.pointScale),
			});
		}
	}

	private async forwardSwipe(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		duration: number,
	): Promise<void> {
		const t = this.liveTarget;
		if (!t) return;
		if (t.platform === "android") {
			await this.ipc.androidSwipe({
				deviceId: t.deviceId,
				x1,
				y1,
				x2,
				y2,
				duration,
			});
		} else {
			const s = t.pointScale;
			await this.ipc.iosSwipe({
				udid: t.udid,
				x1: Math.round(x1 / s),
				y1: Math.round(y1 / s),
				x2: Math.round(x2 / s),
				y2: Math.round(y2 / s),
				duration,
			});
		}
	}
}
