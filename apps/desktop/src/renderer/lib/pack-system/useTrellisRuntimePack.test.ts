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

	test("prepares the Superset CLI runtime pack as an optional task sync runtime", async () => {
		const source = await Bun.file(
			new URL("./useTrellisRuntimePack.ts", import.meta.url),
		).text();

		expect(source).toContain("SUPERSET_CLI_RUNTIME_PACK_ID");
		expect(source).toContain("supersetCliRuntimePackPath");
		expect(source).toContain("Could not prepare task sync runtime");
		expect(source).toContain(
			"The workspace will still be created; task status sync may use the local fallback.",
		);
	});
});
