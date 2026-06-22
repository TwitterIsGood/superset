export type NativeTerminalConnectionState =
	| "idle"
	| "connecting"
	| "live"
	| "reconnecting"
	| "offline"
	| "exited"
	| "error";

export interface NativeTerminalViewProps {
	hostUrl?: string | null;
	webSocketUrl?: string | null;
	token?: string | null;
	workspaceId?: string | null;
	terminalId?: string | null;
	title?: string | null;
	subtitle?: string | null;
	connectionState?: NativeTerminalConnectionState;
	readOnly?: boolean;
	style?: import("react-native").StyleProp<import("react-native").ViewStyle>;
	onReady?: () => void;
	onConnectionStateChange?: (state: NativeTerminalConnectionState) => void;
	onData?: (event: {
		frameType: "binary" | "text";
		byteCount: number;
		totalBytes: number;
	}) => void;
}
