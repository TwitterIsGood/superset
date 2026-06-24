/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
	replayableInitialTerminalSnapshot,
	shouldReplayInitialTerminalSnapshot,
	terminalTailDelta,
} from "./terminalTailDelta";

describe("terminalTailDelta", () => {
	test("suppresses the first attach snapshot as a replay baseline", () => {
		expect(terminalTailDelta(undefined, "old prompt\n")).toBe("");
	});

	test("returns only appended output for normal polling", () => {
		expect(terminalTailDelta("prompt\n", "prompt\nls\r\nfile.txt\n")).toBe(
			"ls\r\nfile.txt\n",
		);
	});

	test("uses suffix-prefix overlap when the host tail window shifts", () => {
		expect(terminalTailDelta("abc\npartial", "partial\nnext\n")).toBe(
			"\nnext\n",
		);
	});

	test("drops ambiguous non-overlapping tails instead of smearing stale terminal history", () => {
		expect(
			terminalTailDelta("old full-screen tui", "new unrelated prompt"),
		).toBe("");
	});
});

describe("shouldReplayInitialTerminalSnapshot", () => {
	test("restores ordinary shell output after app reload", () => {
		expect(
			shouldReplayInitialTerminalSnapshot(
				"Last login: Sun Jun 21 10:00:00\nsuperset % ",
			),
		).toBe(true);
	});

	test("does not restore an active alternate-screen TUI tail", () => {
		expect(
			shouldReplayInitialTerminalSnapshot("\u001b[?1049htop screen bytes"),
		).toBe(false);
	});

	test("does not restore bounded raw tails that contain prompt repaint controls", () => {
		expect(
			shouldReplayInitialTerminalSnapshot(
				"└  ~/.superset/worktrees/demo\r\n › p\bprintf 'OK\\n'\r\nOK\r\n\u001b[J",
			),
		).toBe(false);
	});

	test("restores only the last hard clear-screen boundary for legacy shell redraw tails", () => {
		const replayable = replayableInitialTerminalSnapshot(
			"stale mid-frame\u001b[J\r\n\u001b[H\u001b[2J└  ~/.superset/worktrees/demo\r\n › \u001b[K",
		);
		expect(replayable).toBe(
			"\u001b[H\u001b[2J└  ~/.superset/worktrees/demo\r\n › \u001b[K",
		);
	});

	test("does not restore bounded raw tails that contain cursor movement rewrites", () => {
		expect(
			shouldReplayInitialTerminalSnapshot(
				" › printf 'STILL_LL_\u001b[16Dprintf 'STILL_LL_OK\\n'\r\nSTILL_LL_OK\r\n",
			),
		).toBe(false);
	});

	test("restores once alternate-screen mode has been closed", () => {
		expect(
			shouldReplayInitialTerminalSnapshot(
				"\u001b[?1049hvim bytes\u001b[?1049lsuperset % ",
			),
		).toBe(true);
	});
});
