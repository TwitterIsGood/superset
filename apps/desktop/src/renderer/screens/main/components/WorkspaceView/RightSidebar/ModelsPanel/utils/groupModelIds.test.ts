import { describe, expect, test } from "bun:test";
import { groupModelIds } from "./groupModelIds";

describe("groupModelIds", () => {
	test("groups models by prefix and sorts models in descending natural order", () => {
		expect(
			groupModelIds([
				"gpt-5.3-codex",
				"gpt-5.5",
				"claude-opus-4-6",
				"deepseek-v4-pro",
			]),
		).toEqual([
			{ prefix: "claude", models: ["claude-opus-4-6"] },
			{ prefix: "deepseek", models: ["deepseek-v4-pro"] },
			{ prefix: "gpt", models: ["gpt-5.5", "gpt-5.3-codex"] },
		]);
	});

	test("trims empty values and removes duplicate model IDs", () => {
		expect(groupModelIds([" gpt-5.5 ", "", "gpt-5.5"])).toEqual([
			{ prefix: "gpt", models: ["gpt-5.5"] },
		]);
	});
});
