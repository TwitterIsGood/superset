/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "TerminalEmulator.tsx"),
	"utf8",
);
const WEBVIEW_HTML_SOURCE = readFileSync(
	join(import.meta.dir, "terminalWebViewHtml.ts"),
	"utf8",
);

describe("TerminalEmulator", () => {
	test("uses the Paseo xterm WebView renderer rather than React Native text", () => {
		expect(SOURCE).toContain("react-native-webview");
		expect(SOURCE).toContain("terminalEmulatorWebViewHtml");
		expect(SOURCE).toContain('type: "mount"');
		expect(SOURCE).toContain('type: "restoreOutput"');
		expect(SOURCE).toContain('type: "input"');
		expect(SOURCE).not.toContain("paddingHorizontal: 8");
		expect(WEBVIEW_HTML_SOURCE).toContain("@xterm/xterm");
		expect(WEBVIEW_HTML_SOURCE).toContain("TerminalEmulatorRuntime");
	});

	test("keeps Superset host I/O as the only public component contract", () => {
		expect(SOURCE).toContain("output: string");
		expect(SOURCE).toContain("restoreRevision?: number");
		expect(SOURCE).toContain("inputCommand?: TerminalInputCommand | null");
		expect(SOURCE).toContain("onInput: (data: string) => void");
		expect(SOURCE).not.toContain("@getpaseo/client");
		expect(SOURCE).not.toContain("@getpaseo/protocol");
	});

	test("does not remount xterm on ordinary parent renders or modifier changes", () => {
		expect(SOURCE).toContain("const defaultTerminalTheme");
		expect(SOURCE).toContain("theme = defaultTerminalTheme");
		expect(SOURCE).toContain(
			"const pendingModifiersRef = useRef(pendingModifiers)",
		);
		expect(SOURCE).toContain("pendingModifiers: pendingModifiersRef.current");
		expect(SOURCE).toContain('type: "setPendingModifiers"');

		const mountTerminalStart = SOURCE.indexOf(
			"const mountTerminal = useCallback",
		);
		const mountTerminalEnd = SOURCE.indexOf(
			"useEffect(() => {\n\t\tif (bridgeReadyVersion",
			mountTerminalStart,
		);
		expect(mountTerminalStart).toBeGreaterThan(0);
		expect(mountTerminalEnd).toBeGreaterThan(mountTerminalStart);

		const mountTerminalBlock = SOURCE.slice(
			mountTerminalStart,
			mountTerminalEnd,
		);
		expect(mountTerminalBlock).not.toContain("\n\t\tpendingModifiers,");
		expect(mountTerminalBlock).not.toContain("\n\t\ttheme,");
	});

	test("does not override xterm's helper textarea ownership from React Native", () => {
		expect(SOURCE).toContain("keyboardDisplayRequiresUserAction={false}");
		expect(SOURCE).not.toContain("webViewRef.current?.requestFocus?.();");
		expect(SOURCE).toContain("createInputRelayScript");
		expect(SOURCE).toContain("TextInput");
		expect(SOURCE).toContain("nativeInputRef");
		expect(SOURCE).toContain("styles.nativeInput");
		expect(SOURCE).toContain('keyboardType="ascii-capable"');
		expect(SOURCE).toContain('autoCapitalize="none"');
		expect(SOURCE).toContain("autoCorrect={false}");
		expect(SOURCE).toContain("spellCheck={false}");
		expect(SOURCE).toContain("caretHidden");
		expect(SOURCE).toContain("textInteractionEnabled={false}");
		expect(SOURCE).toContain("onChangeText={handleNativeInputChangeText}");
		expect(SOURCE).toContain("onSubmitEditing={handleNativeInputSubmit}");
		expect(SOURCE).not.toContain("terminalInputStabilizerScript");
		expect(SOURCE).not.toContain("injectedJavaScript=");
		expect(SOURCE).not.toContain("injectTerminalInputStabilizer");
		expect(SOURCE).not.toContain("__SUPERSET_TERMINAL_INPUT_STABILIZER");
		expect(SOURCE).not.toContain('input.style.left = "0px"');
		expect(SOURCE).not.toContain('input.style.fontSize = "16px"');
		expect(SOURCE).not.toContain("MutationObserver");
		expect(WEBVIEW_HTML_SOURCE).toContain(".xterm-helper-textarea");
		expect(WEBVIEW_HTML_SOURCE).toContain('setAttribute("autocorrect", "off")');
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'setAttribute("autocapitalize", "off")',
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'setAttribute("spellcheck", "false")',
		);
	});

	test("lets xterm own typed input and keeps accessory keys byte-only", () => {
		expect(SOURCE).toContain("function createInputRelayScript");
		expect(SOURCE).toContain('var relayKey = "__SUP_TERM_INPUT_RELAY__"');
		expect(SOURCE).toContain(
			'document.querySelector("textarea.xterm-helper-textarea")',
		);
		expect(SOURCE).toContain('"compositionend"');
		expect(SOURCE).toContain('"keydown"');
		expect(SOURCE).toContain('setAttribute("inputmode", "text")');
		expect(SOURCE).toContain('setAttribute("enterkeyhint", "enter")');
		expect(SOURCE).toContain('setAttribute("lang", "en-US")');
		expect(SOURCE).toContain('event.key === "Enter"');
		expect(SOURCE).toContain('send("\\\\r")');
		expect(SOURCE).toContain('input.value = ""');
		expect(SOURCE).toContain('document.querySelectorAll(".composition-view")');
		expect(SOURCE).toContain("clearCompositionText()");
		expect(SOURCE).toContain('composition.classList.remove("active")');
		expect(SOURCE).toContain("function relayInputValue(input)");
		expect(SOURCE).toContain('var relayVersion = "2026-06-22-filtered-input"');
		expect(SOURCE).toContain('var relayMarker = "__supTerminalInputRelay"');
		expect(SOURCE).toContain("function installPostMessageFilter()");
		expect(SOURCE).toContain("state.originalPostMessage");
		expect(SOURCE).toContain('message.type === "input"');
		expect(SOURCE).toContain("message[relayMarker] !== relayVersion");
		expect(SOURCE).toContain("__supTerminalInputRelay: relayVersion");
		expect(SOURCE).toContain('ownerDocument.addEventListener("beforeinput"');
		expect(SOURCE).toContain('ownerDocument.addEventListener("input"');
		expect(SOURCE).toContain('"input"');
		expect(SOURCE).toContain("event.stopImmediatePropagation()");
		expect(SOURCE).toContain("var keydownHandler = function (event)");
		expect(SOURCE).toContain("var specialKeyData");
		expect(SOURCE).toContain('Backspace: "\\\\u007f"');
		expect(SOURCE).toContain('ArrowUp: "\\\\u001b[A"');
		expect(SOURCE).toContain("event.ctrlKey");
		expect(SOURCE).toContain("String.fromCharCode(code - 96)");
		expect(SOURCE).toContain('type: "input"');
		expect(SOURCE).toContain("webViewRef.current?.injectJavaScript");
		expect(SOURCE).not.toContain("function createInputCommandScript");
		expect(SOURCE).toContain("function createBridgeReceiveScript");
		expect(SOURCE).toContain("function buildReplacementTerminalInput");
		expect(SOURCE).toContain("next.startsWith(previous)");
		expect(SOURCE).toContain("previous.startsWith(next)");
		expect(SOURCE).toContain("repeat(Array.from");
		expect(SOURCE).toContain("const handleNativeInputChangeText");
		expect(SOURCE).toContain("normalizeTerminalInputForHost(data)");
		expect(SOURCE).toContain("const handleNativeInputKeyPress");
		expect(SOURCE).toContain("const handleNativeInputSubmit");
		expect(SOURCE).not.toContain("relayPendingValue(input)");
		expect(SOURCE).not.toContain('input.addEventListener("change"');
		expect(SOURCE).not.toContain("prefix + suffix");
		expect(SOURCE).toContain("handledInputCommandIdRef");
		expect(SOURCE).toContain("normalizeTerminalInputForHost");

		const inputCaseIndex = SOURCE.indexOf('case "input":');
		expect(inputCaseIndex).toBeGreaterThan(0);
		const inputCase = SOURCE.slice(inputCaseIndex, inputCaseIndex + 420);
		expect(inputCase).toContain("shouldRetainFocusRef.current = true");
		expect(inputCase).not.toContain("normalizeTerminalInputForHost");
		expect(inputCase).not.toContain("onInput(");
	});

	test("retains xterm focus from explicit taps across output polling without force-refocusing", () => {
		expect(SOURCE).toContain("const shouldRetainFocusRef = useRef(false)");
		expect(SOURCE).toContain("interface PendingTerminalTap");
		expect(SOURCE).toContain("const pendingTapRef");
		expect(SOURCE).toContain("terminalTapMoveTolerancePx");
		expect(SOURCE).toContain("const focusTerminal = useCallback");
		expect(SOURCE).toContain("nativeInputRef.current?.focus();");
		expect(SOURCE).toContain("setTimeout(() =>");
		expect(SOURCE).toContain("const requestFocusRetention = useCallback");
		expect(SOURCE).toContain("const handleWebViewTouchStart = useCallback");
		expect(SOURCE).toContain("const handleWebViewTouchMove = useCallback");
		expect(SOURCE).toContain("const handleWebViewTouchEnd = useCallback");
		expect(SOURCE).toContain("const handleWebViewTouchCancel = useCallback");
		expect(SOURCE).toContain("onInteraction?: () => void");
		expect(SOURCE).toContain("onInteraction?.();");
		expect(SOURCE).toContain("shouldRetainFocusRef.current = true");
		expect(SOURCE).toContain("onTouchStart={handleWebViewTouchStart}");
		expect(SOURCE).toContain("onTouchMove={handleWebViewTouchMove}");
		expect(SOURCE).toContain("onTouchEnd={handleWebViewTouchEnd}");
		expect(SOURCE).toContain("onTouchCancel={handleWebViewTouchCancel}");
		expect(SOURCE).not.toContain("createKeyboardFocusScript");
		expect(SOURCE).not.toContain("forceRefocus: true");

		const focusTerminalStart = SOURCE.indexOf(
			"const focusTerminal = useCallback",
		);
		const focusTerminalEnd = SOURCE.indexOf(
			"const requestFocusRetention = useCallback",
			focusTerminalStart,
		);
		expect(focusTerminalStart).toBeGreaterThan(0);
		expect(focusTerminalEnd).toBeGreaterThan(focusTerminalStart);
		const focusTerminalBlock = SOURCE.slice(
			focusTerminalStart,
			focusTerminalEnd,
		);
		expect(focusTerminalBlock).not.toContain('type: "focus"');

		const outputEffectStart = SOURCE.indexOf(
			"if (!rendererReadyRef.current) return;",
		);
		const outputEffectEnd = SOURCE.indexOf(
			"useEffect(() => {\n\t\tpendingModifiersRef.current",
			outputEffectStart,
		);
		expect(outputEffectStart).toBeGreaterThan(0);
		expect(outputEffectEnd).toBeGreaterThan(outputEffectStart);

		const outputEffect = SOURCE.slice(outputEffectStart, outputEffectEnd);
		expect(outputEffect).toContain('type: "writeOutput"');
		expect(outputEffect).toContain('type: "restoreOutput"');
		expect(outputEffect).toContain('type: "resize"');
		expect(outputEffect).not.toContain('type: "focus"');
		expect(outputEffect).not.toContain("forceRefocus: false");
		expect(outputEffect).not.toContain("focusTerminal(true)");

		const inputCaseIndex = SOURCE.indexOf('case "input":');
		expect(inputCaseIndex).toBeGreaterThan(0);
		const inputCase = SOURCE.slice(inputCaseIndex, inputCaseIndex + 420);
		expect(inputCase).toContain("shouldRetainFocusRef.current = true");
		expect(inputCase).not.toContain("normalizeTerminalInputForHost");
		expect(inputCase).not.toContain("onInput(");
	});

	test("keeps xterm as the input owner and lets the keyboard accessory dismiss it", () => {
		expect(SOURCE).toContain("keyboardDismissSignal?: number");
		expect(SOURCE).toContain("keyboardDismissSignal = 0");
		expect(SOURCE).toContain("terminalKeyboardBlurScript");
		expect(SOURCE).toContain("input.blur();");
		expect(SOURCE).toContain("const blurTerminalKeyboard = useCallback");
		expect(SOURCE).toContain("injectJavaScript(terminalKeyboardBlurScript)");
		expect(SOURCE).toContain("shouldRetainFocusRef.current = false");
		expect(SOURCE).toContain("blurTerminalKeyboard();");
		expect(SOURCE).toContain("if (keyboardDismissSignal <= 0) return;");
		expect(SOURCE).toContain("shouldRetainFocusRef.current");
		expect(SOURCE).not.toContain("terminalInputClearScript");
		expect(SOURCE).not.toContain("inputSuppressed");

		const blurScriptStart = SOURCE.indexOf("const terminalKeyboardBlurScript");
		const blurScriptEnd = SOURCE.indexOf(
			"const defaultTerminalTheme",
			blurScriptStart,
		);
		expect(blurScriptStart).toBeGreaterThan(0);
		expect(blurScriptEnd).toBeGreaterThan(blurScriptStart);
		const blurScript = SOURCE.slice(blurScriptStart, blurScriptEnd);
		expect(blurScript).not.toContain('input.value = "";');
	});

	test("does not suppress user input while restoring terminal snapshots", () => {
		const restoreOutputIndex = WEBVIEW_HTML_SOURCE.indexOf(
			"restoreOutput(input)",
		);
		expect(restoreOutputIndex).toBeGreaterThan(0);
		const restoreOutputBlock = WEBVIEW_HTML_SOURCE.slice(
			restoreOutputIndex,
			restoreOutputIndex + 520,
		);
		expect(restoreOutputBlock).toContain('type: "snapshot"');
		expect(restoreOutputBlock).toContain("suppressInput: false");
		expect(restoreOutputBlock).not.toContain("suppressInput: true");
		expect(SOURCE).toContain("restoreRevision = 0");
		expect(SOURCE).toContain(
			"if (restoreRevision <= 0 || !rendererReadyRef.current) return;",
		);
		expect(SOURCE).toContain('type: "restoreOutput", streamKey, text: output');
	});
});
