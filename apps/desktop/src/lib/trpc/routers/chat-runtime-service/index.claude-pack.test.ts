import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("desktop chat runtime Claude Agent pack boundary", () => {
	it("resolves standalone Claude runtime paths from the resource pack", () => {
		const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");

		expect(source).toContain("CLAUDE_AGENT_RUNTIME_PACK_ID");
		expect(source).toContain("getPackManager().resolvePack");
		expect(source).toContain("sdkImportPath: join(resolution.path, sdkEntry)");
		expect(source).toContain(
			"executablePath: join(resolution.path, executableArg)",
		);
		expect(source).toContain("resolveClaudeAgentRuntime,");
	});

	it("resolves workspace MastraCode runtime paths from the resource pack", () => {
		const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");

		expect(source).toContain("MASTRACODE_RUNTIME_PACK_ID");
		expect(source).toContain("resolveMastracodeRuntime");
		expect(source).toContain(
			"mastracodeImportPath: join(resolution.path, mastracodeEntry)",
		);
		expect(source).toContain(
			"memoryImportPath: join(resolution.path, memoryEntry)",
		);
		expect(source).toContain("resolveMastracodeRuntime,");
	});
});
