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
const escapeCharacter = String.fromCharCode(27);
const decPrivateModePattern = new RegExp(
	`${escapeCharacter}\\[\\?([0-9;]+)([hl])`,
	"g",
);

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
	return outputTail.length > 0 && !hasActiveAlternateScreen(outputTail);
}
