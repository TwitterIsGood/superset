import { describe, expect, test } from "bun:test";

describe("useTrellisRuntimePack", () => {
	test("does not advertise a bundled runtime fallback in pack-only builds", async () => {
		const source = await Bun.file(
			new URL("./useTrellisRuntimePack.ts", import.meta.url),
		).text();

		expect(source).not.toContain("bundled runtime fallback");
		expect(source).toContain('process.env.NODE_ENV === "development"');
		expect(source).toContain(
			"The workspace will be created without guided workflow setup.",
		);
	});
});
