import { describe, expect, test } from "bun:test";
import {
	addModelId,
	formatProxyUrlForDisplay,
	normalizeModelIds,
	removeModelId,
} from "./utils";

describe("model ID form helpers", () => {
	test("normalizes model IDs by trimming empty values and duplicates", () => {
		expect(normalizeModelIds([" gpt-5.5 ", "", "gpt-5.5"])).toEqual([
			"gpt-5.5",
		]);
	});

	test("adds non-empty unique model IDs", () => {
		expect(addModelId(["gpt-5.5"], " gpt-5.3-codex ")).toEqual([
			"gpt-5.5",
			"gpt-5.3-codex",
		]);
		expect(addModelId(["gpt-5.5"], "gpt-5.5")).toEqual(["gpt-5.5"]);
		expect(addModelId(["gpt-5.5"], " ")).toEqual(["gpt-5.5"]);
	});

	test("removes a matching model ID", () => {
		expect(removeModelId(["gpt-5.5", "claude-sonnet-4-6"], "gpt-5.5")).toEqual([
			"claude-sonnet-4-6",
		]);
	});
});

describe("proxy display helpers", () => {
	test("redacts proxy URL passwords", () => {
		expect(formatProxyUrlForDisplay("http://user:secret@127.0.0.1:7890")).toBe(
			"http://user:***@127.0.0.1:7890/",
		);
	});

	test("preserves invalid proxy URL text", () => {
		expect(formatProxyUrlForDisplay("not a url")).toBe("not a url");
	});
});
