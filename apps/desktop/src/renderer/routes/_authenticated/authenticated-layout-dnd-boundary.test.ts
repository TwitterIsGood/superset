import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression tests inspect files directly
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression tests inspect files directly
import { join } from "node:path";

const AUTHENTICATED_LAYOUT = join(__dirname, "layout.tsx");

describe("authenticated layout DnD boundary", () => {
	test("keeps the DnD provider stable across dashboard route changes", () => {
		const source = readFileSync(AUTHENTICATED_LAYOUT, "utf-8");

		expect(source).toContain(
			'import { ReactDndBoundary } from "./components/ReactDndBoundary";',
		);
		expect(source).toContain(
			"return <ReactDndBoundary>{content}</ReactDndBoundary>;",
		);
		expect(source).not.toContain("routeUsesReactDnd");
		expect(source).not.toContain("shouldEnableReactDnd");
		expect(source).not.toContain("LazyReactDndBoundary");
	});
});
