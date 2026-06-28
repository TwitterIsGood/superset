import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../stores/keyboardLayoutStore";
import {
	getEffectiveLayoutMap,
	useKeyboardPreferencesStore,
} from "../stores/keyboardPreferencesStore";
import type { ShortcutBinding } from "../types";
import { bindingToDispatchChord } from "./binding";
import {
	canonicalizeChord,
	isIgnorableKey,
	normalizeToken,
	TERMINAL_RESERVED_CHORDS,
} from "./hotkey-chord";

export {
	canonicalizeChord,
	isIgnorableKey,
	MODIFIERS,
	normalizeToken,
	TERMINAL_RESERVED_CHORDS,
} from "./hotkey-chord";

/**
 * KeyboardEvent → registered {@link HotkeyId}, or `null` if unbound. Uses the
 * same `event.code` normalization as react-hotkeys-hook so the reverse index
 * can't drift from the matcher. Index reflects current overrides, not frozen
 * defaults — see {@link registeredAppChords}.
 */
export function resolveHotkeyFromEvent(event: KeyboardEvent): HotkeyId | null {
	if (event.type !== "keydown") return null;
	const chord = eventToChord(event);
	if (!chord) return null;
	return getRegisteredAppChords().get(chord) ?? null;
}

/** KeyboardEvent → canonical chord (comparable to {@link canonicalizeChord} output), or null for pure modifier / synthetic presses. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	// IME composition: keydown during CJK / dead-key composition must not
	// trigger hotkeys. Safari reports keyCode 229 instead of isComposing.
	if (event.isComposing || event.keyCode === 229) return null;
	const key = normalizeToken(event.code);
	if (isIgnorableKey(key)) return null;
	// AltGr is reported by Chromium as ctrlKey+altKey on Windows/Linux.
	// Treating that combination as Ctrl+Alt would let printable keystrokes on
	// non-US layouts (e.g. AltGr+E = € on German) accidentally trigger
	// ctrl+alt+e bindings. Suppress both when AltGr is held; no binding opts
	// into AltGr explicitly.
	const altGraph = event.getModifierState?.("AltGraph") === true;
	const mods: string[] = [];
	if (event.metaKey) mods.push("meta");
	if (event.ctrlKey && !altGraph) mods.push("ctrl");
	if (event.altKey && !altGraph) mods.push("alt");
	if (event.shiftKey) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

/** True if `event` produces `chord` (tolerating modifier order / aliases). */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
	const eventChord = eventToChord(event);
	if (!eventChord) return false;
	return eventChord === canonicalizeChord(chord);
}

/** True if the event matches a chord the terminal must always receive. */
export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	const chord = eventToChord(event);
	if (!chord) return false;
	return TERMINAL_RESERVED_CHORDS.has(chord);
}

function buildRegisteredAppChords(
	overrides: Record<string, ShortcutBinding | null>,
	layoutMap: ReadonlyMap<string, string> | null,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// Explicit unassignment (null override) must drop from the index — else
		// the terminal's isAppHotkey check would swallow the freed chord.
		if (hasOverride && override === null) continue;
		const binding = override ?? HOTKEYS[id].key;
		if (!binding) continue;
		const dispatchChord = bindingToDispatchChord(binding, layoutMap);
		if (!dispatchChord) continue;
		map.set(canonicalizeChord(dispatchChord), id);
	}
	return map;
}

// Reassigned on each override, layout, OR adaptive-layout-toggle change.
// Keep the first build lazy so module import does not execute binding logic
// while binding.ts is still initializing its exported constants.
let registeredAppChords: Map<string, HotkeyId> | null = null;
function getRegisteredAppChords(): Map<string, HotkeyId> {
	if (!registeredAppChords) {
		registeredAppChords = buildRegisteredAppChords(
			useHotkeyOverridesStore.getState().overrides,
			getEffectiveLayoutMap(),
		);
	}
	return registeredAppChords;
}

function rebuild() {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
		getEffectiveLayoutMap(),
	);
}
useHotkeyOverridesStore.subscribe(rebuild);
useKeyboardLayoutStore.subscribe(rebuild);
useKeyboardPreferencesStore.subscribe(rebuild);
