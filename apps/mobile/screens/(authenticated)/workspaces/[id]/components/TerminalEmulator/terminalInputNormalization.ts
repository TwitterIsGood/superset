const zeroWidthMobileInputCharacters = new Set([
	"\u200b",
	"\u200c",
	"\u200d",
	"\u2060",
	"\ufeff",
]);

const mobileImeSpacingCharacters = new Set([
	"\u2000",
	"\u2001",
	"\u2002",
	"\u2003",
	"\u2004",
	"\u2005",
	"\u2006",
	"\u2007",
	"\u2008",
	"\u2009",
	"\u200a",
	"\u202f",
	"\u205f",
]);

function isAsciiTerminalWordCharacter(value: string): boolean {
	return /^[A-Za-z0-9_./~@%+=:,#-]$/.test(value);
}

export function normalizeTerminalInputForHost(data: string): string {
	let normalized = "";

	for (let index = 0; index < data.length; index += 1) {
		const character = data[index];
		if (!character) continue;

		if (zeroWidthMobileInputCharacters.has(character)) {
			continue;
		}

		if (mobileImeSpacingCharacters.has(character)) {
			const previous = normalized[normalized.length - 1] ?? "";
			const next = data[index + 1] ?? "";
			if (
				isAsciiTerminalWordCharacter(previous) &&
				isAsciiTerminalWordCharacter(next)
			) {
				continue;
			}
			normalized += " ";
			continue;
		}

		normalized += character;
	}

	return normalized;
}
