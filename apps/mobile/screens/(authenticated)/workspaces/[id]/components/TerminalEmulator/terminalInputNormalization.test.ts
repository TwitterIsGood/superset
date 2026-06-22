/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { normalizeTerminalInputForHost } from "./terminalInputNormalization";

describe("normalizeTerminalInputForHost", () => {
	test("removes iOS pinyin inline separators between command characters", () => {
		expect(normalizeTerminalInputForHost("p\u2006w\u2006d\r")).toBe("pwd\r");
	});

	test("preserves intentional ASCII shell spaces", () => {
		expect(normalizeTerminalInputForHost("echo hello world\r")).toBe(
			"echo hello world\r",
		);
	});

	test("maps mobile spacing separators outside command runs to shell spaces", () => {
		expect(normalizeTerminalInputForHost("echo\u2006你好\r")).toBe(
			"echo 你好\r",
		);
	});

	test("drops zero-width mobile input characters", () => {
		expect(normalizeTerminalInputForHost("pw\u200bd\u2060\r")).toBe("pwd\r");
	});
});
