import type { IpcTransport } from "@superset/device-bridge";

declare global {
	interface Window {
		deviceBridge: import("@superset/device-bridge/preload").PreloadApi;
	}
}

export function createIpcTransport(): IpcTransport {
	const bridge = window.deviceBridge as Record<string, unknown>;
	return {
		invoke: <T>(channel: string, ...args: unknown[]) => {
			const method = channelToMethod(channel);
			const fn = bridge[method];
			if (typeof fn !== "function") {
				throw new Error(`Unknown device-bridge channel: ${channel}`);
			}
			return (fn as (...args: unknown[]) => Promise<T>)(...args);
		},
		on: <T extends unknown[]>(
			channel: string,
			callback: (...args: T) => void,
		) => {
			const method = channelToMethod(channel);
			const fn = bridge[method];
			if (typeof fn !== "function") {
				throw new Error(`Unknown device-bridge channel: ${channel}`);
			}
			return (fn as (cb: (...args: T) => void) => () => void)(callback);
		},
	};
}

function channelToMethod(channel: string): string {
	const map: Record<string, string> = {
		"device-bridge:devices:list": "listDevices",
		"device-bridge:android:screenshot": "androidScreenshot",
		"device-bridge:android:tap": "androidTap",
		"device-bridge:android:swipe": "androidSwipe",
		"device-bridge:android:text": "androidText",
		"device-bridge:android:home": "androidHome",
		"device-bridge:android:back": "androidBack",
		"device-bridge:android:liveStart": "androidLiveStart",
		"device-bridge:android:liveStop": "androidLiveStop",
		"device-bridge:android:liveChunk": "onAndroidLiveChunk",
		"device-bridge:android:liveStatus": "onAndroidLiveStatus",
		"device-bridge:android:openEmulator": "openEmulator",
		"device-bridge:ios:boot": "iosBoot",
		"device-bridge:ios:screenshot": "iosScreenshot",
		"device-bridge:ios:tap": "iosTap",
		"device-bridge:ios:swipe": "iosSwipe",
		"device-bridge:ios:home": "iosHome",
		"device-bridge:ios:back": "iosBack",
		"device-bridge:ios:liveStart": "iosLiveStart",
		"device-bridge:ios:liveStop": "iosLiveStop",
		"device-bridge:ios:liveChunk": "onIosLiveChunk",
		"device-bridge:ios:liveStatus": "onIosLiveStatus",
	};
	const method = map[channel];
	if (!method) throw new Error(`Unknown device-bridge channel: ${channel}`);
	return method;
}
