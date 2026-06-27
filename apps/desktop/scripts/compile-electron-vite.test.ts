import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopDir, "../..");

describe("compile-electron-vite CI fast path", () => {
	test("supports quiet quick-canary output without changing the build command", () => {
		const script = readFileSync(
			resolve(desktopDir, "scripts/compile-electron-vite.ts"),
			"utf8",
		);
		const workflow = readFileSync(
			resolve(repoRoot, ".github/workflows/build-desktop.yml"),
			"utf8",
		);

		expect(script).toContain("DESKTOP_COMPILE_QUIET");
		expect(script).toContain('logLevel: "warn"');
		expect(workflow).toContain("DESKTOP_COMPILE_PARALLEL:");
		expect(workflow).toContain("DESKTOP_COMPILE_QUIET:");
		expect(workflow).toContain("$" + "{{ inputs.parallel_compile }}");
	});

	test("keeps macOS ZIP-only packaging on a faster compressed path", () => {
		const workflow = readFileSync(
			resolve(repoRoot, ".github/workflows/build-desktop.yml"),
			"utf8",
		);

		expect(workflow).toContain("ELECTRON_BUILDER_ZIP_COMPRESSION_LEVEL:");
		expect(workflow).toContain("ELECTRON_BUILDER_COMPRESSION_LEVEL");
		expect(workflow).toContain("macOS artifact mode is zip_only");
	});
});
