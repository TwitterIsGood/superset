/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VIEW_SOURCE = readFileSync(
	join(import.meta.dir, "NativeTerminalView.tsx"),
	"utf8",
);
const TYPES_SOURCE = readFileSync(
	join(import.meta.dir, "NativeTerminalView.types.ts"),
	"utf8",
);
const IOS_VIEW_SOURCE = readFileSync(
	join(import.meta.dir, "../ios/NativeTerminalView.swift"),
	"utf8",
);

describe("NativeTerminalView module boundary", () => {
	test("declares a Swift native terminal entrypoint instead of another WebView terminal", () => {
		expect(VIEW_SOURCE).toContain('requireNativeView("NativeTerminal")');
		expect(VIEW_SOURCE).toContain("@expo/ui/swift-ui");
		expect(VIEW_SOURCE).not.toContain("react-native-webview");
		expect(IOS_VIEW_SOURCE).not.toContain("WKWebView");
		expect(IOS_VIEW_SOURCE).not.toContain("React");
	});

	test("keeps terminal connection metadata explicit at the native boundary", () => {
		expect(TYPES_SOURCE).toContain("hostUrl?: string | null");
		expect(TYPES_SOURCE).toContain("webSocketUrl?: string | null");
		expect(TYPES_SOURCE).toContain("token?: string | null");
		expect(TYPES_SOURCE).toContain("workspaceId?: string | null");
		expect(TYPES_SOURCE).toContain("terminalId?: string | null");
		expect(TYPES_SOURCE).toContain("readOnly?: boolean");
		expect(TYPES_SOURCE).toContain("NativeTerminalConnectionState");
		expect(VIEW_SOURCE).toContain("onConnectionStateChange");
		expect(TYPES_SOURCE).toContain("onData?:");
		expect(VIEW_SOURCE).toContain("onData?.(nativeEvent)");
		expect(IOS_VIEW_SOURCE).toContain("webSocketUrl");
	});

	test("starts a native websocket read loop from the attach descriptor URL", () => {
		expect(IOS_VIEW_SOURCE).toContain("URLSessionWebSocketTask");
		expect(IOS_VIEW_SOURCE).toContain(
			"URLSession.shared.webSocketTask(with: url)",
		);
		expect(IOS_VIEW_SOURCE).toContain("task.receive");
		expect(IOS_VIEW_SOURCE).toContain('recordFrame(frameType: "binary"');
		expect(IOS_VIEW_SOURCE).toContain('recordFrame(frameType: "text"');
		expect(IOS_VIEW_SOURCE).toContain("props.onData([");
		expect(IOS_VIEW_SOURCE).toContain(
			'props.onConnectionStateChange(["state": state])',
		);
		expect(IOS_VIEW_SOURCE).not.toContain("webSocketUrl ??");
		expect(IOS_VIEW_SOURCE).not.toContain("Text(webSocketUrl");
	});
});
