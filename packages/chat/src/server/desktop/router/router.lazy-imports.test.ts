import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function staticImportSpecifiers(source: string): string[] {
	const importDeclarations =
		source.match(/import(?:[\s\S]*?)from\s+["'][^"']+["'];/g) ?? [];
	return importDeclarations.flatMap((declaration) => {
		if (declaration.startsWith("import type")) return [];
		const match = declaration.match(/from\s+["']([^"']+)["'];/);
		return match?.[1] ? [match[1]] : [];
	});
}

describe("desktop chat service router imports", () => {
	it("keeps workspace helper modules out of top-level value imports", () => {
		const source = readFileSync(join(import.meta.dirname, "router.ts"), "utf8");

		expect(staticImportSpecifiers(source)).not.toEqual(
			expect.arrayContaining([
				"../slash-commands",
				"./file-search",
				"./mcp-overview",
			]),
		);
	});
});
