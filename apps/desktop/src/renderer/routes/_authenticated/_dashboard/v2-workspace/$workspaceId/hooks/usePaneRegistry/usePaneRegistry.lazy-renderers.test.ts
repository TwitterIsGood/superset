import { describe, expect, test } from "bun:test";

const registrySource = await Bun.file(
	new URL("./usePaneRegistry.tsx", import.meta.url),
).text();
const workspaceContentSource = await Bun.file(
	new URL("../../V2WorkspacePageContent.tsx", import.meta.url),
).text();
const browserPassthroughSource = await Bun.file(
	new URL(
		"../useBrowserShellInteractionPassthrough/useBrowserShellInteractionPassthrough.ts",
		import.meta.url,
	),
).text();

describe("usePaneRegistry lazy renderers", () => {
	test("keeps heavy pane components out of the static registry imports", () => {
		for (const importPath of [
			'from "./components/BrowserPane"',
			'from "./components/ChatPane"',
			'from "./components/CommentPane"',
			'from "./components/DiffPane"',
			'from "./components/FilePane"',
			'from "./components/TerminalPane"',
		]) {
			expect(registrySource).not.toContain(importPath);
		}

		for (const importPath of [
			'import("./components/BrowserPane")',
			'import("./components/ChatPane")',
			'import("./components/CommentPane")',
			'import("./components/DiffPane")',
			'import("./components/FilePane")',
			'import("./components/TerminalPane")',
		]) {
			expect(registrySource).toContain(importPath);
		}
	});

	test("keeps BrowserPane barrel out of workspace shell imports", () => {
		expect(workspaceContentSource).not.toContain(
			'from "./hooks/usePaneRegistry/components/BrowserPane"',
		);
		expect(workspaceContentSource).toContain(
			'from "./hooks/usePaneRegistry/components/BrowserPane/browserTabIcon"',
		);
		expect(browserPassthroughSource).not.toContain(
			'from "../usePaneRegistry/components/BrowserPane"',
		);
		expect(browserPassthroughSource).toContain(
			'from "../usePaneRegistry/components/BrowserPane/browserRuntimeRegistry"',
		);
	});
});
