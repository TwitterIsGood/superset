function longestSuffixPrefixOverlap(previous: string, next: string): number {
	const maxLength = Math.min(previous.length, next.length);
	for (let length = maxLength; length > 0; length -= 1) {
		if (previous.endsWith(next.slice(0, length))) {
			return length;
		}
	}
	return 0;
}

export function terminalTailDelta(
	previous: string | undefined,
	next: string,
): string {
	if (previous === undefined) return "";
	if (next.startsWith(previous)) return next.slice(previous.length);
	const overlap = longestSuffixPrefixOverlap(previous, next);
	return overlap > 0 ? next.slice(overlap) : "";
}

const alternateScreenModes = new Set(["47", "1047", "1049"]);
const backspaceCharacter = String.fromCharCode(8);
const escapeCharacter = String.fromCharCode(27);
const decPrivateModePattern = new RegExp(
	`${escapeCharacter}\\[\\?([0-9;]+)([hl])`,
	"g",
);
const repaintControlPatterns = [
	// Shells and TUIs use these to repaint the current prompt/screen. Replaying
	// them from a bounded raw tail can start mid-frame and smear the terminal.
	new RegExp(backspaceCharacter),
	new RegExp(`${escapeCharacter}\\[[0-9;]*[GJK]`),
	new RegExp(`${escapeCharacter}\\[[0-9;]*[ABCD]`),
	new RegExp(`${escapeCharacter}\\[[0-9]+;[0-9]+[Hf]`),
];
const hardScreenResetPatterns = ["\x1bc", "\x1b[H\x1b[2J", "\x1b[2J\x1b[H"];

function hasActiveAlternateScreen(outputTail: string): boolean {
	let active = false;
	for (const match of outputTail.matchAll(decPrivateModePattern)) {
		const modes = match[1]?.split(";") ?? [];
		if (!modes.some((mode) => alternateScreenModes.has(mode))) {
			continue;
		}
		active = match[2] === "h";
	}
	return active;
}

export function shouldReplayInitialTerminalSnapshot(
	outputTail: string,
): boolean {
	return replayableInitialTerminalSnapshot(outputTail) !== null;
}

export function replayableInitialTerminalSnapshot(
	outputTail: string,
): string | null {
	if (outputTail.length === 0 || hasActiveAlternateScreen(outputTail)) {
		return null;
	}

	const hardResetIndex = hardScreenResetPatterns.reduce(
		(latest, pattern) => Math.max(latest, outputTail.lastIndexOf(pattern)),
		-1,
	);
	if (hardResetIndex >= 0) {
		return outputTail.slice(hardResetIndex);
	}

	if (repaintControlPatterns.some((pattern) => pattern.test(outputTail))) {
		return null;
	}

	return outputTail;
}
