export const CH = {
	DEVICES_LIST: "device-bridge:devices:list",

	ANDROID_SCREENSHOT: "device-bridge:android:screenshot",
	ANDROID_TAP: "device-bridge:android:tap",
	ANDROID_SWIPE: "device-bridge:android:swipe",
	ANDROID_TEXT: "device-bridge:android:text",
	ANDROID_LIVE_START: "device-bridge:android:liveStart",
	ANDROID_LIVE_STOP: "device-bridge:android:liveStop",
	ANDROID_LIVE_CHUNK: "device-bridge:android:liveChunk",
	ANDROID_LIVE_STATUS: "device-bridge:android:liveStatus",
	ANDROID_OPEN_EMULATOR: "device-bridge:android:openEmulator",

	IOS_BOOT: "device-bridge:ios:boot",
	IOS_SCREENSHOT: "device-bridge:ios:screenshot",
	IOS_TAP: "device-bridge:ios:tap",
	IOS_SWIPE: "device-bridge:ios:swipe",
	IOS_LIVE_START: "device-bridge:ios:liveStart",
	IOS_LIVE_STOP: "device-bridge:ios:liveStop",
	IOS_LIVE_CHUNK: "device-bridge:ios:liveChunk",
	IOS_LIVE_STATUS: "device-bridge:ios:liveStatus",
} as const;
