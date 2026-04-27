// @ts-nocheck — runs in Electron renderer with DOM/WebCodecs types
import { H264Decoder } from "./h264-decoder";
import { AnnexBPacketizer } from "./annex-b-packetizer";
import { IpcClient } from "./ipc-client";
import type { IpcTransport, StreamConfig } from "../types";

type Platform = "android" | "ios";
type LiveTarget = { platform: Platform; deviceId?: string; udid?: string; pointScale: number };

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

	constructor(canvas: HTMLCanvasElement, transport: IpcTransport) {
		this.ipc = new IpcClient(transport);
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d")!;

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

	async startLive(platform: Platform, opts: { deviceId?: string; udid?: string; pointScale?: number }): Promise<StreamConfig | null> {
		this.stopLive();

		const pointScale = opts.pointScale ?? (platform === "ios" ? 3 : 1);
		this.liveTarget = { platform, deviceId: opts.deviceId, udid: opts.udid, pointScale };

		if (platform === "android") {
			this.removeStatusListener = this.ipc.onAndroidLiveStatus(() => {});
			this.removeChunkListener = this.ipc.onAndroidLiveChunk((chunk) => {
				this.packetizer?.append(new Uint8Array(chunk.data));
			});

			const result = await this.ipc.androidLiveStart(opts.deviceId);
			if (!result.ok) { this.stopLive(); return null; }

			await this.initDecoder({ ...result, fps: result.fps });
			this.packetizer = new AnnexBPacketizer((unit) => this.decoder?.decode(unit));
			return result;
		}

		// iOS
		this.removeStatusListener = this.ipc.onIosLiveStatus(() => {});
		this.removeChunkListener = this.ipc.onIosLiveChunk((chunk) => {
			this.decoder?.decode(new Uint8Array(chunk.data));
		});

		const result = await this.ipc.iosLiveStart(opts.udid!);
		if (!result.ok) { this.stopLive(); return null; }

		await this.initDecoder({ ...result, fps: result.fps });
		return result;
	}

	stopLive(): void {
		this.removeChunkListener?.();
		this.removeStatusListener?.();
		this.removeChunkListener = null;
		this.removeStatusListener = null;
		this.decoder?.close();
		this.decoder = null;
		this.packetizer = null;
		this.liveTarget = null;
		this.canvas.style.display = "none";
	}

	dispose(): void {
		this.stopLive();
		this.canvas.removeEventListener("mousedown", this.onMouseDown);
		this.canvas.removeEventListener("mouseup", this.onMouseUp);
	}

	private async initDecoder(config: { width: number; height: number; fps: number }) {
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
		this.dragStart = this.canvasToDevice(event);
		(this.canvas as any).setPointerCapture?.(event.pointerId);
	};

	private onMouseUp = (event: MouseEvent): void => {
		if (!this.dragStart) return;
		const end = this.canvasToDevice(event);
		const dx = end.x - this.dragStart.x;
		const dy = end.y - this.dragStart.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 10) {
			this.forwardTap(this.dragStart.x, this.dragStart.y);
		} else {
			this.forwardSwipe(this.dragStart.x, this.dragStart.y, end.x, end.y);
		}
		this.dragStart = null;
	};

	private async forwardTap(x: number, y: number): Promise<void> {
		const t = this.liveTarget;
		if (!t) return;
		if (t.platform === "android") {
			await this.ipc.androidTap({ deviceId: t.deviceId, x, y });
		} else {
			await this.ipc.iosTap({ udid: t.udid!, x: Math.round(x / t.pointScale), y: Math.round(y / t.pointScale) });
		}
	}

	private async forwardSwipe(x1: number, y1: number, x2: number, y2: number): Promise<void> {
		const t = this.liveTarget;
		if (!t) return;
		if (t.platform === "android") {
			await this.ipc.androidSwipe({ deviceId: t.deviceId, x1, y1, x2, y2 });
		} else {
			const s = t.pointScale;
			await this.ipc.iosSwipe({ udid: t.udid!, x1: Math.round(x1 / s), y1: Math.round(y1 / s), x2: Math.round(x2 / s), y2: Math.round(y2 / s) });
		}
	}
}
