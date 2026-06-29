import { describe, expect, test } from "bun:test";
import { spawn, summarizeEnv } from "./Pty.ts";

// node-pty's runtime requires Node (Bun's tty.ReadStream handling is
// incompatible with the master fd setup). The daemon ships running under
// node; integration spawn tests live in test/integration.ts and run via
// `npm run test:integration`. Here we only cover the synchronous validation
// logic that doesn't require spawning a real PTY.

describe("Pty wrapper (validation only — spawn behavior tested under node)", () => {
	test("rejects invalid spawn dims (cols)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 0, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});

	test("rejects invalid spawn dims (rows)", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 0 },
			}),
		).toThrow(/invalid rows/);
	});

	test("rejects non-integer dims", () => {
		expect(() =>
			spawn({
				meta: { shell: "/bin/sh", argv: [], cols: 80.5, rows: 24 },
			}),
		).toThrow(/invalid cols/);
	});

	test("rejects null bytes in env keys before node-pty spawn", () => {
		expect(() =>
			spawn({
				meta: {
					shell: "/bin/sh",
					argv: [],
					cols: 80,
					rows: 24,
					env: { "BAD\0KEY": "value" },
				},
			}),
		).toThrow(/invalid env key contains null byte/);
	});

	test("rejects null bytes in env values before node-pty spawn", () => {
		expect(() =>
			spawn({
				meta: {
					shell: "/bin/sh",
					argv: [],
					cols: 80,
					rows: 24,
					env: { BAD_VALUE: "before\0after" },
				},
			}),
		).toThrow(/invalid env value for BAD_VALUE/);
	});

	test("rejects non-string env values before node-pty spawn", () => {
		expect(() =>
			spawn({
				meta: {
					shell: "/bin/sh",
					argv: [],
					cols: 80,
					rows: 24,
					env: { BAD_VALUE: 42 } as unknown as Record<string, string>,
				},
			}),
		).toThrow(/expected string, got number/);
	});

	test("summarizes env size without exposing values", () => {
		expect(
			summarizeEnv({
				SMALL: "x",
				LARGE: "1234567890",
			}),
		).toEqual({
			count: 2,
			bytes: "SMALL=x\0LARGE=1234567890\0".length,
			largestKey: "LARGE",
			largestBytes: "LARGE=1234567890".length,
		});
	});
});
