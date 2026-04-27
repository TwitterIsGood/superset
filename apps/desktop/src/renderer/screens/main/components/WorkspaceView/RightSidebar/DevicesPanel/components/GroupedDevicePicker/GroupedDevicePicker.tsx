import type { DeviceListResult, IosDeviceInfo } from "@superset/device-bridge";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

export type SelectedDevice =
	| { platform: "android"; deviceId: string; label: string }
	| {
			platform: "ios";
			udid: string;
			label: string;
			targetKind: "simulator" | "device";
	  }
	| null;

interface GroupedDevicePickerProps {
	value: SelectedDevice;
	devices: DeviceListResult;
	onChange: (device: SelectedDevice) => void;
	disabled?: boolean;
}

export function GroupedDevicePicker({
	value,
	devices,
	onChange,
	disabled,
}: GroupedDevicePickerProps) {
	const [open, setOpen] = useState(false);

	const androidDevices = devices.android;
	const iosSimulators = devices.ios
		.filter((device) => device.kind === "simulator")
		.sort(
			(a, b) =>
				(a.state === "Booted" ? -1 : 0) - (b.state === "Booted" ? -1 : 0),
		);
	const iosPhysicalDevices = devices.ios.filter(
		(device) => device.kind === "device",
	);
	const iosDevices = [...iosSimulators, ...iosPhysicalDevices];

	const displayLabel = value?.label ?? "Select a device";

	let activeValue = "";
	if (value?.platform === "android") {
		const d = androidDevices.find((d) => d.id === value.deviceId);
		if (d) activeValue = `android:${d.id}:${d.kind}:${d.state}`;
	} else if (value?.platform === "ios") {
		const d = iosDevices.find((d) => d.id === value.udid);
		if (d) activeValue = iosValue(d);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="w-full justify-between font-normal text-sm"
					disabled={disabled}
				>
					<span className="truncate">{displayLabel}</span>
					<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[280px] p-0" align="start">
				<Command shouldFilter={true} defaultValue={activeValue}>
					<CommandList>
						<CommandEmpty>No devices found.</CommandEmpty>
						{androidDevices.length > 0 && (
							<CommandGroup heading="Android">
								{androidDevices.map((d) => {
									const selected =
										value?.platform === "android" && value.deviceId === d.id;
									return (
										<CommandItem
											key={`android:${d.id}`}
											value={`android:${d.id}:${d.kind}:${d.state}`}
											onSelect={() => {
												onChange({
													platform: "android",
													deviceId: d.id,
													label: `${d.kind}: ${d.id}`,
												});
												setOpen(false);
											}}
										>
											<span className="flex-1 truncate text-xs">
												{d.kind}: {d.id}
											</span>
											<span className="text-[10px] opacity-50 shrink-0">
												{d.state}
											</span>
											{selected ? (
												<CheckIcon className="size-3.5 shrink-0 opacity-70" />
											) : null}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
						<IosGroup
							heading="iOS Simulator"
							devices={iosSimulators}
							value={value}
							onChange={onChange}
							onClose={() => setOpen(false)}
						/>
						<IosGroup
							heading="iOS Device"
							devices={iosPhysicalDevices}
							value={value}
							onChange={onChange}
							onClose={() => setOpen(false)}
						/>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function IosGroup({
	heading,
	devices,
	value,
	onChange,
	onClose,
}: {
	heading: string;
	devices: IosDeviceInfo[];
	value: SelectedDevice;
	onChange: (device: SelectedDevice) => void;
	onClose: () => void;
}) {
	if (devices.length === 0) return null;
	return (
		<CommandGroup heading={heading}>
			{devices.map((d) => {
				const selected = value?.platform === "ios" && value.udid === d.id;
				return (
					<CommandItem
						key={`ios:${d.kind}:${d.id}`}
						value={iosValue(d)}
						onSelect={() => {
							onChange({
								platform: "ios",
								udid: d.id,
								label: d.name,
								targetKind: d.kind,
							});
							onClose();
						}}
					>
						<span className="flex-1 truncate text-xs">{d.name}</span>
						<span className="text-[10px] opacity-50 shrink-0">{d.state}</span>
						{selected ? (
							<CheckIcon className="size-3.5 shrink-0 opacity-70" />
						) : null}
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}

function iosValue(device: IosDeviceInfo) {
	return `ios:${device.kind}:${device.name}:${device.state}`;
}
