// @ts-nocheck — runs in Electron renderer with DOM/WebCodecs types
import { hasIdrFrame } from "./h264-utils";

export interface H264DecoderConfig {
	width: number;
	height: number;
	fps: number;
	maxQueueSize?: number;
	onStatus?: (msg: string) => void;
}

export class H264Decoder {
	private decoder: VideoDecoder | null = null;
	private frameIndex = 0;
	private maxQueue: number;

	constructor(
		private canvas: HTMLCanvasElement,
		private ctx: CanvasRenderingContext2D,
		config?: { maxQueueSize?: number },
	) {
		this.maxQueue = config?.maxQueueSize ?? 8;
	}

	async configure(config: H264DecoderConfig): Promise<void> {
		if (typeof VideoDecoder === "undefined") {
			throw new Error("WebCodecs VideoDecoder is not available in this environment.");
		}

		const videoConfig = {
			codec: "avc1.640033" as const,
			codedWidth: config.width,
			codedHeight: config.height,
			optimizeForLatency: true,
			hardwareAcceleration: "prefer-hardware" as const,
		};

		const support = await VideoDecoder.isConfigSupported(videoConfig);
		if (!support.supported) {
			throw new Error("H264 WebCodecs decoding is not supported.");
		}

		if (this.canvas.width !== config.width || this.canvas.height !== config.height) {
			this.canvas.width = config.width;
			this.canvas.height = config.height;
		}

		this.frameIndex = 0;
		this.decoder = new VideoDecoder({
			output: (frame) => {
				this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
				frame.close();
			},
			error: (error) => config.onStatus?.(`WebCodecs decode error: ${error.message}`),
		});

		this.decoder.configure(support.config ?? videoConfig);
	}

	decode(data: Uint8Array): void {
		if (!this.decoder || this.decoder.state === "closed") return;
		if (this.decoder.decodeQueueSize > this.maxQueue) return;

		const chunk = new EncodedVideoChunk({
			type: hasIdrFrame(data) ? "key" : "delta",
			timestamp: Math.round((this.frameIndex * 1_000_000) / 60),
			data,
		});
		this.frameIndex++;
		this.decoder.decode(chunk);
	}

	close(): void {
		if (this.decoder && this.decoder.state !== "closed") {
			this.decoder.close();
		}
		this.decoder = null;
		this.frameIndex = 0;
	}

	get state(): string {
		return this.decoder?.state ?? "unconfigured";
	}
}
