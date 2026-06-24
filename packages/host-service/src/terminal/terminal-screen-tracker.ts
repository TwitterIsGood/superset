import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// @xterm/headless 6.x can inspect `window` at module load in Bun/Node runtimes.
// Provide the same narrow polyfill the desktop terminal host uses before
// requiring xterm modules.
const globalRecord = globalThis as Record<string, unknown>;
if (typeof globalRecord.window === "undefined") {
	globalRecord.window = globalThis;
}

const { Terminal: HeadlessTerminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon } =
	require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

export const TERMINAL_SCREEN_SNAPSHOT_FORMAT = "xterm-serialize-ansi" as const;
export const TERMINAL_SCREEN_SNAPSHOT_VERSION = 1 as const;

const SCREEN_SNAPSHOT_SCROLLBACK = 0;
const MAX_SCREEN_SNAPSHOT_BYTES = 128 * 1024;

export interface TerminalScreenSnapshot {
	format: typeof TERMINAL_SCREEN_SNAPSHOT_FORMAT;
	version: typeof TERMINAL_SCREEN_SNAPSHOT_VERSION;
	cols: number;
	rows: number;
	content: string;
	contentBytes: number;
	scrollback: number;
	truncated: boolean;
}

export interface TerminalScreenTracker {
	feed(bytes: Uint8Array): void;
	resize(cols: number, rows: number): void;
	getSnapshot(): TerminalScreenSnapshot;
	dispose(): void;
}

type HeadlessTerminalInstance = InstanceType<typeof HeadlessTerminal>;
type SerializeAddonInstance = InstanceType<typeof SerializeAddon>;
type HeadlessInternals = {
	_core?: {
		_writeBuffer?: { writeSync(data: string | Uint8Array): void };
	};
};

const textEncoder = new TextEncoder();

function utf8ByteLength(value: string): number {
	return textEncoder.encode(value).byteLength;
}

function serializeWithCap(input: {
	serializer: SerializeAddonInstance;
	cols: number;
	rows: number;
}): Pick<
	TerminalScreenSnapshot,
	"content" | "contentBytes" | "scrollback" | "truncated"
> {
	const content = input.serializer.serialize({
		scrollback: SCREEN_SNAPSHOT_SCROLLBACK,
	});
	const contentBytes = utf8ByteLength(content);
	if (contentBytes <= MAX_SCREEN_SNAPSHOT_BYTES) {
		return {
			content,
			contentBytes,
			scrollback: SCREEN_SNAPSHOT_SCROLLBACK,
			truncated: false,
		};
	}

	const clearAndHome = "\x1bc";
	const fallbackContent = `${clearAndHome}\x1b[${input.rows};${input.cols}H`;
	return {
		content: fallbackContent,
		contentBytes: utf8ByteLength(fallbackContent),
		scrollback: SCREEN_SNAPSHOT_SCROLLBACK,
		truncated: true,
	};
}

export function createTerminalScreenTracker(
	cols: number,
	rows: number,
): TerminalScreenTracker {
	const terminal = new HeadlessTerminal({
		cols,
		rows,
		scrollback: SCREEN_SNAPSHOT_SCROLLBACK,
		allowProposedApi: true,
	});
	const serializer = new SerializeAddon();
	terminal.loadAddon(
		serializer as unknown as Parameters<
			HeadlessTerminalInstance["loadAddon"]
		>[0],
	);

	const internals = terminal as unknown as HeadlessInternals;
	const writeBuffer = internals._core?._writeBuffer;
	if (typeof writeBuffer?.writeSync !== "function") {
		terminal.dispose();
		throw new Error(
			"@xterm/headless internals not found (_writeBuffer.writeSync). " +
				"Check pinned xterm versions before enabling terminal screen snapshots.",
		);
	}

	return {
		feed(bytes) {
			if (bytes.byteLength === 0) return;
			writeBuffer.writeSync(bytes);
		},
		resize(nextCols, nextRows) {
			if (terminal.cols === nextCols && terminal.rows === nextRows) return;
			terminal.resize(nextCols, nextRows);
		},
		getSnapshot() {
			const serialized = serializeWithCap({
				serializer,
				cols: terminal.cols,
				rows: terminal.rows,
			});
			return {
				format: TERMINAL_SCREEN_SNAPSHOT_FORMAT,
				version: TERMINAL_SCREEN_SNAPSHOT_VERSION,
				cols: terminal.cols,
				rows: terminal.rows,
				...serialized,
			};
		},
		dispose() {
			terminal.dispose();
		},
	};
}
