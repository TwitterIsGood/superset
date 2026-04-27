import { ipcMain } from "electron";
import type { DeviceBridgeOptions } from "./types";
import { CH } from "./ipc-channels";
import { TrackedProcessManager } from "./process-manager";
import { listAndroidDevices, screenshot as androidScreenshot, tap as androidTap, swipe as androidSwipe, text as androidText, startAndroidStream, openEmulator } from "./android";
import { listIosDevices, screenshot as iosScreenshot, boot as iosBoot, startIosStream, stopIosStream, hidTap, hidSwipe, type IosStreamState } from "./ios";
import { run } from "./process-manager";

export function registerDeviceBridge(
	webContents: Electron.WebContents,
	options: DeviceBridgeOptions = {},
): { dispose: () => void } {
	const pm = new TrackedProcessManager();
	let androidStop: (() => void) | null = null;
	let iosState: IosStreamState | null = null;

	const grpcPort = options.grpcPort ?? 10_882;

	const handlers: Array<() => void> = [];

	function handle(channel: string, handler: (...args: any[]) => Promise<any>) {
		ipcMain.handle(channel, handler);
		handlers.push(() => ipcMain.removeHandler(channel));
	}

	// Devices
	handle(CH.DEVICES_LIST, async () => {
		const [adb, ios] = await Promise.all([
			options.enableAndroid !== false ? listAndroidDevices() : { devices: [], error: null },
			options.enableIos !== false ? listIosDevices() : { devices: [], error: null },
		]);
		return {
			android: adb.devices,
			ios: ios.devices,
			errors: { android: adb.error, ios: ios.error },
		};
	});

	// Android
	handle(CH.ANDROID_SCREENSHOT, async (_e, deviceId?: string) => androidScreenshot(deviceId));
	handle(CH.ANDROID_TAP, async (_e, params: { deviceId?: string; x: number; y: number }) => androidTap(params.deviceId, params.x, params.y));
	handle(CH.ANDROID_SWIPE, async (_e, params: { deviceId?: string; x1: number; y1: number; x2: number; y2: number; duration?: number }) => androidSwipe(params.deviceId, params.x1, params.y1, params.x2, params.y2, params.duration));
	handle(CH.ANDROID_TEXT, async (_e, params: { deviceId?: string; text: string }) => androidText(params.deviceId, params.text));

	handle(CH.ANDROID_LIVE_START, async (_e, deviceId?: string) => {
		androidStop?.();
		androidStop = null;
		try {
			const result = await startAndroidStream(pm, deviceId, {
				onChunk: (chunk) => { if (!webContents.isDestroyed()) webContents.send(CH.ANDROID_LIVE_CHUNK, chunk); },
				onStatus: (msg) => { if (!webContents.isDestroyed()) webContents.send(CH.ANDROID_LIVE_STATUS, msg); },
				onEnd: () => { androidStop = null; },
			}, options.h264Bitrate, options.streamFps);
			androidStop = result.stop;
			return { ok: true, ...result.config };
		} catch (error: any) {
			return { ok: false, error: error.message };
		}
	});

	handle(CH.ANDROID_LIVE_STOP, async () => { androidStop?.(); androidStop = null; return { ok: true }; });
	handle(CH.ANDROID_OPEN_EMULATOR, async () => openEmulator());

	// iOS
	handle(CH.IOS_BOOT, async (_e, udid: string) => iosBoot(udid));
	handle(CH.IOS_SCREENSHOT, async (_e, udid: string) => iosScreenshot(udid));

	handle(CH.IOS_TAP, async (_e, params: { udid: string; x: number; y: number }) => {
		return hidTap(grpcPort, params.udid, params.x, params.y, options.protoPath);
	});

	handle(CH.IOS_SWIPE, async (_e, params: { udid: string; x1: number; y1: number; x2: number; y2: number; duration?: number }) => {
		return hidSwipe(grpcPort, params.udid, params.x1, params.y1, params.x2, params.y2, params.duration, options.protoPath);
	});

	handle(CH.IOS_LIVE_START, async (_e, udid: string) => {
		stopIosStream(iosState);
		iosState = null;
		const result = await startIosStream(pm, udid, webContents, {
			onChunk: (chunk) => { if (!webContents.isDestroyed()) webContents.send(CH.IOS_LIVE_CHUNK, chunk); },
			onStatus: (msg) => { if (!webContents.isDestroyed()) webContents.send(CH.IOS_LIVE_STATUS, msg); },
			onEnd: () => { iosState = null; },
		}, options);
		if (!("state" in result)) return result;
		iosState = result.state;
		return { ok: true, ...result.config };
	});

	handle(CH.IOS_LIVE_STOP, async () => { stopIosStream(iosState); iosState = null; return { ok: true }; });

	// Cleanup on window destroy
	webContents.once("destroyed", () => {
		androidStop?.();
		stopIosStream(iosState);
		pm.killAll();
	});

	return {
		dispose: () => {
			for (const remove of handlers) remove();
			androidStop?.();
			stopIosStream(iosState);
			pm.killAll();
		},
	};
}
