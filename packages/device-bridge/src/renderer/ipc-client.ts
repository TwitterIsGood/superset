import { CH } from "../ipc-channels";
import type {
	CommandOrError,
	DeviceListResult,
	IpcTransport,
	ScreenshotOrError,
	StreamConfig,
} from "../types";

export class IpcClient {
	constructor(private transport: IpcTransport) {}

	listDevices(): Promise<DeviceListResult> {
		return this.transport.invoke(CH.DEVICES_LIST);
	}

	// Android
	androidScreenshot(deviceId?: string): Promise<ScreenshotOrError> {
		return this.transport.invoke(CH.ANDROID_SCREENSHOT, deviceId);
	}
	androidTap(params: {
		deviceId?: string;
		x: number;
		y: number;
	}): Promise<CommandOrError> {
		return this.transport.invoke(CH.ANDROID_TAP, params);
	}
	androidSwipe(params: {
		deviceId?: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		duration?: number;
	}): Promise<CommandOrError> {
		return this.transport.invoke(CH.ANDROID_SWIPE, params);
	}
	androidText(params: {
		deviceId?: string;
		text: string;
	}): Promise<CommandOrError> {
		return this.transport.invoke(CH.ANDROID_TEXT, params);
	}
	androidLiveStart(
		deviceId?: string,
	): Promise<(StreamConfig & { ok: true }) | { ok: false; error: string }> {
		return this.transport.invoke(CH.ANDROID_LIVE_START, deviceId);
	}
	androidLiveStop(): Promise<CommandOrError> {
		return this.transport.invoke(CH.ANDROID_LIVE_STOP);
	}
	onAndroidLiveChunk(
		cb: (chunk: { data: ArrayBuffer; timestamp: number }) => void,
	): () => void {
		return this.transport.on(CH.ANDROID_LIVE_CHUNK, cb);
	}
	onAndroidLiveStatus(cb: (msg: string) => void): () => void {
		return this.transport.on(CH.ANDROID_LIVE_STATUS, cb);
	}
	openEmulator(): Promise<
		{ ok: true; avd: string } | { ok: false; error: string }
	> {
		return this.transport.invoke(CH.ANDROID_OPEN_EMULATOR);
	}

	// iOS
	iosBoot(udid: string): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_BOOT, udid);
	}
	iosScreenshot(udid: string): Promise<ScreenshotOrError> {
		return this.transport.invoke(CH.IOS_SCREENSHOT, udid);
	}
	iosTap(params: {
		udid: string;
		x: number;
		y: number;
	}): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_TAP, params);
	}
	iosSwipe(params: {
		udid: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		duration?: number;
	}): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_SWIPE, params);
	}
	iosHome(udid: string): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_HOME, udid);
	}
	iosBack(udid: string): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_BACK, udid);
	}
	iosLiveStart(
		udid: string,
		targetKind: "simulator" | "device" = "simulator",
	): Promise<(StreamConfig & { ok: true }) | { ok: false; error: string }> {
		return this.transport.invoke(CH.IOS_LIVE_START, { udid, targetKind });
	}
	iosLiveStop(): Promise<CommandOrError> {
		return this.transport.invoke(CH.IOS_LIVE_STOP);
	}
	onIosLiveChunk(
		cb: (chunk: { data: ArrayBuffer; timestamp: number }) => void,
	): () => void {
		return this.transport.on(CH.IOS_LIVE_CHUNK, cb);
	}
	onIosLiveStatus(cb: (msg: string) => void): () => void {
		return this.transport.on(CH.IOS_LIVE_STATUS, cb);
	}
}
