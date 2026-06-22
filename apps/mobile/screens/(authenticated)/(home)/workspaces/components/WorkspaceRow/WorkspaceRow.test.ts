/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "WorkspaceRow.tsx"), "utf8");

describe("WorkspaceRow", () => {
	test("keeps workspace rows compact for mobile bottom-tab acceptance", () => {
		expect(SOURCE).toContain(
			'className="mt-0.5 h-5 flex-row items-center gap-1.5"',
		);
		expect(SOURCE).not.toContain("flex-wrap");
		expect(SOURCE).not.toContain("min-h-[54px]");
		expect(SOURCE).toContain("max-w-[104px]");
		expect(SOURCE).toContain("max-w-[154px]");
		expect(SOURCE).toContain("ArrowUpRight");
	});

	test("does not label cloud host presence as chat readiness", () => {
		expect(SOURCE).toContain("hostDotColor(workspace.hostReachability)");
		expect(SOURCE).not.toContain("reachabilityLabel");
		expect(SOURCE).not.toContain("reachabilityClassName");
		expect(SOURCE).not.toContain("Host online");
		expect(SOURCE).not.toContain("Stale host");
		expect(SOURCE).toContain("无主机权限");
		expect(SOURCE).not.toContain('return "Ready"');
		expect(SOURCE).not.toContain("rounded-full px-2 py-0.5");
	});
});
