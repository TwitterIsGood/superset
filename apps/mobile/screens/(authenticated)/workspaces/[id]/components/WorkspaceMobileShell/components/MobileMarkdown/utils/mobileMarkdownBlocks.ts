export type MobileMarkdownInline =
	| { type: "text"; text: string }
	| { type: "strong"; text: string }
	| { type: "code"; text: string };

export type MobileMarkdownBlock =
	| { type: "paragraph"; content: MobileMarkdownInline[] }
	| {
			type: "heading";
			level: 1 | 2 | 3 | 4 | 5 | 6;
			content: MobileMarkdownInline[];
	  }
	| { type: "thematicBreak" }
	| {
			type: "list";
			ordered: boolean;
			items: {
				content: MobileMarkdownInline[];
				level: number;
			}[];
	  }
	| { type: "code"; text: string; language: string | null }
	| {
			type: "table";
			headers: MobileMarkdownInline[][];
			rows: MobileMarkdownInline[][][];
	  };

function splitTableRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.includes("|")) return null;
	let source = trimmed;
	if (source.startsWith("|")) source = source.slice(1);
	if (source.endsWith("|")) source = source.slice(0, -1);
	const cells = source.split("|").map((cell) => cell.trim());
	while (cells[0] === "") cells.shift();
	while (cells.at(-1) === "") cells.pop();
	return cells.length > 1 ? cells : null;
}

function isTableSeparator(cells: string[] | null): cells is string[] {
	return Boolean(
		cells?.length &&
			cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, ""))),
	);
}

function isFenceStart(line: string): RegExpMatchArray | null {
	return line.match(/^\s*(```|~~~)\s*([A-Za-z0-9_-]+)?\s*$/);
}

function parseHeadingLine(line: string): {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	text: string;
} | null {
	const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
	if (!match?.[1] || !match[2]) return null;
	return {
		level: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
		text: match[2].trim(),
	};
}

function isThematicBreak(line: string): boolean {
	return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function leadingSpaceWidth(value: string): number {
	return value.replace(/\t/g, "    ").length;
}

function parseListLine(
	line: string,
): { ordered: boolean; level: number; text: string } | null {
	const unordered = line.match(/^(\s*)([-*+])\s+(.+)$/);
	if (unordered?.[1] !== undefined && unordered[3]) {
		return {
			ordered: false,
			level: Math.floor(leadingSpaceWidth(unordered[1]) / 2),
			text: unordered[3].trim(),
		};
	}

	const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
	if (ordered?.[1] !== undefined && ordered[3]) {
		return {
			ordered: true,
			level: Math.floor(leadingSpaceWidth(ordered[1]) / 2),
			text: ordered[3].trim(),
		};
	}

	return null;
}

export function parseMobileMarkdownInline(
	value: string,
): MobileMarkdownInline[] {
	const parts: MobileMarkdownInline[] = [];
	const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while (true) {
		match = tokenPattern.exec(value);
		if (match === null) break;
		if (match.index > lastIndex) {
			parts.push({ type: "text", text: value.slice(lastIndex, match.index) });
		}

		const token = match[0];
		if (token.startsWith("`")) {
			parts.push({ type: "code", text: token.slice(1, -1) });
		} else {
			parts.push({ type: "strong", text: token.slice(2, -2) });
		}
		lastIndex = match.index + token.length;
	}

	if (lastIndex < value.length) {
		parts.push({ type: "text", text: value.slice(lastIndex) });
	}

	return parts.length > 0 ? parts : [{ type: "text", text: value }];
}

export function parseMobileMarkdown(value: string): MobileMarkdownBlock[] {
	const lines = value.replace(/\r\n/g, "\n").split("\n");
	const blocks: MobileMarkdownBlock[] = [];
	let paragraphLines: string[] = [];
	let listState:
		| {
				ordered: boolean;
				items: { text: string; level: number }[];
		  }
		| undefined;

	const flushParagraph = () => {
		if (paragraphLines.length === 0) return;
		blocks.push({
			type: "paragraph",
			content: parseMobileMarkdownInline(paragraphLines.join("\n")),
		});
		paragraphLines = [];
	};

	const flushList = () => {
		if (!listState || listState.items.length === 0) return;
		blocks.push({
			type: "list",
			ordered: listState.ordered,
			items: listState.items.map((item) => ({
				content: parseMobileMarkdownInline(item.text),
				level: item.level,
			})),
		});
		listState = undefined;
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const fenceStart = isFenceStart(line);
		if (fenceStart) {
			flushList();
			flushParagraph();
			const fence = fenceStart[1];
			const language = fenceStart[2] ?? null;
			const codeLines: string[] = [];
			index += 1;
			while (index < lines.length) {
				const candidate = lines[index] ?? "";
				if (candidate.trim().startsWith(fence)) break;
				codeLines.push(candidate);
				index += 1;
			}
			blocks.push({ type: "code", text: codeLines.join("\n"), language });
			continue;
		}

		const headerCells = splitTableRow(line);
		const separatorCells = splitTableRow(lines[index + 1] ?? "");
		if (headerCells && isTableSeparator(separatorCells)) {
			flushList();
			flushParagraph();
			const rows: MobileMarkdownInline[][][] = [];
			index += 2;
			while (index < lines.length) {
				const rowCells = splitTableRow(lines[index] ?? "");
				if (!rowCells) {
					index -= 1;
					break;
				}
				rows.push(rowCells.map(parseMobileMarkdownInline));
				index += 1;
			}
			blocks.push({
				type: "table",
				headers: headerCells.map(parseMobileMarkdownInline),
				rows,
			});
			continue;
		}

		const heading = parseHeadingLine(line);
		if (heading) {
			flushList();
			flushParagraph();
			blocks.push({
				type: "heading",
				level: heading.level,
				content: parseMobileMarkdownInline(heading.text),
			});
			continue;
		}

		if (isThematicBreak(line)) {
			flushList();
			flushParagraph();
			blocks.push({ type: "thematicBreak" });
			continue;
		}

		const listItem = parseListLine(line);
		if (listItem) {
			flushParagraph();
			if (!listState || listState.ordered !== listItem.ordered) {
				flushList();
				listState = { ordered: listItem.ordered, items: [] };
			}
			listState.items.push({
				text: listItem.text,
				level: listItem.level,
			});
			continue;
		}

		if (listState && /^\s{2,}\S/.test(line) && listState.items.length > 0) {
			const lastItem = listState.items[listState.items.length - 1];
			lastItem.text = `${lastItem.text}\n${line.trim()}`;
			continue;
		}

		if (line.trim().length === 0) {
			flushList();
			flushParagraph();
			continue;
		}

		flushList();
		paragraphLines.push(line);
	}

	flushList();
	flushParagraph();
	return blocks;
}
