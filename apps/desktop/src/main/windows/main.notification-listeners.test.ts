import { describe, expect, test } from "bun:test";

const mainWindowSource = await Bun.file(
	new URL("./main.ts", import.meta.url),
).text();

describe("MainWindow notification listener cleanup", () => {
	test("cleans up only listeners registered by the window", () => {
		expect(mainWindowSource).toContain("handleAgentLifecycle");
		expect(mainWindowSource).toContain("handleTerminalExit");
		expect(mainWindowSource).toContain("notificationsEmitter.off(");
		expect(mainWindowSource).toContain('terminalRuntime.off("terminalExit"');
		expect(mainWindowSource).not.toContain(
			"notificationsEmitter.removeAllListeners()",
		);
		expect(mainWindowSource).not.toContain("terminal.detachAllListeners()");
	});
});
