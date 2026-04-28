import { DeviceStream } from "@superset/device-bridge/renderer";
import { useCallback, useEffect, useRef, useState } from "react";
import { createIpcTransport } from "./ipc-transport";

export function useDeviceStream(
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
	const streamRef = useRef<DeviceStream | null>(null);
	const transportRef = useRef<ReturnType<typeof createIpcTransport> | null>(
		null,
	);
	const [isConnected, setIsConnected] = useState(false);

	useEffect(() => {
		transportRef.current = createIpcTransport();
		setIsConnected(true);
		return () => {
			transportRef.current = null;
			setIsConnected(false);
		};
	}, []);

	useEffect(() => {
		return () => {
			streamRef.current?.dispose();
			streamRef.current = null;
		};
	}, []);

	const listDevices = useCallback(async () => {
		if (transportRef.current) {
			return transportRef.current.invoke(
				"device-bridge:devices:list",
			) as Promise<import("@superset/device-bridge").DeviceListResult>;
		}
		return {
			android: [],
			ios: [],
			errors: { android: null, ios: null },
		};
	}, []);

	const startLive = useCallback(
		async (
			platform: "android" | "ios",
			opts: {
				deviceId?: string;
				udid?: string;
				targetKind?: "simulator" | "device";
			},
		): Promise<{
			config: import("@superset/device-bridge").StreamConfig | null;
			error: string | null;
		}> => {
			const canvas = canvasRef.current;
			const transport = transportRef.current;
			if (!canvas || !transport) {
				return {
					config: null,
					error: `Missing ${!canvas ? "canvas" : "transport"}`,
				};
			}

			await streamRef.current?.stopLive();
			streamRef.current?.dispose();
			streamRef.current = null;

			try {
				const stream = new DeviceStream(canvas, transport);
				streamRef.current = stream;
				const result = await stream.startLive(platform, opts);
				if (!result) {
					return {
						config: null,
						error: "Live stream failed to start. Try again.",
					};
				}
				return { config: result, error: null };
			} catch (error) {
				streamRef.current?.dispose();
				streamRef.current = null;
				return {
					config: null,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
		[canvasRef],
	);

	const stopLive = useCallback(() => {
		void streamRef.current?.stopLive();
	}, []);

	const bootIos = useCallback(async (udid: string) => {
		if (!transportRef.current) return { ok: false, error: "No transport" };
		return transportRef.current.invoke(
			"device-bridge:ios:boot",
			udid,
		) as Promise<{ ok: boolean; error?: string }>;
	}, []);

	const screenshot = useCallback(
		async (
			platform: "android" | "ios",
			opts: {
				deviceId?: string;
				udid?: string;
				targetKind?: "simulator" | "device";
			},
		) => {
			const transport = transportRef.current;
			if (!transport) return null;
			if (platform === "android") {
				const result = await transport.invoke<
					{ ok: true; dataUrl: string } | { ok: false; error: string }
				>("device-bridge:android:screenshot", opts.deviceId);
				return result.ok ? result.dataUrl : null;
			}
			if (!opts.udid) return null;
			if (opts.targetKind === "device") {
				const canvas = canvasRef.current;
				return canvas ? canvas.toDataURL("image/png") : null;
			}
			const result = await transport.invoke<
				{ ok: true; dataUrl: string } | { ok: false; error: string }
			>("device-bridge:ios:screenshot", opts.udid);
			return result.ok ? result.dataUrl : null;
		},
		[canvasRef],
	);

	const pressHome = useCallback(
		async (
			platform: "android" | "ios",
			opts: { deviceId?: string; udid?: string },
		) => {
			const transport = transportRef.current;
			if (!transport) return { ok: false, error: "No transport" };
			if (platform === "android") {
				return transport.invoke(
					"device-bridge:android:home",
					opts.deviceId,
				) as Promise<{
					ok: boolean;
					error?: string;
				}>;
			}
			if (!opts.udid) return { ok: false, error: "No iOS device selected" };
			return transport.invoke("device-bridge:ios:home", opts.udid) as Promise<{
				ok: boolean;
				error?: string;
			}>;
		},
		[],
	);

	const pressBack = useCallback(
		async (
			platform: "android" | "ios",
			opts: { deviceId?: string; udid?: string },
		) => {
			const transport = transportRef.current;
			if (!transport) return { ok: false, error: "No transport" };
			if (platform === "android") {
				return transport.invoke(
					"device-bridge:android:back",
					opts.deviceId,
				) as Promise<{
					ok: boolean;
					error?: string;
				}>;
			}
			if (!opts.udid) return { ok: false, error: "No iOS device selected" };
			return transport.invoke("device-bridge:ios:back", opts.udid) as Promise<{
				ok: boolean;
				error?: string;
			}>;
		},
		[],
	);

	return {
		isConnected,
		listDevices,
		startLive,
		stopLive,
		bootIos,
		screenshot,
		pressHome,
		pressBack,
	};
}
