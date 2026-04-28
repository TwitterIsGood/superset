import type { DeviceListResult } from "@superset/device-bridge";
import { Button } from "@superset/ui/button";
import { CameraIcon, CornerDownLeftIcon, HomeIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDeviceStream } from "renderer/lib/device-bridge";
import { DevicePreview } from "./components/DevicePreview";
import {
	GroupedDevicePicker,
	type SelectedDevice,
} from "./components/GroupedDevicePicker";

function areDeviceListsEqual(
	a: DeviceListResult,
	b: DeviceListResult,
): boolean {
	return (
		a.errors.android === b.errors.android &&
		a.errors.ios === b.errors.ios &&
		a.android.length === b.android.length &&
		a.ios.length === b.ios.length &&
		a.android.every((device, index) => {
			const other = b.android[index];
			return (
				other !== undefined &&
				device.id === other.id &&
				device.state === other.state &&
				device.kind === other.kind
			);
		}) &&
		a.ios.every((device, index) => {
			const other = b.ios[index];
			return (
				other !== undefined &&
				device.id === other.id &&
				device.name === other.name &&
				device.runtime === other.runtime &&
				device.state === other.state &&
				device.isAvailable === other.isAvailable &&
				device.pointScale === other.pointScale &&
				device.kind === other.kind
			);
		})
	);
}

export function DevicesPanel() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const {
		bootIos,
		isConnected,
		listDevices,
		pressBack,
		pressHome,
		screenshot,
		startLive,
		stopLive,
	} = useDeviceStream(canvasRef);

	const [selectedDevice, setSelectedDeviceRaw] = useState<SelectedDevice>(
		() => {
			try {
				const saved = localStorage.getItem("devices-selected");
				return saved ? JSON.parse(saved) : null;
			} catch {
				return null;
			}
		},
	);

	const setSelectedDevice = useCallback((device: SelectedDevice) => {
		setSelectedDeviceRaw(device);
		if (device) {
			localStorage.setItem("devices-selected", JSON.stringify(device));
		} else {
			localStorage.removeItem("devices-selected");
		}
	}, []);

	const [devices, setDevices] = useState<DeviceListResult>({
		android: [],
		ios: [],
		errors: { android: null, ios: null },
	});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const devicesRef = useRef(devices);
	const isRefreshInFlightRef = useRef(false);
	devicesRef.current = devices;

	const refreshDevices = useCallback(async () => {
		if (isRefreshInFlightRef.current) return;
		isRefreshInFlightRef.current = true;
		try {
			const result = await listDevices();
			if (!areDeviceListsEqual(devicesRef.current, result)) {
				devicesRef.current = result;
				setDevices(result);
			}
		} catch (err) {
			console.error("[DevicesPanel] Failed to list devices:", err);
		} finally {
			isRefreshInFlightRef.current = false;
		}
	}, [listDevices]);

	useEffect(() => {
		refreshDevices();
		const interval = setInterval(refreshDevices, 5000);
		return () => clearInterval(interval);
	}, [refreshDevices]);

	const runSelectedAction = useCallback(
		async (action: "home" | "back" | "screenshot"): Promise<void> => {
			const device = selectedDevice;
			if (!device) return;
			setError(null);
			const opts =
				device.platform === "android"
					? { deviceId: device.deviceId }
					: { udid: device.udid, targetKind: device.targetKind };
			if (action === "home") {
				const result = await pressHome(device.platform, opts);
				if (!result.ok) setError(result.error ?? "Failed to press Home");
				return;
			}
			if (action === "back") {
				const result = await pressBack(device.platform, opts);
				if (!result.ok) setError(result.error ?? "Failed to go back");
				return;
			}
			const dataUrl = await screenshot(device.platform, opts);
			if (!dataUrl) {
				setError("Failed to capture screenshot");
				return;
			}
			const link = document.createElement("a");
			link.href = dataUrl;
			link.download = `superset-${device.platform}-${Date.now()}.png`;
			link.click();
		},
		[pressBack, pressHome, screenshot, selectedDevice],
	);

	useEffect(() => {
		const device = selectedDevice;
		if (!device) {
			stopLive();
			setIsLoading(false);
			setError(null);
			return;
		}

		const platform = device.platform;
		const deviceId =
			device.platform === "android" ? device.deviceId : undefined;
		const udid = device.platform === "ios" ? device.udid : undefined;
		const targetKind =
			device.platform === "ios"
				? (device.targetKind ??
					devicesRef.current.ios.find(
						(iosDevice) => iosDevice.id === device.udid,
					)?.kind ??
					"simulator")
				: undefined;

		let cancelled = false;
		setIsLoading(true);
		setError(null);

		async function connect() {
			if (platform === "ios" && udid && targetKind === "simulator") {
				const iosDev = devicesRef.current.ios.find((d) => d.id === udid);
				if (iosDev && iosDev.state !== "Booted") {
					const bootResult = await bootIos(udid);
					if (!bootResult.ok) {
						if (!cancelled) {
							setIsLoading(false);
							setError(bootResult.error ?? "Failed to boot simulator");
						}
						return;
					}
					refreshDevices();
				}
			}
			// Retry up to 3 times — companion may need time to restart after HMR
			for (let attempt = 0; attempt < 3; attempt++) {
				if (cancelled) return;
				const { config, error: liveError } = await startLive(platform, {
					deviceId,
					udid,
					targetKind,
				});
				if (config) {
					if (!cancelled) setIsLoading(false);
					return;
				}
				if (attempt < 2 && !cancelled) {
					await new Promise((r) => setTimeout(r, 2000));
				} else if (!cancelled) {
					setIsLoading(false);
					if (liveError) setError(liveError);
				}
			}
		}

		connect();
		return () => {
			cancelled = true;
		};
	}, [bootIos, refreshDevices, selectedDevice, startLive, stopLive]);

	const actionsDisabled = !selectedDevice || !isConnected;

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="shrink-0 px-3 pt-3 pb-2 border-b flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<GroupedDevicePicker
						value={selectedDevice}
						devices={devices}
						onChange={setSelectedDevice}
						disabled={!isConnected}
					/>
				</div>
				<div className="shrink-0 grid grid-cols-3 gap-1">
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={actionsDisabled}
						onClick={() => runSelectedAction("home")}
						title="Home"
					>
						<HomeIcon className="size-3.5" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={actionsDisabled}
						onClick={() => runSelectedAction("screenshot")}
						title="截图"
					>
						<CameraIcon className="size-3.5" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={actionsDisabled}
						onClick={() => runSelectedAction("back")}
						title="回退"
					>
						<CornerDownLeftIcon className="size-3.5" />
					</Button>
				</div>
			</div>
			{error && (
				<div className="shrink-0 px-3 py-2 text-xs text-red-500 bg-red-500/10 border-b break-all">
					{error}
				</div>
			)}
			<DevicePreview
				canvasRef={canvasRef}
				isConnected={isConnected}
				isLoading={isLoading}
				deviceLabel={selectedDevice?.label}
			/>
		</div>
	);
}
