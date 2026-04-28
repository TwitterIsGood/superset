// @ts-nocheck — runs in Electron renderer with DOM/WebCodecs types
import {
	type DecodeRecoveryState,
	selectDecodeUnit,
} from "./h264-decoder-queue";

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
	private fps = 60;
	private recoveryState: DecodeRecoveryState = {
		waitingForKeyframe: false,
		cachedParameterSets: null,
	};
	private decoderConfig: VideoDecoderConfig | null = null;
	private onStatus?: (msg: string) => void;
	private isResettingDecoder = false;

	constructor(
		private canvas: HTMLCanvasElement,
		private ctx: CanvasRenderingContext2D,
		config?: { maxQueueSize?: number },
	) {
		this.maxQueue = config?.maxQueueSize ?? 8;
	}

	async configure(config: H264DecoderConfig): Promise<void> {
		if (typeof VideoDecoder === "undefined") {
			throw new Error(
				"WebCodecs VideoDecoder is not available in this environment.",
			);
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

		if (
			this.canvas.width !== config.width ||
			this.canvas.height !== config.height
		) {
			this.canvas.width = config.width;
			this.canvas.height = config.height;
		}

		this.fps = config.fps > 0 ? config.fps : 60;
		this.frameIndex = 0;
		this.recoveryState = {
			waitingForKeyframe: false,
			cachedParameterSets: null,
		};
		this.decoderConfig = support.config ?? videoConfig;
		this.onStatus = config.onStatus;
		this.decoder = this.createDecoder();
		this.decoder.configure(this.decoderConfig);
	}

	decode(data: Uint8Array): void {
		if (!this.decoder || this.decoder.state === "closed") return;
		const decision = selectDecodeUnit(
			data,
			this.recoveryState,
			this.decoder.decodeQueueSize,
			this.maxQueue,
		);
		if (decision.action === "drop") return;

		if (decision.resetDecoder) this.resetDecoder();
		const chunk = new EncodedVideoChunk({
			type: decision.keyframe ? "key" : "delta",
			timestamp: Math.round((this.frameIndex * 1_000_000) / this.fps),
			data: decision.data,
		});
		this.frameIndex++;
		try {
			this.decoder.decode(chunk);
		} catch {
			this.recoveryState.waitingForKeyframe = true;
			this.resetDecoder();
		}
	}

	close(): void {
		if (this.decoder && this.decoder.state !== "closed") {
			this.decoder.close();
		}
		this.decoder = null;
		this.frameIndex = 0;
		this.recoveryState = {
			waitingForKeyframe: false,
			cachedParameterSets: null,
		};
		this.decoderConfig = null;
		this.onStatus = undefined;
	}

	private createDecoder(): VideoDecoder {
		return new VideoDecoder({
			output: (frame) => {
				this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
				frame.close();
			},
			error: (error) => {
				this.onStatus?.(`WebCodecs decode error: ${error.message}`);
				this.recoveryState.waitingForKeyframe = true;
				this.resetDecoder();
			},
		});
	}

	private resetDecoder(): void {
		if (!this.decoderConfig || this.isResettingDecoder) return;
		this.isResettingDecoder = true;
		try {
			if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
			this.decoder = this.createDecoder();
			this.decoder.configure(this.decoderConfig);
		} finally {
			this.isResettingDecoder = false;
		}
	}

	get state(): string {
		return this.decoder?.state ?? "unconfigured";
	}
}
