/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
	mergeTerminalSnapshotState,
	type TerminalSnapshotMergeRun,
} from "./terminalSnapshotMerge";

const screenSnapshot = (content: string) => ({
	format: "xterm-serialize-ansi" as const,
	version: 1 as const,
	cols: 80,
	rows: 24,
	content,
});

const baseRun = (
	overrides: Partial<TerminalSnapshotMergeRun> = {},
): TerminalSnapshotMergeRun => ({
	terminalId: "terminal-1",
	terminalDimensions: null,
	outputTail: "",
	screenSnapshot: null,
	restoreRevision: 0,
	hasLoadedSnapshot: false,
	suppressReplayUntilDelta: true,
	usesScreenSnapshotBaseline: false,
	exited: false,
	exitCode: null,
	errorMessage: null,
	...overrides,
});

describe("mergeTerminalSnapshotState", () => {
	test("uses screen snapshots as the first rendered terminal baseline", () => {
		const result = mergeTerminalSnapshotState(
			baseRun(),
			{
				outputTail: "raw tui bytes",
				screenSnapshot: screenSnapshot("serialized screen"),
				exited: false,
			},
			{ previousRawTail: undefined, replayInitialSnapshot: false },
		);

		expect(result.nextRawTail).toBe("raw tui bytes");
		expect(result.run.outputTail).toBe("serialized screen");
		expect(result.run.screenSnapshot?.content).toBe("serialized screen");
		expect(result.run.terminalDimensions).toEqual({ cols: 80, rows: 24 });
		expect(result.run.usesScreenSnapshotBaseline).toBe(true);
		expect(result.run.suppressReplayUntilDelta).toBe(false);
	});

	test("does not append raw poll tails after a screen snapshot baseline", () => {
		const current = baseRun({
			outputTail: "serialized screen",
			screenSnapshot: screenSnapshot("serialized screen"),
			hasLoadedSnapshot: true,
			suppressReplayUntilDelta: false,
			usesScreenSnapshotBaseline: true,
		});

		const result = mergeTerminalSnapshotState(
			current,
			{
				outputTail: "raw tui bytes plus new raw tail",
				screenSnapshot: screenSnapshot("serialized screen from poll"),
				exited: false,
			},
			{
				previousRawTail: "raw tui bytes",
				replayInitialSnapshot: false,
			},
		);

		expect(result.nextRawTail).toBe("raw tui bytes plus new raw tail");
		expect(result.run.outputTail).toBe("serialized screen");
		expect(result.run.usesScreenSnapshotBaseline).toBe(true);
		expect(result.run.screenSnapshot?.content).toBe("serialized screen");
	});

	test("keeps screen snapshot mode even if a later host poll omits screenSnapshot", () => {
		const current = baseRun({
			outputTail: "serialized screen plus live bytes",
			screenSnapshot: null,
			hasLoadedSnapshot: true,
			suppressReplayUntilDelta: false,
			usesScreenSnapshotBaseline: true,
		});

		const result = mergeTerminalSnapshotState(
			current,
			{
				outputTail: "raw tui bytes plus live bytes plus poll bytes",
				exited: false,
			},
			{
				previousRawTail: "raw tui bytes plus live bytes",
				replayInitialSnapshot: false,
			},
		);

		expect(result.nextRawTail).toBe(
			"raw tui bytes plus live bytes plus poll bytes",
		);
		expect(result.run.outputTail).toBe("serialized screen plus live bytes");
		expect(result.run.usesScreenSnapshotBaseline).toBe(true);
		expect(result.run.suppressReplayUntilDelta).toBe(false);
	});

	test("still appends safe raw-tail deltas for legacy hosts without screen snapshots", () => {
		const current = baseRun({
			outputTail: "prompt\n",
			hasLoadedSnapshot: true,
			suppressReplayUntilDelta: false,
			usesScreenSnapshotBaseline: false,
		});

		const result = mergeTerminalSnapshotState(
			current,
			{
				outputTail: "prompt\nls\r\nfile.txt\n",
				exited: false,
			},
			{
				previousRawTail: "prompt\n",
				replayInitialSnapshot: false,
			},
		);

		expect(result.run.outputTail).toBe("prompt\nls\r\nfile.txt\n");
		expect(result.run.usesScreenSnapshotBaseline).toBe(false);
	});

	test("restores a legacy raw tail from the last hard clear-screen boundary", () => {
		const result = mergeTerminalSnapshotState(
			baseRun(),
			{
				outputTail:
					"stale prompt repaint\u001b[J\r\n\u001b[H\u001b[2Jfresh prompt\r\n › \u001b[K",
				exited: false,
			},
			{ previousRawTail: undefined, replayInitialSnapshot: true },
		);

		expect(result.run.outputTail).toBe(
			"\u001b[H\u001b[2Jfresh prompt\r\n › \u001b[K",
		);
		expect(result.run.suppressReplayUntilDelta).toBe(false);
	});

	test("keeps suppressing ambiguous legacy repaint deltas without a hard clear-screen boundary", () => {
		const current = baseRun({
			outputTail: "",
			hasLoadedSnapshot: true,
			suppressReplayUntilDelta: true,
			usesScreenSnapshotBaseline: false,
		});

		const result = mergeTerminalSnapshotState(
			current,
			{
				outputTail: "prompt\r\n › p\bprintf 'OK\\n'\r\nOK\r\n\u001b[J",
				exited: false,
			},
			{ previousRawTail: "", replayInitialSnapshot: false },
		);

		expect(result.run.outputTail).toBe("");
		expect(result.run.suppressReplayUntilDelta).toBe(true);
	});
});
