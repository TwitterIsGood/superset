import { describe, expect, test } from "bun:test";

const pageSource = await Bun.file(
	new URL("./V2WorkspacePageContent.tsx", import.meta.url),
).text();

describe("v2 workspace route runtime cleanup", () => {
	test("releases renderer terminal and browser runtimes when the workspace route unmounts", () => {
		expect(pageSource).toContain("releaseTerminalRuntimeLazy");
		expect(pageSource).toContain('pane.kind === "terminal"');
		expect(pageSource).toContain("browserRuntimeRegistry.destroy");
		expect(pageSource).toContain('pane.kind === "browser"');
		expect(pageSource).not.toContain("terminalRuntimeRegistry");
		expect(pageSource).not.toContain("killTerminalSessionSilently");
	});

	test("keeps looking for the dashboard sidebar portal slot after first render", () => {
		expect(pageSource).toContain("syncSidebarSlot");
		expect(pageSource).toContain("requestAnimationFrame(syncSidebarSlot)");
		expect(pageSource).toContain("cancelAnimationFrame(animationFrameId)");
	});
});
