/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "terminal.ts"), "utf8");

function procedureSource(procedure: string, nextProcedure: string): string {
	const procedureIndex = SOURCE.indexOf(`${procedure}: protectedProcedure`);
	const nextProcedureIndex = SOURCE.indexOf(
		`${nextProcedure}: protectedProcedure`,
		procedureIndex + procedure.length,
	);
	expect(procedureIndex).toBeGreaterThan(0);
	expect(nextProcedureIndex).toBeGreaterThan(procedureIndex);
	return SOURCE.slice(procedureIndex, nextProcedureIndex);
}

describe("terminal mobile control procedures", () => {
	test("adopts daemon-backed sessions before mobile snapshot, input, and resize", () => {
		expect(SOURCE).toContain("async function ensureTerminalSessionForControl");
		expect(SOURCE).toContain("adoptOnly: true");

		for (const block of [
			procedureSource("getSnapshot", "writeInput"),
			procedureSource("writeInput", "resize"),
			procedureSource("resize", "killSession"),
		]) {
			expect(block).toContain("ensureTerminalSessionForControl");
			expect(block).toContain("throwTerminalControlError");
		}
	});

	test("replays daemon output only when reading a snapshot baseline", () => {
		const snapshotSource = procedureSource("getSnapshot", "writeInput");
		const inputSource = procedureSource("writeInput", "resize");
		const resizeSource = procedureSource("resize", "killSession");

		expect(snapshotSource).toContain("replayOnAdoption: true");
		expect(inputSource).toContain("replayOnAdoption: false");
		expect(resizeSource).toContain("replayOnAdoption: false");
	});
});
