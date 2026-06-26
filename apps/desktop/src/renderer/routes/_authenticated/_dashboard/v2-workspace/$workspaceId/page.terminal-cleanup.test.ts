import { describe, expect, test } from "bun:test";

const pageSource = await Bun.file(
	new URL("./page.tsx", import.meta.url),
).text();

describe("v2 workspace route runtime cleanup", () => {
	test("releases renderer terminal and browser runtimes when the workspace route unmounts", () => {
		expect(pageSource).toContain("terminalRuntimeRegistry.release");
		expect(pageSource).toContain('pane.kind === "terminal"');
		expect(pageSource).toContain("browserRuntimeRegistry.destroy");
		expect(pageSource).toContain('pane.kind === "browser"');
		expect(pageSource).not.toContain("killTerminalSessionSilently");
	});
});
