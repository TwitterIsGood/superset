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

	test("keeps xterm's helper textarea from becoming the iOS first responder", () => {
		expect(SOURCE).toContain("keyboardDisplayRequiresUserAction={false}");
		expect(SOURCE).not.toContain("webViewRef.current?.requestFocus?.();");
		expect(SOURCE).toContain("createInputRelayScript");
		expect(SOURCE).toContain("TextInput");
		expect(SOURCE).toContain("nativeInputRef");
		expect(SOURCE).toContain("styles.nativeInput");
		expect(SOURCE).toContain('pointerEvents="none"');
		expect(SOURCE).toContain('selectionColor="transparent"');
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
		expect(SOURCE).not.toContain(
			'pointerEvents="none"\n\t\t\t\toriginWhitelist',
		);
		expect(SOURCE).not.toContain('input.style.left = "0px"');
		expect(SOURCE).not.toContain('input.style.fontSize = "16px"');
		expect(SOURCE).toContain("__SUP_TERM_NATIVE_INPUT_GUARD__");
		expect(SOURCE).toContain("function suppressHelperInput(input)");
		expect(SOURCE).toContain("input.readOnly = true");
		expect(SOURCE).toContain('input.setAttribute("readonly", "readonly")');
		expect(SOURCE).toContain('input.style.pointerEvents = "none"');
		expect(SOURCE).toContain("new MutationObserver(suppressAllHelperInputs)");
		expect(SOURCE).toContain('document.addEventListener("focusin"');
		expect(WEBVIEW_HTML_SOURCE).toContain(".xterm-helper-textarea");
		expect(WEBVIEW_HTML_SOURCE).toContain(".composition-view.active");
		expect(WEBVIEW_HTML_SOURCE).toContain("display: none !important");
		expect(WEBVIEW_HTML_SOURCE).toContain('setAttribute("autocorrect", "off")');
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'setAttribute("autocapitalize", "off")',
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'setAttribute("spellcheck", "false")',
		);
	});

	test("keeps the native TextInput from visually covering terminal output", () => {
		const nativeInputStyleIndex = SOURCE.indexOf("nativeInput: {");
		expect(nativeInputStyleIndex).toBeGreaterThan(0);
		const nativeInputStyle = SOURCE.slice(
			nativeInputStyleIndex,
			nativeInputStyleIndex + 420,
		);

		expect(nativeInputStyle).toContain("width: 1");
		expect(nativeInputStyle).toContain("height: 1");
		expect(nativeInputStyle).toContain("opacity: 0");
		expect(nativeInputStyle).toContain("zIndex: -1");
		expect(nativeInputStyle).not.toContain("right: 0");
		expect(nativeInputStyle).not.toContain("bottom: 0");
		expect(nativeInputStyle).not.toContain("opacity: 1");
	});

	test("relays terminal input through the native TextInput and keeps accessory keys byte-only", () => {
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
		expect(SOURCE).toContain("const focusNativeTerminalInput = useCallback");
		expect(SOURCE).toContain("nativeInputRef.current?.focus();");
		expect(SOURCE).toContain("injectJavaScript(terminalKeyboardBlurScript)");
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
		expect(SOURCE).toContain('type: "nativeFocusRequested"');
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'type: "nativeFocusRequested", streamKey: this.streamKey',
		);
		expect(WEBVIEW_HTML_SOURCE).not.toContain(
			"this.runtime?.focus({ forceRefocus: true })",
		);

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
		expect(outputEffect).toContain("createTerminalRestoreMessage");
		expect(outputEffect).toContain("sendTerminalResize()");
		expect(outputEffect).not.toContain('type: "focus"');
		expect(outputEffect).not.toContain("forceRefocus: false");
		expect(outputEffect).not.toContain("focusTerminal(true)");

		const inputCaseIndex = SOURCE.indexOf('case "input":');
		expect(inputCaseIndex).toBeGreaterThan(0);
		const inputCase = SOURCE.slice(inputCaseIndex, inputCaseIndex + 420);
		expect(inputCase).toContain("shouldRetainFocusRef.current = true");
		expect(inputCase).not.toContain("normalizeTerminalInputForHost");
		expect(inputCase).not.toContain("onInput(");

		const nativeFocusCaseIndex = SOURCE.indexOf('case "nativeFocusRequested":');
		expect(nativeFocusCaseIndex).toBeGreaterThan(0);
		const nativeFocusCase = SOURCE.slice(
			nativeFocusCaseIndex,
			nativeFocusCaseIndex + 220,
		);
		expect(nativeFocusCase).toContain("shouldRetainFocusRef.current = true");
		expect(nativeFocusCase).toContain("focusNativeTerminalInput();");
	});

	test("does not forward WebView input messages into a second host write path", () => {
		const inputCaseIndex = SOURCE.indexOf('case "input":');
		expect(inputCaseIndex).toBeGreaterThan(0);
		const inputCase = SOURCE.slice(inputCaseIndex, inputCaseIndex + 420);
		expect(inputCase).toContain("shouldRetainFocusRef.current = true");
		expect(inputCase).not.toContain("message.data.length > 0");
		expect(inputCase).not.toContain(
			"normalizeTerminalInputForHost(message.data)",
		);
		expect(inputCase).not.toContain("onInput(");
		expect(SOURCE).toContain("const terminalNativeInputFlushDelayMs = 0;");
	});

	test("keeps the native terminal input guard active and lets the keyboard accessory dismiss it", () => {
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
		expect(blurScript).toContain('input.value = "";');
		expect(blurScript).toContain("suppressAllHelperInputs();");
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
		expect(SOURCE).toContain("function createTerminalRestoreMessage");
		expect(SOURCE).toContain('type: "restoreOutput"');
		expect(SOURCE).toContain("cols: restoreDimensions.cols");
		expect(SOURCE).toContain("rows: restoreDimensions.rows");
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"restoreOutput({ data: encodeTerminalOutput(message.text), cols: message.cols, rows: message.rows })",
		);
	});

	test("restores host screen snapshots with their original terminal dimensions", () => {
		expect(SOURCE).toContain("export type TerminalScreenSnapshot");
		expect(SOURCE).toContain('format: "xterm-serialize-ansi"');
		expect(SOURCE).toContain("screenSnapshot?: TerminalScreenSnapshot | null");
		expect(SOURCE).toContain("function restoreDimensionsFromSnapshot");
		expect(SOURCE).toContain("cols: screenSnapshot.cols");
		expect(SOURCE).toContain("rows: screenSnapshot.rows");
		expect(SOURCE).toContain("screenSnapshot = null");
		expect(SOURCE).toContain("createTerminalRestoreMessage({");
		expect(WEBVIEW_HTML_SOURCE).toContain('operation.type === "snapshot"');
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"terminal.resize(operation.cols, operation.rows)",
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			'if (expectedOperation.type === "snapshot")',
		);
		expect(WEBVIEW_HTML_SOURCE).toContain("terminal.scrollToBottom()");
		expect(WEBVIEW_HTML_SOURCE).toContain("this.refreshVisibleRows()");
	});

	test("does not append screen snapshot changes as output deltas", () => {
		expect(SOURCE).toContain("function shouldAppendTerminalOutput");
		expect(SOURCE).toContain("!screenSnapshot");
		expect(SOURCE).toContain("nextOutput.startsWith(previousOutput)");

		const outputEffectStart = SOURCE.indexOf(
			"if (!rendererReadyRef.current) return;",
		);
		const outputEffectEnd = SOURCE.indexOf(
			"useEffect(() => {\n\t\tif (restoreRevision",
			outputEffectStart,
		);
		expect(outputEffectStart).toBeGreaterThan(0);
		expect(outputEffectEnd).toBeGreaterThan(outputEffectStart);

		const outputEffect = SOURCE.slice(outputEffectStart, outputEffectEnd);
		expect(outputEffect).toContain("shouldAppendTerminalOutput({");
		expect(outputEffect).toContain("screenSnapshot,");
		expect(outputEffect).toContain('type: "writeOutput"');
		expect(outputEffect).toContain("createTerminalRestoreMessage({");
	});

	test("keeps mobile xterm resize local unless ownership is explicitly claimed", () => {
		expect(SOURCE).toContain("export type TerminalDimensions");
		expect(SOURCE).toContain("terminalDimensions?: TerminalDimensions | null");
		expect(SOURCE).toContain("function createTerminalResizeMessage");
		expect(SOURCE).toContain("cols: terminalDimensions.cols");
		expect(SOURCE).toContain("rows: terminalDimensions.rows");
		expect(SOURCE).toContain("sendTerminalResize()");
		expect(SOURCE).toContain("onLocalResize?: (size: TerminalDimensions)");
		expect(SOURCE).not.toContain("shouldClaim: true");

		const resizeCaseIndex = SOURCE.indexOf('case "resize":');
		expect(resizeCaseIndex).toBeGreaterThan(0);
		const resizeCase = SOURCE.slice(resizeCaseIndex, resizeCaseIndex + 360);
		expect(resizeCase).toContain(
			"onLocalResize?.({ rows: message.rows, cols: message.cols })",
		);
		expect(resizeCase).toContain("message.shouldClaim === true");
		expect(resizeCase).toContain(
			"onResize?.({ rows: message.rows, cols: message.cols })",
		);
		expect(WEBVIEW_HTML_SOURCE).toContain("fixedSize = null");
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"this.fixedSize = { cols: requestedCols, rows: requestedRows }",
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"const shouldClaim = fixedSize ? false : resizeInput?.shouldClaim ?? true",
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"currentTerminal.resize(fixedSize.cols, fixedSize.rows)",
		);
		expect(WEBVIEW_HTML_SOURCE).toContain(
			"cols: message.cols, rows: message.rows",
		);
	});

	test("does not hold the first native input chunk behind a long timer", () => {
		expect(SOURCE).toContain("const terminalNativeInputFlushDelayMs = 0;");
		expect(SOURCE).not.toContain("terminalNativeInitialInputFlushDelayMs");

		const nativeInputStart = SOURCE.indexOf(
			"const handleNativeInputChangeText = useCallback",
		);
		const nativeInputEnd = SOURCE.indexOf(
			"const handleNativeInputKeyPress = useCallback",
			nativeInputStart,
		);
		expect(nativeInputStart).toBeGreaterThan(0);
		expect(nativeInputEnd).toBeGreaterThan(nativeInputStart);
		const nativeInput = SOURCE.slice(nativeInputStart, nativeInputEnd);
		expect(nativeInput).toContain(
			"scheduleNativeInputFlush(terminalNativeInputFlushDelayMs)",
		);
		expect(nativeInput).not.toContain("isInitialInsertion");
		expect(nativeInput).not.toContain("previousValue");
	});
});
