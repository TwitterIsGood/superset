import { CH } from "../ipc-channels";

export function createPreloadApi(ipcRenderer: Electron.IpcRenderer) {
	return {
		listDevices: () => ipcRenderer.invoke(CH.DEVICES_LIST),

		androidScreenshot: (deviceId?: string) => ipcRenderer.invoke(CH.ANDROID_SCREENSHOT, deviceId),
		androidTap: (params: { deviceId?: string; x: number; y: number }) => ipcRenderer.invoke(CH.ANDROID_TAP, params),
		androidSwipe: (params: { deviceId?: string; x1: number; y1: number; x2: number; y2: number; duration?: number }) => ipcRenderer.invoke(CH.ANDROID_SWIPE, params),
		androidText: (params: { deviceId?: string; text: string }) => ipcRenderer.invoke(CH.ANDROID_TEXT, params),
		androidLiveStart: (deviceId?: string) => ipcRenderer.invoke(CH.ANDROID_LIVE_START, deviceId),
		androidLiveStop: () => ipcRenderer.invoke(CH.ANDROID_LIVE_STOP),
		onAndroidLiveChunk: (cb: (chunk: any) => void) => {
			const handler = (_e: any, chunk: any) => cb(chunk);
			ipcRenderer.on(CH.ANDROID_LIVE_CHUNK, handler);
			return () => ipcRenderer.removeListener(CH.ANDROID_LIVE_CHUNK, handler);
		},
		onAndroidLiveStatus: (cb: (msg: string) => void) => {
			const handler = (_e: any, msg: string) => cb(msg);
			ipcRenderer.on(CH.ANDROID_LIVE_STATUS, handler);
			return () => ipcRenderer.removeListener(CH.ANDROID_LIVE_STATUS, handler);
		},
		openEmulator: () => ipcRenderer.invoke(CH.ANDROID_OPEN_EMULATOR),

		iosBoot: (udid: string) => ipcRenderer.invoke(CH.IOS_BOOT, udid),
		iosScreenshot: (udid: string) => ipcRenderer.invoke(CH.IOS_SCREENSHOT, udid),
		iosTap: (params: { udid: string; x: number; y: number }) => ipcRenderer.invoke(CH.IOS_TAP, params),
		iosSwipe: (params: { udid: string; x1: number; y1: number; x2: number; y2: number; duration?: number }) => ipcRenderer.invoke(CH.IOS_SWIPE, params),
		iosLiveStart: (udid: string) => ipcRenderer.invoke(CH.IOS_LIVE_START, udid),
		iosLiveStop: () => ipcRenderer.invoke(CH.IOS_LIVE_STOP),
		onIosLiveChunk: (cb: (chunk: any) => void) => {
			const handler = (_e: any, chunk: any) => cb(chunk);
			ipcRenderer.on(CH.IOS_LIVE_CHUNK, handler);
			return () => ipcRenderer.removeListener(CH.IOS_LIVE_CHUNK, handler);
		},
		onIosLiveStatus: (cb: (msg: string) => void) => {
			const handler = (_e: any, msg: string) => cb(msg);
			ipcRenderer.on(CH.IOS_LIVE_STATUS, handler);
			return () => ipcRenderer.removeListener(CH.IOS_LIVE_STATUS, handler);
		},
	};
}

export type PreloadApi = ReturnType<typeof createPreloadApi>;
