import { Host } from "@expo/ui/swift-ui";
import { requireNativeView } from "expo";
import type { NativeSyntheticEvent } from "react-native";
import type {
	NativeTerminalConnectionState,
	NativeTerminalViewProps,
} from "./NativeTerminalView.types";

type NativeTerminalNativeViewProps = Omit<
	NativeTerminalViewProps,
	"onReady" | "onConnectionStateChange" | "onData" | "style"
> & {
	onReady?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
	onConnectionStateChange?: (
		event: NativeSyntheticEvent<{ state: NativeTerminalConnectionState }>,
	) => void;
	onData?: (
		event: NativeSyntheticEvent<{
			frameType: "binary" | "text";
			byteCount: number;
			totalBytes: number;
		}>,
	) => void;
};

const NativeView: React.ComponentType<NativeTerminalNativeViewProps> =
	requireNativeView("NativeTerminal");

export function NativeTerminalView({
	onReady,
	onConnectionStateChange,
	onData,
	style,
	...props
}: NativeTerminalViewProps) {
	return (
		<Host style={style}>
			<NativeView
				{...props}
				onReady={() => {
					onReady?.();
				}}
				onConnectionStateChange={({ nativeEvent: { state } }) => {
					onConnectionStateChange?.(state);
				}}
				onData={({ nativeEvent }) => {
					onData?.(nativeEvent);
				}}
			/>
		</Host>
	);
}
