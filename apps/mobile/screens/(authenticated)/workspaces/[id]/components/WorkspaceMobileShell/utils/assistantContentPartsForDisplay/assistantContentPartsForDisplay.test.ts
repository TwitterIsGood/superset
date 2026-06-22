/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { assistantContentPartsForDisplay } from "./assistantContentPartsForDisplay";

type TestPart =
	| { type: "tool_call"; id: string; name: string }
	| { type: "tool_result"; id: string; name: string }
	| { type: "tool_progress"; id: string; toolCallId: string; status?: string }
	| { type: "text"; text: string };

describe("assistantContentPartsForDisplay", () => {
	test("hides tool calls that have a matching result", () => {
		const parts: TestPart[] = [
			{ type: "tool_call", id: "search-1", name: "WebSearch" },
			{ type: "tool_result", id: "search-1", name: "WebSearch" },
		];

		expect(
			assistantContentPartsForDisplay(parts, {
				allowPendingToolCalls: false,
			}),
		).toEqual([{ type: "tool_result", id: "search-1", name: "WebSearch" }]);
	});

	test("settles orphan tool calls once later assistant text exists", () => {
		const parts: TestPart[] = [
			{ type: "tool_call", id: "search-1", name: "WebSearch" },
			{ type: "tool_call", id: "search-2", name: "WebSearch" },
			{ type: "text", text: "I cannot fetch current trends here." },
		];

		expect(
			assistantContentPartsForDisplay(parts, {
				allowPendingToolCalls: true,
			}),
		).toEqual([
			{
				type: "tool_call",
				id: "search-1",
				name: "WebSearch",
				mobileToolDisplayState: "done",
			},
			{
				type: "tool_call",
				id: "search-2",
				name: "WebSearch",
				mobileToolDisplayState: "done",
			},
			{ type: "text", text: "I cannot fetch current trends here." },
		]);
	});

	test("keeps unresolved trailing tool calls running while the message is active", () => {
		const parts: TestPart[] = [
			{ type: "tool_call", id: "search-1", name: "WebSearch" },
		];

		expect(
			assistantContentPartsForDisplay(parts, {
				allowPendingToolCalls: true,
			}),
		).toEqual([
			{
				type: "tool_call",
				id: "search-1",
				name: "WebSearch",
				mobileToolDisplayState: "running",
			},
		]);
	});

	test("settles unresolved tool calls on persisted messages", () => {
		const parts: TestPart[] = [
			{ type: "tool_call", id: "search-1", name: "WebSearch" },
		];

		expect(
			assistantContentPartsForDisplay(parts, {
				allowPendingToolCalls: false,
			}),
		).toEqual([
			{
				type: "tool_call",
				id: "search-1",
				name: "WebSearch",
				mobileToolDisplayState: "done",
			},
		]);
	});
});
