export interface AndroidDeviceInfo {
	id: string;
	state: string;
	kind: "emulator" | "device";
}

export interface IosDeviceInfo {
	id: string;
	name: string;
	runtime: string;
	state: string;
	isAvailable: boolean;
	pointScale: number;
}

export interface DeviceListResult {
	android: AndroidDeviceInfo[];
	ios: IosDeviceInfo[];
	errors: {
		android: string | null;
		ios: string | null;
	};
}

export interface StreamConfig {
	width: number;
	height: number;
	codec: "h264";
	fps: number;
	scale?: number;
}

export interface ScreenshotResult {
	ok: true;
	dataUrl: string;
}

export interface CommandResult {
	ok: true;
}

export interface ErrorResult {
	ok: false;
	error: string;
}

export type CommandOrError = CommandResult | ErrorResult;
export type ScreenshotOrError = ScreenshotResult | ErrorResult;

export interface LiveChunkPayload {
	data: ArrayBuffer;
	timestamp: number;
}

export interface DeviceBridgeOptions {
	companionPath?: string;
	companionFrameworkPath?: string;
	grpcPort?: number;
	protoPath?: string;
	h264Bitrate?: number;
	streamFps?: number;
	maxDecodeQueueSize?: number;
	enableAndroid?: boolean;
	enableIos?: boolean;
}

export interface IpcTransport {
	invoke(channel: string, ...args: any[]): Promise<any>;
	on(channel: string, callback: (...args: any[]) => void): () => void;
}
