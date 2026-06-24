import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type GestureResponderEvent,
	type NativeSyntheticEvent,
	type StyleProp,
	StyleSheet,
	TextInput,
	type TextInputKeyPressEventData,
	View,
	type ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { normalizeTerminalInputForHost } from "./terminalInputNormalization";
import { terminalEmulatorWebViewHtml } from "./terminalWebViewHtml";

export interface TerminalTheme {
	background?: string;
	foreground?: string;
	cursor?: string;
	cursorAccent?: string;
	selectionBackground?: string;
	black?: string;
	red?: string;
	green?: string;
	yellow?: string;
	blue?: string;
	magenta?: string;
	cyan?: string;
	white?: string;
	brightBlack?: string;
	brightRed?: string;
	brightGreen?: string;
	brightYellow?: string;
	brightBlue?: string;
	brightMagenta?: string;
	brightCyan?: string;
	brightWhite?: string;
}

export type TerminalModifierState = {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
};

export type TerminalDimensions = {
	cols: number;
	rows: number;
};

export type TerminalScreenSnapshot = {
	format: "xterm-serialize-ansi";
	version: 1;
	cols: number;
	rows: number;
	content: string;
};

type BridgeInboundMessage =
	| {
			type: "mount";
			streamKey: string;
			initialSnapshot: null;
			scrollbackLines: number;
			theme: TerminalTheme;
			fontFamily?: string;
			fontSize?: number;
			pendingModifiers: TerminalModifierState;
			swipeGesturesEnabled: boolean;
	  }
	| { type: "unmount"; streamKey: string }
	| { type: "writeOutput"; streamKey: string; text: string }
	| {
			type: "restoreOutput";
			streamKey: string;
			text: string;
			cols?: number;
			rows?: number;
	  }
	| { type: "clear"; streamKey: string }
	| { type: "focus"; streamKey: string; forceRefocus?: boolean }
	| {
			type: "resize";
			streamKey: string;
			shouldClaim?: boolean;
			cols?: number;
			rows?: number;
	  }
	| {
			type: "setPendingModifiers";
			streamKey: string;
			pendingModifiers: TerminalModifierState;
	  };

type BridgeOutboundMessage =
	| { type: "bridgeReady" }
	| { type: "rendererReady"; streamKey: string; isReady: boolean }
	| { type: "input"; streamKey: string; data: string }
	| {
			type: "resize";
			streamKey: string;
			rows: number;
			cols: number;
			shouldClaim?: boolean;
	  }
	| { type: "nativeFocusRequested"; streamKey: string | null }
	| { type: "pendingModifiersConsumed"; streamKey: string }
	| { type: "debug"; message: string; details?: unknown };

export type TerminalInputCommand = {
	id: number;
	data: string;
};

interface TerminalEmulatorProps {
	streamKey: string;
	output: string;
	restoreRevision?: number;
	inputCommand?: TerminalInputCommand | null;
	testID?: string;
	scrollbackLines?: number;
	fontFamily?: string;
	fontSize?: number;
	terminalDimensions?: TerminalDimensions | null;
	screenSnapshot?: TerminalScreenSnapshot | null;
	theme?: TerminalTheme;
	pendingModifiers: TerminalModifierState;
	keyboardDismissSignal?: number;
	onInput: (data: string) => void;
	onInteraction?: () => void;
	onLocalResize?: (size: TerminalDimensions) => void;
	onResize?: (size: { rows: number; cols: number }) => void;
	onPendingModifiersConsumed?: () => void;
	onRendererReadyChange?: (isReady: boolean) => void;
}

const terminalWebViewSource = { html: terminalEmulatorWebViewHtml };
const terminalWebViewOriginWhitelist = ["*"];
const terminalTapMoveTolerancePx = 8;
const terminalNativeInputFlushDelayMs = 0;
const terminalNativeBackspaceNoiseWindowMs = 220;
const terminalKeyboardBlurScript = `
(function () {
  var guardKey = "__SUP_TERM_NATIVE_INPUT_GUARD__";
  var state = window[guardKey] || (window[guardKey] = {});
  function clearCompositionText() {
    var compositions = document.querySelectorAll(".composition-view");
    compositions.forEach(function (composition) {
      composition.textContent = "";
      composition.classList.remove("active");
    });
  }
  function suppressHelperInput(input) {
    if (!input) return;
    input.blur();
    input.readOnly = true;
    input.tabIndex = -1;
    input.setAttribute("readonly", "readonly");
    input.setAttribute("aria-hidden", "true");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.value = "";
    input.style.pointerEvents = "none";
    input.style.opacity = "0";
    input.style.caretColor = "transparent";
  }
  function suppressAllHelperInputs() {
    var inputs = document.querySelectorAll("textarea.xterm-helper-textarea");
    inputs.forEach(suppressHelperInput);
    clearCompositionText();
  }
  if (!state.installed) {
    state.installed = true;
    document.addEventListener("focusin", function (event) {
      if (event.target && event.target.matches && event.target.matches("textarea.xterm-helper-textarea")) {
        event.stopImmediatePropagation();
        suppressHelperInput(event.target);
        setTimeout(suppressAllHelperInputs, 0);
      }
    }, true);
    state.observer = new MutationObserver(suppressAllHelperInputs);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  suppressAllHelperInputs();
  if (window.__PASEO_TERMINAL_WEBVIEW_BLUR__) {
    window.__PASEO_TERMINAL_WEBVIEW_BLUR__();
  }
  return true;
})();
true;
`;
const defaultTerminalTheme: TerminalTheme = {
	background: "#050507",
	foreground: "#d9d9df",
	cursor: "#f2f2f4",
	cursorAccent: "#050507",
	selectionBackground: "#3f3f46",
	black: "#050507",
	red: "#ff6b6b",
	green: "#8bdc74",
	yellow: "#f2c66d",
	blue: "#7aa2f7",
	magenta: "#c792ea",
	cyan: "#7dcfff",
	white: "#d9d9df",
	brightBlack: "#666672",
	brightRed: "#ff8585",
	brightGreen: "#a7f58a",
	brightYellow: "#ffe08a",
	brightBlue: "#9bbcff",
	brightMagenta: "#dda6ff",
	brightCyan: "#9be8ff",
	brightWhite: "#f2f2f4",
};

interface PendingTerminalTap {
	startX: number;
	startY: number;
	moved: boolean;
}

function serializeForInjectedJavaScript(message: BridgeInboundMessage): string {
	return JSON.stringify(message).replace(/<\/script/gi, "<\\/script");
}

function buildThemeKey(theme: TerminalTheme): string {
	return JSON.stringify(theme);
}

function createMountMessage(input: {
	streamKey: string;
	scrollbackLines: number;
	theme: TerminalTheme;
	fontFamily?: string;
	fontSize?: number;
	pendingModifiers: TerminalModifierState;
}): BridgeInboundMessage {
	return {
		type: "mount",
		streamKey: input.streamKey,
		initialSnapshot: null,
		scrollbackLines: input.scrollbackLines,
		theme: input.theme,
		fontFamily: input.fontFamily,
		fontSize: input.fontSize,
		pendingModifiers: input.pendingModifiers,
		swipeGesturesEnabled: false,
	};
}

function createTerminalResizeMessage({
	streamKey,
	terminalDimensions,
}: {
	streamKey: string;
	terminalDimensions?: TerminalDimensions | null;
}): BridgeInboundMessage {
	return {
		type: "resize",
		streamKey,
		shouldClaim: false,
		...(terminalDimensions
			? {
					cols: terminalDimensions.cols,
					rows: terminalDimensions.rows,
				}
			: {}),
	};
}

function restoreDimensionsFromSnapshot(
	screenSnapshot: TerminalScreenSnapshot | null | undefined,
	terminalDimensions: TerminalDimensions | null | undefined,
): TerminalDimensions | null {
	if (screenSnapshot) {
		return {
			cols: screenSnapshot.cols,
			rows: screenSnapshot.rows,
		};
	}
	return terminalDimensions ?? null;
}

function createTerminalRestoreMessage({
	streamKey,
	text,
	screenSnapshot,
	terminalDimensions,
}: {
	streamKey: string;
	text: string;
	screenSnapshot?: TerminalScreenSnapshot | null;
	terminalDimensions?: TerminalDimensions | null;
}): BridgeInboundMessage {
	const restoreDimensions = restoreDimensionsFromSnapshot(
		screenSnapshot,
		terminalDimensions,
	);
	return {
		type: "restoreOutput",
		streamKey,
		text,
		...(restoreDimensions
			? {
					cols: restoreDimensions.cols,
					rows: restoreDimensions.rows,
				}
			: {}),
	};
}

function createInputRelayScript(streamKey: string): string {
	return `
(function () {
  var streamKey = ${JSON.stringify(streamKey)};
  var relayKey = "__SUP_TERM_INPUT_RELAY__";
  var relayVersion = "2026-06-22-filtered-input";
  var relayMarker = "__supTerminalInputRelay";
  var state = window[relayKey] || (window[relayKey] = { bound: new WeakMap() });
  if (state.version !== relayVersion) {
    state.bound = new WeakMap();
    state.version = relayVersion;
  }
  state.streamKey = streamKey;
  function installPostMessageFilter() {
    var webView = window.ReactNativeWebView;
    if (!webView || typeof webView.postMessage !== "function") return;
    if (!state.originalPostMessage) {
      state.originalPostMessage = webView.postMessage.bind(webView);
    }
    if (state.postMessageFilterVersion === relayVersion) return;
    state.postMessageFilterVersion = relayVersion;
    webView.postMessage = function (payload) {
      if (typeof payload === "string") {
        try {
          var message = JSON.parse(payload);
          if (message && message.type === "input" && message[relayMarker] !== relayVersion) {
            return;
          }
        } catch (_error) {
        }
      }
      return state.originalPostMessage(payload);
    };
  }
  function send(data) {
    installPostMessageFilter();
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "input",
      streamKey: state.streamKey || streamKey,
      data: data,
      __supTerminalInputRelay: relayVersion
    }));
  }
  function clearCompositionText() {
    var compositions = document.querySelectorAll(".composition-view");
    compositions.forEach(function (composition) {
      composition.textContent = "";
      composition.classList.remove("active");
    });
  }
  function relayInputValue(input) {
    if (!input || typeof input.value !== "string" || input.value.length === 0) {
      return;
    }
    var value = input.value;
    input.__supTermInputComposing = false;
    input.value = "";
    clearCompositionText();
    send(value);
  }
  function isBoundInputEvent(input, event) {
    return event && event.target === input;
  }
  function stopInputEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function bind(input) {
    if (!input) return false;
    if (state.bound.get(input) === relayVersion) return true;
    state.bound.set(input, relayVersion);
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("inputmode", "text");
    input.setAttribute("enterkeyhint", "enter");
    input.setAttribute("lang", "en-US");
    var ownerDocument = input.ownerDocument || document;
    var beforeInputHandler = function (event) {
      if (!isBoundInputEvent(input, event)) return;
      if (input.__supTermInputComposing) return;
      var inputType = typeof event.inputType === "string" ? event.inputType : "";
      var data = typeof event.data === "string" ? event.data : "";
      if (!data || inputType.indexOf("insert") !== 0) return;
      stopInputEvent(event);
      input.value = "";
      clearCompositionText();
      send(data);
    };
    var inputHandler = function (event) {
      if (!isBoundInputEvent(input, event)) return;
      if (input.__supTermInputComposing) return;
      stopInputEvent(event);
      relayInputValue(input);
    };
    var compositionStartHandler = function () {
      input.__supTermInputComposing = true;
    };
    var compositionEndHandler = function (event) {
      if (!isBoundInputEvent(input, event)) return;
      input.__supTermInputComposing = false;
      stopInputEvent(event);
      relayInputValue(input);
    };
    var specialKeyData = {
      Backspace: "\\u007f",
      Tab: "\\t",
      Escape: "\\u001b",
      ArrowUp: "\\u001b[A",
      ArrowDown: "\\u001b[B",
      ArrowRight: "\\u001b[C",
      ArrowLeft: "\\u001b[D"
    };
    var keydownHandler = function (event) {
      if (event.isComposing || input.__supTermInputComposing) return;
      if (event.metaKey || event.altKey) return;
      if (event.key === "Enter") {
        stopInputEvent(event);
        input.__supTermInputComposing = false;
        input.value = "";
        clearCompositionText();
        send("\\r");
        return;
      }
      var special = specialKeyData[event.key];
      if (special) {
        stopInputEvent(event);
        input.value = "";
        clearCompositionText();
        send(special);
        return;
      }
      if (event.ctrlKey && typeof event.key === "string" && event.key.length === 1) {
        var lowerKey = event.key.toLowerCase();
        var code = lowerKey.charCodeAt(0);
        if (code >= 97 && code <= 122) {
          stopInputEvent(event);
          input.value = "";
          clearCompositionText();
          send(String.fromCharCode(code - 96));
        }
        return;
      }
    };
    ownerDocument.addEventListener("beforeinput", beforeInputHandler, true);
    ownerDocument.addEventListener("input", inputHandler, true);
    ownerDocument.addEventListener("compositionend", compositionEndHandler, true);
    input.addEventListener("compositionstart", compositionStartHandler, true);
    input.addEventListener("keydown", keydownHandler, true);
    installPostMessageFilter();
    return true;
  }
  var attempts = 0;
  function install() {
    if (bind(document.querySelector("textarea.xterm-helper-textarea"))) return;
    attempts += 1;
    if (attempts < 30) setTimeout(install, 100);
  }
  install();
  return true;
})();
true;
`;
}

function shouldAppendTerminalOutput({
	previousOutput,
	nextOutput,
	screenSnapshot,
}: {
	previousOutput: string | null;
	nextOutput: string;
	screenSnapshot?: TerminalScreenSnapshot | null;
}): boolean {
	return (
		!screenSnapshot &&
		previousOutput !== null &&
		nextOutput.startsWith(previousOutput) &&
		nextOutput.length > previousOutput.length
	);
}

function createBridgeReceiveScript(message: BridgeInboundMessage): string {
	const payload = serializeForInjectedJavaScript(message);
	return `
(function () {
  var receive = window.__PASEO_TERMINAL_WEBVIEW_RECEIVE__;
  if (receive) receive(${payload});
  return true;
})();
true;
`;
}

function buildReplacementTerminalInput(previous: string, next: string): string {
	if (next === previous) return "";
	if (next.startsWith(previous)) {
		return next.slice(previous.length);
	}
	if (previous.startsWith(next)) {
		return "\u007f".repeat(Array.from(previous.slice(next.length)).length);
	}
	return "\u007f".repeat(Array.from(previous).length) + next;
}

export function TerminalEmulator({
	streamKey,
	output,
	restoreRevision = 0,
	inputCommand = null,
	testID = "workspace-terminal-emulator",
	scrollbackLines = 4000,
	fontFamily = "Menlo, ui-monospace, SFMono-Regular, monospace",
	fontSize = 12,
	terminalDimensions = null,
	screenSnapshot = null,
	theme = defaultTerminalTheme,
	pendingModifiers,
	keyboardDismissSignal = 0,
	onInput,
	onInteraction,
	onLocalResize,
	onResize,
	onPendingModifiersConsumed,
	onRendererReadyChange,
}: TerminalEmulatorProps) {
	const webViewRef = useRef<WebView>(null);
	const nativeInputRef = useRef<TextInput>(null);
	const bridgeReadyRef = useRef(false);
	const rendererReadyRef = useRef(false);
	const mountedStreamKeyRef = useRef<string | null>(null);
	const pendingMessagesRef = useRef<BridgeInboundMessage[]>([]);
	const lastRenderedOutputRef = useRef<string | null>(null);
	const nativeInputValueRef = useRef("");
	const nativeInputPendingValueRef = useRef("");
	const nativeInputFlushTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const ignoreEmptyBackspaceUntilRef = useRef(0);
	const pendingModifiersRef = useRef(pendingModifiers);
	const shouldRetainFocusRef = useRef(false);
	const pendingTapRef = useRef<PendingTerminalTap | null>(null);
	const handledInputCommandIdRef = useRef<number | null>(null);
	const [nativeInputValue, setNativeInputValue] = useState("");
	const [webViewEpoch, setWebViewEpoch] = useState(0);
	const [bridgeReadyVersion, setBridgeReadyVersion] = useState(0);
	const _themeKey = useMemo(() => buildThemeKey(theme), [theme]);
	const stableTheme = useMemo(() => theme, [theme]);

	const backgroundColor = stableTheme.background ?? "#050507";
	const rootStyle = useMemo<StyleProp<ViewStyle>>(
		() => [styles.root, { backgroundColor }],
		[backgroundColor],
	);
	const webViewStyle = useMemo<StyleProp<ViewStyle>>(
		() => [styles.webView, { backgroundColor }],
		[backgroundColor],
	);
	const webViewContainerStyle = useMemo<StyleProp<ViewStyle>>(
		() => [styles.webViewContainer, { backgroundColor }],
		[backgroundColor],
	);

	const clearNativeInputFlushTimer = useCallback(() => {
		if (!nativeInputFlushTimeoutRef.current) return;
		clearTimeout(nativeInputFlushTimeoutRef.current);
		nativeInputFlushTimeoutRef.current = null;
	}, []);

	const resetNativeTerminalInputValue = useCallback(() => {
		clearNativeInputFlushTimer();
		nativeInputValueRef.current = "";
		nativeInputPendingValueRef.current = "";
		setNativeInputValue("");
	}, [clearNativeInputFlushTimer]);

	const focusNativeTerminalInput = useCallback(() => {
		nativeInputRef.current?.focus();
		webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
		setTimeout(() => {
			nativeInputRef.current?.focus();
			webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
		}, 0);
		setTimeout(() => {
			nativeInputRef.current?.focus();
			webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
		}, 250);
	}, []);

	const flushNativeInputChange = useCallback(
		(nextValue = nativeInputPendingValueRef.current) => {
			clearNativeInputFlushTimer();
			const previousValue = nativeInputValueRef.current;
			const data = buildReplacementTerminalInput(previousValue, nextValue);
			nativeInputValueRef.current = nextValue;
			nativeInputPendingValueRef.current = nextValue;
			if (data.length === 0) return;
			shouldRetainFocusRef.current = true;
			onInput(normalizeTerminalInputForHost(data));
		},
		[clearNativeInputFlushTimer, onInput],
	);

	const scheduleNativeInputFlush = useCallback(
		(delayMs: number) => {
			clearNativeInputFlushTimer();
			nativeInputFlushTimeoutRef.current = setTimeout(() => {
				flushNativeInputChange();
			}, delayMs);
		},
		[clearNativeInputFlushTimer, flushNativeInputChange],
	);

	const flushPendingMessages = useCallback(() => {
		if (!bridgeReadyRef.current || !webViewRef.current) return;
		const pending = pendingMessagesRef.current.splice(0);
		for (const message of pending) {
			webViewRef.current.injectJavaScript(createBridgeReceiveScript(message));
		}
	}, []);

	const sendToWebView = useCallback((message: BridgeInboundMessage) => {
		if (!bridgeReadyRef.current || !webViewRef.current) {
			pendingMessagesRef.current.push(message);
			return;
		}
		webViewRef.current.injectJavaScript(createBridgeReceiveScript(message));
	}, []);

	const sendTerminalResize = useCallback(() => {
		sendToWebView(
			createTerminalResizeMessage({
				streamKey,
				terminalDimensions,
			}),
		);
	}, [
		sendToWebView,
		streamKey,
		terminalDimensions?.cols,
		terminalDimensions?.rows,
		terminalDimensions,
	]);

	const blurTerminalKeyboard = useCallback(() => {
		shouldRetainFocusRef.current = false;
		nativeInputRef.current?.blur();
		webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
	}, []);

	const focusTerminal = useCallback(() => {
		if (!mountedStreamKeyRef.current) return;
		webViewRef.current?.injectJavaScript(createInputRelayScript(streamKey));
		focusNativeTerminalInput();
		setTimeout(() => {
			nativeInputRef.current?.focus();
		}, 50);
		setTimeout(() => {
			nativeInputRef.current?.focus();
		}, 150);
	}, [focusNativeTerminalInput, streamKey]);

	const requestFocusRetention = useCallback(() => {
		onInteraction?.();
		shouldRetainFocusRef.current = true;
		focusTerminal();
	}, [focusTerminal, onInteraction]);

	const handleWebViewTouchStart = useCallback(
		(event: GestureResponderEvent) => {
			onInteraction?.();
			shouldRetainFocusRef.current = true;
			focusNativeTerminalInput();
			pendingTapRef.current = {
				startX: event.nativeEvent.pageX,
				startY: event.nativeEvent.pageY,
				moved: false,
			};
		},
		[focusNativeTerminalInput, onInteraction],
	);

	const handleWebViewTouchMove = useCallback((event: GestureResponderEvent) => {
		const pendingTap = pendingTapRef.current;
		if (!pendingTap) return;

		const dx = event.nativeEvent.pageX - pendingTap.startX;
		const dy = event.nativeEvent.pageY - pendingTap.startY;
		if (
			Math.abs(dx) > terminalTapMoveTolerancePx ||
			Math.abs(dy) > terminalTapMoveTolerancePx
		) {
			pendingTap.moved = true;
		}
	}, []);

	const handleWebViewTouchEnd = useCallback(() => {
		const pendingTap = pendingTapRef.current;
		pendingTapRef.current = null;
		if (!pendingTap || pendingTap.moved) return;

		requestFocusRetention();
	}, [requestFocusRetention]);

	const handleWebViewTouchCancel = useCallback(() => {
		pendingTapRef.current = null;
	}, []);

	const mountTerminal = useCallback(() => {
		const mountMessage = createMountMessage({
			streamKey,
			scrollbackLines,
			theme: stableTheme,
			fontFamily,
			fontSize,
			pendingModifiers: pendingModifiersRef.current,
		});
		mountedStreamKeyRef.current = streamKey;
		rendererReadyRef.current = false;
		sendToWebView(mountMessage);
		sendTerminalResize();
		webViewRef.current?.injectJavaScript(createInputRelayScript(streamKey));
		webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
		flushPendingMessages();
	}, [
		flushPendingMessages,
		fontFamily,
		fontSize,
		scrollbackLines,
		sendTerminalResize,
		sendToWebView,
		stableTheme,
		streamKey,
	]);

	useEffect(() => {
		if (bridgeReadyVersion <= 0) return;
		mountTerminal();
	}, [bridgeReadyVersion, mountTerminal]);

	useEffect(() => {
		lastRenderedOutputRef.current = null;
		if (bridgeReadyRef.current) {
			mountTerminal();
		}
	}, [mountTerminal]);

	useEffect(() => {
		if (!rendererReadyRef.current) return;
		if (lastRenderedOutputRef.current === output) return;
		const previousOutput = lastRenderedOutputRef.current;
		lastRenderedOutputRef.current = output;
		let restoredOutput = false;
		if (output.length === 0) {
			sendToWebView({ type: "clear", streamKey });
		} else if (
			shouldAppendTerminalOutput({
				previousOutput,
				nextOutput: output,
				screenSnapshot,
			})
		) {
			const appendText =
				previousOutput === null ? output : output.slice(previousOutput.length);
			sendToWebView({
				type: "writeOutput",
				streamKey,
				text: appendText,
			});
		} else {
			restoredOutput = true;
			sendToWebView(
				createTerminalRestoreMessage({
					streamKey,
					text: output,
					screenSnapshot,
					terminalDimensions,
				}),
			);
		}
		if (!restoredOutput) {
			sendTerminalResize();
		}
	}, [
		output,
		screenSnapshot,
		sendTerminalResize,
		sendToWebView,
		streamKey,
		terminalDimensions,
	]);

	useEffect(() => {
		if (restoreRevision <= 0 || !rendererReadyRef.current) return;
		lastRenderedOutputRef.current = output;
		sendToWebView(
			createTerminalRestoreMessage({
				streamKey,
				text: output,
				screenSnapshot,
				terminalDimensions,
			}),
		);
	}, [
		output,
		restoreRevision,
		screenSnapshot,
		sendToWebView,
		streamKey,
		terminalDimensions,
	]);

	useEffect(() => {
		if (!mountedStreamKeyRef.current || !rendererReadyRef.current) return;
		sendTerminalResize();
	}, [sendTerminalResize]);

	useEffect(() => {
		if (!inputCommand) return;
		if (handledInputCommandIdRef.current === inputCommand.id) return;
		handledInputCommandIdRef.current = inputCommand.id;
		shouldRetainFocusRef.current = true;
		if (
			inputCommand.data.includes("\r") ||
			inputCommand.data.includes("\u0003")
		) {
			resetNativeTerminalInputValue();
		}
	}, [inputCommand, resetNativeTerminalInputValue]);

	useEffect(() => {
		resetNativeTerminalInputValue();
	}, [resetNativeTerminalInputValue]);

	useEffect(() => {
		if (keyboardDismissSignal <= 0) return;
		blurTerminalKeyboard();
	}, [blurTerminalKeyboard, keyboardDismissSignal]);

	useEffect(() => {
		pendingModifiersRef.current = pendingModifiers;
		if (!mountedStreamKeyRef.current) return;
		sendToWebView({ type: "setPendingModifiers", streamKey, pendingModifiers });
	}, [pendingModifiers, sendToWebView, streamKey]);

	useEffect(() => {
		if (!mountedStreamKeyRef.current) return;
		mountTerminal();
	}, [mountTerminal]);

	useEffect(() => {
		return () => {
			const mountedStreamKey = mountedStreamKeyRef.current;
			if (mountedStreamKey) {
				sendToWebView({ type: "unmount", streamKey: mountedStreamKey });
				onRendererReadyChange?.(false);
			}
			mountedStreamKeyRef.current = null;
			bridgeReadyRef.current = false;
			rendererReadyRef.current = false;
			pendingMessagesRef.current = [];
			clearNativeInputFlushTimer();
		};
	}, [clearNativeInputFlushTimer, onRendererReadyChange, sendToWebView]);

	const handleMessage = useCallback(
		(event: WebViewMessageEvent) => {
			let message: BridgeOutboundMessage;
			try {
				message = JSON.parse(event.nativeEvent.data) as BridgeOutboundMessage;
			} catch {
				return;
			}

			if (message.type === "bridgeReady") {
				bridgeReadyRef.current = true;
				setBridgeReadyVersion((value) => value + 1);
				return;
			}

			if (message.type === "debug") {
				return;
			}

			if (message.streamKey !== streamKey) return;

			switch (message.type) {
				case "rendererReady":
					rendererReadyRef.current = message.isReady;
					if (message.isReady) {
						mountedStreamKeyRef.current = streamKey;
						lastRenderedOutputRef.current = null;
						webViewRef.current?.injectJavaScript(
							createInputRelayScript(streamKey),
						);
						webViewRef.current?.injectJavaScript(terminalKeyboardBlurScript);
						sendToWebView(
							createTerminalRestoreMessage({
								streamKey,
								text: output,
								screenSnapshot,
								terminalDimensions,
							}),
						);
						if (shouldRetainFocusRef.current) {
							nativeInputRef.current?.focus();
						}
					}
					onRendererReadyChange?.(message.isReady);
					break;
				case "input":
					shouldRetainFocusRef.current = true;
					break;
				case "resize":
					onLocalResize?.({ rows: message.rows, cols: message.cols });
					if (message.shouldClaim === true) {
						onResize?.({ rows: message.rows, cols: message.cols });
					}
					break;
				case "nativeFocusRequested":
					shouldRetainFocusRef.current = true;
					focusNativeTerminalInput();
					break;
				case "pendingModifiersConsumed":
					onPendingModifiersConsumed?.();
					break;
			}
		},
		[
			focusNativeTerminalInput,
			onPendingModifiersConsumed,
			onRendererReadyChange,
			onLocalResize,
			onResize,
			output,
			screenSnapshot,
			sendToWebView,
			streamKey,
			terminalDimensions,
		],
	);

	const handleNativeInputChangeText = useCallback(
		(nextValue: string) => {
			ignoreEmptyBackspaceUntilRef.current =
				Date.now() + terminalNativeBackspaceNoiseWindowMs;
			nativeInputPendingValueRef.current = nextValue;
			setNativeInputValue(nextValue);
			scheduleNativeInputFlush(terminalNativeInputFlushDelayMs);
		},
		[scheduleNativeInputFlush],
	);

	const handleNativeInputKeyPress = useCallback(
		(event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			if (event.nativeEvent.key !== "Backspace") return;
			if (nativeInputValueRef.current.length > 0) return;
			if (nativeInputPendingValueRef.current.length > 0) return;
			if (Date.now() < ignoreEmptyBackspaceUntilRef.current) return;
			shouldRetainFocusRef.current = true;
			onInput("\u007f");
		},
		[onInput],
	);

	const handleNativeInputSubmit = useCallback(() => {
		shouldRetainFocusRef.current = true;
		flushNativeInputChange(nativeInputPendingValueRef.current);
		resetNativeTerminalInputValue();
		onInput("\r");
		setTimeout(() => {
			nativeInputRef.current?.focus();
		}, 0);
	}, [flushNativeInputChange, onInput, resetNativeTerminalInputValue]);

	const handleNativeInputFocus = useCallback(() => {
		onInteraction?.();
		shouldRetainFocusRef.current = true;
	}, [onInteraction]);

	const handleLoadStart = useCallback(() => {
		bridgeReadyRef.current = false;
		rendererReadyRef.current = false;
		mountedStreamKeyRef.current = null;
		lastRenderedOutputRef.current = null;
		onRendererReadyChange?.(false);
	}, [onRendererReadyChange]);

	const resetWebView = useCallback(() => {
		bridgeReadyRef.current = false;
		rendererReadyRef.current = false;
		mountedStreamKeyRef.current = null;
		lastRenderedOutputRef.current = null;
		pendingMessagesRef.current = [];
		onRendererReadyChange?.(false);
		setWebViewEpoch((value) => value + 1);
	}, [onRendererReadyChange]);

	return (
		<View style={rootStyle} testID={testID}>
			<WebView
				key={webViewEpoch}
				ref={webViewRef}
				source={terminalWebViewSource}
				style={webViewStyle}
				containerStyle={webViewContainerStyle}
				originWhitelist={terminalWebViewOriginWhitelist}
				scrollEnabled
				nestedScrollEnabled
				bounces={false}
				overScrollMode="never"
				keyboardDisplayRequiresUserAction={false}
				automaticallyAdjustContentInsets={false}
				contentInsetAdjustmentBehavior="never"
				textInteractionEnabled={false}
				allowsLinkPreview={false}
				setSupportMultipleWindows={false}
				setBuiltInZoomControls={false}
				setDisplayZoomControls={false}
				textZoom={100}
				onMessage={handleMessage}
				onTouchStart={handleWebViewTouchStart}
				onTouchMove={handleWebViewTouchMove}
				onTouchEnd={handleWebViewTouchEnd}
				onTouchCancel={handleWebViewTouchCancel}
				onLoadStart={handleLoadStart}
				onContentProcessDidTerminate={resetWebView}
				onRenderProcessGone={resetWebView}
			/>
			<TextInput
				ref={nativeInputRef}
				testID="terminal-native-input-capture"
				accessibilityLabel="Terminal input"
				value={nativeInputValue}
				pointerEvents="none"
				style={styles.nativeInput}
				autoCapitalize="none"
				autoCorrect={false}
				spellCheck={false}
				selectionColor="transparent"
				keyboardType="ascii-capable"
				textContentType="none"
				importantForAutofill="no"
				caretHidden
				blurOnSubmit={false}
				submitBehavior="submit"
				showSoftInputOnFocus
				onChangeText={handleNativeInputChangeText}
				onFocus={handleNativeInputFocus}
				onKeyPress={handleNativeInputKeyPress}
				onSubmitEditing={handleNativeInputSubmit}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		minHeight: 0,
		minWidth: 0,
		overflow: "hidden",
		paddingLeft: 6,
		paddingRight: 6,
	},
	webView: {
		flex: 1,
	},
	webViewContainer: {
		flex: 1,
	},
	nativeInput: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 1,
		height: 1,
		opacity: 0,
		color: "transparent",
		backgroundColor: "transparent",
		fontSize: 1,
		zIndex: -1,
	},
});
