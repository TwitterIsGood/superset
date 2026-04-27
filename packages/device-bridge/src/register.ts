import { dirname } from "node:path";
import { ipcMain } from "electron";
import {
	back as androidBack,
	home as androidHome,
	screenshot as androidScreenshot,
	swipe as androidSwipe,
	tap as androidTap,
	text as androidText,
	listAndroidDevices,
	openEmulator,
	startAndroidStream,
} from "./android";
import {
	type CompanionConfig,
	ensureCompanion,
	hidBack,
	hidHome,
	hidSwipe,
	hidTap,
	type IosStreamState,
	boot as iosBoot,
	screenshot as iosScreenshot,
	listIosDevices,
	startIosStream,
	stopIosStream,
} from "./ios";
import { CH } from "./ipc-channels";
import { TrackedProcessManager } from "./process-manager";
import type { DeviceBridgeOptions } from "./types";

export function registerDeviceBridge(
	webContents: Electron.WebContents,
	options: DeviceBridgeOptions = {},
): { dispose: () => void } {
	const pm = new TrackedProcessManager();
	let androidStop: (() => void) | null = null;
	let iosState: IosStreamState | null = null;

	const grpcPort = options.grpcPort ?? 10_882;

	const handlers: Array<() => void> = [];

	async function ensureIosActionCompanion(udid: string) {
		if (!options.companionPath) return;
		const companionConfig: CompanionConfig = {
			companionPath: options.companionPath,
			frameworkPath:
				options.companionFrameworkPath ?? dirname(options.companionPath),
			port: grpcPort,
		};
		await ensureCompanion(pm, udid, companionConfig);
	}

	function handle(
		channel: string,
		handler: Parameters<typeof ipcMain.handle>[1],
	) {
		ipcMain.handle(channel, handler);
		handlers.push(() => ipcMain.removeHandler(channel));
	}

	// Devices
	handle(CH.DEVICES_LIST, async () => {
		const [adb, ios] = await Promise.all([
			options.enableAndroid !== false
				? listAndroidDevices()
				: { devices: [], error: null },
			options.enableIos !== false
				? listIosDevices(undefined, options)
				: { devices: [], error: null },
		]);
		return {
			android: adb.devices,
			ios: ios.devices,
			errors: { android: adb.error, ios: ios.error },
		};
	});

	// Android
	handle(CH.ANDROID_SCREENSHOT, async (_e, deviceId?: string) =>
		androidScreenshot(deviceId),
	);
	handle(
		CH.ANDROID_TAP,
		async (_e, params: { deviceId?: string; x: number; y: number }) =>
			androidTap(params.deviceId, params.x, params.y),
	);
	handle(
		CH.ANDROID_SWIPE,
		async (
			_e,
			params: {
				deviceId?: string;
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				duration?: number;
			},
		) =>
			androidSwipe(
				params.deviceId,
				params.x1,
				params.y1,
				params.x2,
				params.y2,
				params.duration,
			),
	);
	handle(
		CH.ANDROID_TEXT,
		async (_e, params: { deviceId?: string; text: string }) =>
			androidText(params.deviceId, params.text),
	);
	handle(CH.ANDROID_HOME, async (_e, deviceId?: string) =>
		androidHome(deviceId),
	);
	handle(CH.ANDROID_BACK, async (_e, deviceId?: string) =>
		androidBack(deviceId),
	);

	handle(CH.ANDROID_LIVE_START, async (_e, deviceId?: string) => {
		androidStop?.();
		androidStop = null;
		try {
			const result = await startAndroidStream(
				pm,
				deviceId,
				{
					onChunk: (chunk) => {
						if (!webContents.isDestroyed())
							webContents.send(CH.ANDROID_LIVE_CHUNK, chunk);
					},
					onStatus: (msg) => {
						if (!webContents.isDestroyed())
							webContents.send(CH.ANDROID_LIVE_STATUS, msg);
					},
					onEnd: () => {
						androidStop = null;
					},
				},
				options.h264Bitrate,
				options.streamFps,
			);
			androidStop = result.stop;
			return { ok: true, ...result.config };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	handle(CH.ANDROID_LIVE_STOP, async () => {
		androidStop?.();
		androidStop = null;
		return { ok: true };
	});
	handle(CH.ANDROID_OPEN_EMULATOR, async () => openEmulator());

	// iOS
	handle(CH.IOS_BOOT, async (_e, udid: string) => iosBoot(udid));
	handle(CH.IOS_SCREENSHOT, async (_e, udid: string) => iosScreenshot(udid));

	handle(
		CH.IOS_TAP,
		async (_e, params: { udid: string; x: number; y: number }) => {
			return hidTap(grpcPort, params.x, params.y, options.protoPath);
		},
	);

	handle(
		CH.IOS_SWIPE,
		async (
			_e,
			params: {
				udid: string;
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				duration?: number;
			},
		) => {
			return hidSwipe(
				grpcPort,
				params.x1,
				params.y1,
				params.x2,
				params.y2,
				params.duration,
				options.protoPath,
			);
		},
	);
	handle(CH.IOS_HOME, async (_e, udid: string) => {
		try {
			await ensureIosActionCompanion(udid);
			return hidHome(grpcPort, options.protoPath);
		} catch (error) {
			return {
				ok: false as const,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
	handle(CH.IOS_BACK, async (_e, udid: string) => {
		try {
			await ensureIosActionCompanion(udid);
			return hidBack(grpcPort, options.protoPath);
		} catch (error) {
			return {
				ok: false as const,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	handle(
		CH.IOS_LIVE_START,
		async (
			_e,
			params: string | { udid: string; targetKind?: "simulator" | "device" },
		) => {
			const udid = typeof params === "string" ? params : params.udid;
			const targetKind =
				typeof params === "string" ? "simulator" : params.targetKind;
			await stopIosStream(iosState);
			iosState = null;
			const result = await startIosStream(
				pm,
				udid,
				webContents,
				{
					onChunk: (chunk) => {
						if (!webContents.isDestroyed())
							webContents.send(CH.IOS_LIVE_CHUNK, chunk);
					},
					onStatus: (msg) => {
						console.log(`[device-bridge:ios] ${msg}`);
						if (!webContents.isDestroyed())
							webContents.send(CH.IOS_LIVE_STATUS, msg);
					},
					onEnd: () => {
						iosState = null;
					},
				},
				{ ...options, targetKind },
			);
			if (!("state" in result)) return result;
			iosState = result.state;
			return { ok: true, ...result.config };
		},
	);

	handle(CH.IOS_LIVE_STOP, async () => {
		await stopIosStream(iosState);
		iosState = null;
		return { ok: true };
	});

	// Cleanup on window destroy
	webContents.once("destroyed", () => {
		androidStop?.();
		void stopIosStream(iosState);
		pm.killAll();
	});

	return {
		dispose: () => {
			for (const remove of handlers) remove();
			androidStop?.();
			void stopIosStream(iosState);
			pm.killAll();
		},
	};
}
