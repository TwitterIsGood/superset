/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "TaskRow.tsx"), "utf8");

describe("TaskRow", () => {
	test("keeps mobile task rows compact enough for bottom tab-bar acceptance", () => {
		expect(SOURCE).toContain(
			'className="h-5 flex-row items-center gap-1.5 pl-4"',
		);
		expect(SOURCE).not.toContain("flex-wrap");
		expect(SOURCE).not.toContain("numberOfLines={2}");
		expect(SOURCE).toContain(
			'className="text-[15px] font-normal text-[#d9d9df]"',
		);
		expect(SOURCE).toContain("numberOfLines={1}");
		expect(SOURCE).toContain('return "在线"');
		expect(SOURCE).toContain('return "离线"');
		expect(SOURCE).toContain('return "未知"');
	});
});
