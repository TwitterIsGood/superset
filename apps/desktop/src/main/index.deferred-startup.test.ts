import { describe, expect, test } from "bun:test";

const mainSource = await Bun.file(
	new URL("./index.ts", import.meta.url),
).text();

function indexOfSnippet(snippet: string): number {
	const index = mainSource.indexOf(snippet);
	expect(index, `Missing snippet: ${snippet}`).toBeGreaterThanOrEqual(0);
	return index;
}

describe("main deferred startup sequence", () => {
	test("runs non-critical startup work after the first window show", () => {
		const deferredFunction = indexOfSnippet(
			"function runDeferredStartupTasks()",
		);
		const firstShowScheduler = indexOfSnippet("runAfterFirstWindowShow(");
		const windowSetup = indexOfSnippet("main:window-setup-start");
		const deferredCall = indexOfSnippet(
			"runAfterFirstWindowShow(mainWindow, runDeferredStartupTasks)",
		);

		expect(deferredFunction).toBeLessThan(windowSetup);
		expect(firstShowScheduler).toBeLessThan(windowSetup);
		expect(deferredCall).toBeGreaterThan(windowSetup);

		for (const mark of [
			"main:network-logger-start",
			"main:webview-extension-start",
			"main:terminal-prewarm-start",
			"main:agent-hooks-start",
			"main:bundled-cli-shim-start",
		]) {
			const markIndex = indexOfSnippet(mark);
			expect(markIndex).toBeGreaterThan(deferredFunction);
			expect(markIndex).toBeLessThan(windowSetup);
		}
	});

	test("keeps terminal reconcile before renderer restore", () => {
		const reconcileIndex = indexOfSnippet("main:terminal-reconcile-start");
		const windowSetup = indexOfSnippet("main:window-setup-start");

		expect(reconcileIndex).toBeLessThan(windowSetup);
	});
});
