/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "MobileMarkdown.tsx"),
	"utf8",
);
const templateDollar = "$";

describe("MobileMarkdown", () => {
	test("uses row position in table keys so duplicate rows do not trigger React warnings", () => {
		expect(SOURCE).toContain("block.rows.map((row, rowIndex)");
		expect(SOURCE).toContain(
			"key={`row-" +
				templateDollar +
				"{rowIndex}-" +
				templateDollar +
				"{rowKey(row)}`}",
		);
		expect(SOURCE).toContain(
			"key={`cell-" +
				templateDollar +
				"{rowIndex}-" +
				templateDollar +
				"{rowKey(row)}-" +
				templateDollar +
				"{columnIndex}`}",
		);
	});

	test("keeps multi-column ACP tables aligned inside the mobile viewport", () => {
		expect(SOURCE).toContain("function tableColumnFlexWeights");
		expect(SOURCE).toContain("inlineDisplayWidth");
		expect(SOURCE).toContain("const columnWeights = tableColumnFlexWeights");
		expect(SOURCE).toContain("const isDenseTable = columnCount >= 4;");
		expect(SOURCE).toContain('"w-full overflow-hidden rounded-md');
		expect(SOURCE).toContain("flexBasis: 0");
		expect(SOURCE).toContain("flexGrow: columnWeights[columnIndex] ?? 1");
		expect(SOURCE).toContain("flexShrink: 1");
		expect(SOURCE).toContain("numberOfLines={2}");
		expect(SOURCE).not.toContain("ScrollView");
		expect(SOURCE).not.toContain("horizontal");
		expect(SOURCE).not.toContain('"min-w-[112px]"');
	});
});
