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

describe("desktop chat service router startup boundary", () => {
	it("keeps ChatService construction behind a dynamic import", () => {
		const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");

		expect(staticImportSpecifiers(source)).not.toContain(
			"@superset/chat/server/desktop/chat-service",
		);
		expect(source).toContain('"@superset/chat/server/desktop/chat-service"');
		expect(source).not.toContain(
			"export const chatService = new ChatService()",
		);
	});
});
