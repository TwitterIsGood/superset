/// <reference lib="dom" />

import type { IpcTransport, StreamConfig } from "../types";
import { AnnexBPacketizer } from "./annex-b-packetizer";
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

	// Canvas interaction
	private dragStart: { x: number; y: number } | null = null;
	private mouseDownTime: number = 0;

	constructor(canvas: HTMLCanvasElement, transport: IpcTransport) {
		this.ipc = new IpcClient(transport);
		this.canvas = canvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas 2D context is unavailable.");
		this.ctx = ctx;

		canvas.addEventListener("mousedown", this.onMouseDown);
		canvas.addEventListener("mouseup", this.onMouseUp);
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
			this.removeStatusListener = this.ipc.onAndroidLiveStatus(() => {});
			this.removeChunkListener = this.ipc.onAndroidLiveChunk((chunk) => {
				this.packetizer?.append(new Uint8Array(chunk.data));
			});

			const result = await this.ipc.androidLiveStart(opts.deviceId);
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
		this.liveTarget = null;
		this.canvas.style.display = "none";
		if (target?.platform === "android") await this.ipc.androidLiveStop();
		if (target?.platform === "ios") await this.ipc.iosLiveStop();
	}

	dispose(): void {
		void this.stopLive();
		this.canvas.removeEventListener("mousedown", this.onMouseDown);
		this.canvas.removeEventListener("mouseup", this.onMouseUp);
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

	private canvasToDevice(event: MouseEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.canvas.width / rect.width;
		const scaleY = this.canvas.height / rect.height;
		return {
			x: Math.round((event.clientX - rect.left) * scaleX),
			y: Math.round((event.clientY - rect.top) * scaleY),
		};
	}

	private onMouseDown = (event: MouseEvent): void => {
		if (!this.liveTarget) return;
		const pos = this.canvasToDevice(event);
		this.dragStart = pos;
		this.mouseDownTime = Date.now();
		this.forwardTap(pos.x, pos.y);
	};

	private onMouseUp = (event: MouseEvent): void => {
		const start = this.dragStart;
		this.dragStart = null;
		if (!start) return;
		const end = this.canvasToDevice(event);
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		// If dragged enough, also send swipe (the earlier tap is harmless)
		if (dist > 10 && Date.now() - this.mouseDownTime < 1000) {
			this.forwardSwipe(start.x, start.y, end.x, end.y);
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
	): Promise<void> {
		const t = this.liveTarget;
		if (!t) return;
		if (t.platform === "android") {
			await this.ipc.androidSwipe({ deviceId: t.deviceId, x1, y1, x2, y2 });
		} else {
			const s = t.pointScale;
			await this.ipc.iosSwipe({
				udid: t.udid,
				x1: Math.round(x1 / s),
				y1: Math.round(y1 / s),
				x2: Math.round(x2 / s),
				y2: Math.round(y2 / s),
			});
		}
	}
}
