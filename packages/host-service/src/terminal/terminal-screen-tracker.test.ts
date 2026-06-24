import { describe, expect, test } from "bun:test";
import {
	createTerminalScreenTracker,
	TERMINAL_SCREEN_SNAPSHOT_FORMAT,
	TERMINAL_SCREEN_SNAPSHOT_VERSION,
} from "./terminal-screen-tracker.ts";

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
	return encoder.encode(value);
}

describe("createTerminalScreenTracker", () => {
	test("serializes current screen state instead of raw terminal history", () => {
		const tracker = createTerminalScreenTracker(20, 5);
		try {
			tracker.feed(bytes("first line\r\nsecond line\r\nthird line"));
			tracker.feed(bytes("\x1b[2;1HOVERWRITE"));

			const snapshot = tracker.getSnapshot();

			expect(snapshot.format).toBe(TERMINAL_SCREEN_SNAPSHOT_FORMAT);
			expect(snapshot.version).toBe(TERMINAL_SCREEN_SNAPSHOT_VERSION);
			expect(snapshot.cols).toBe(20);
			expect(snapshot.rows).toBe(5);
			expect(snapshot.scrollback).toBe(0);
			expect(snapshot.content).toContain("first line");
			expect(snapshot.content).toContain("OVERWRITEne");
			expect(snapshot.content).toContain("third line");
			expect(snapshot.content).not.toContain("second line\r\n");
			expect(snapshot.contentBytes).toBeGreaterThan(0);
			expect(snapshot.truncated).toBe(false);
		} finally {
			tracker.dispose();
		}
	});

	test("omits scrolled-off history from mobile screen snapshots", () => {
		const tracker = createTerminalScreenTracker(20, 3);
		try {
			tracker.feed(
				bytes(
					[
						"old frame 1",
						"old frame 2",
						"current 1",
						"current 2",
						"current 3",
					].join("\r\n"),
				),
			);

			const snapshot = tracker.getSnapshot();

			expect(snapshot.scrollback).toBe(0);
			expect(snapshot.content).not.toContain("old frame 1");
			expect(snapshot.content).not.toContain("old frame 2");
			expect(snapshot.content).toContain("current 1");
			expect(snapshot.content).toContain("current 2");
			expect(snapshot.content).toContain("current 3");
		} finally {
			tracker.dispose();
		}
	});

	test("tracks real terminal resizes in snapshot metadata", () => {
		const tracker = createTerminalScreenTracker(80, 24);
		try {
			tracker.feed(bytes("ready"));
			tracker.resize(120, 40);

			const snapshot = tracker.getSnapshot();

			expect(snapshot.cols).toBe(120);
			expect(snapshot.rows).toBe(40);
			expect(snapshot.content).toContain("ready");
		} finally {
			tracker.dispose();
		}
	});
});
