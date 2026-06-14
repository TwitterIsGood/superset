import { describe, expect, test } from "bun:test";
import {
	type CopyableChatTitleMessage,
	getFirstUserMessageTitleFallback,
	resolveCopyableChatTitle,
	toSessionTitle,
} from "./resolveCopyableChatTitle";

function userText(text: string): CopyableChatTitleMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
	};
}

describe("resolveCopyableChatTitle", () => {
	test("uses a non-empty custom title directly", () => {
		expect(
			resolveCopyableChatTitle({
				title: "  Investigate build failure  ",
				messages: [userText("fallback")],
			}),
		).toBe("Investigate build failure");
	});

	test("uses the first user message when the title is empty", () => {
		expect(
			resolveCopyableChatTitle({
				title: " ",
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "Ignore me" }] },
					userText("Summarize the failing desktop tests"),
				],
			}),
		).toBe("Summarize the failing desktop");
	});

	test("uses the first user message when the title is New Chat", () => {
		expect(
			resolveCopyableChatTitle({
				title: "New Chat",
				messages: [userText("请帮我看一下这个报错并给出修复建议")],
			}),
		).toBe("请帮我看一下这个报错并给出修复建议");
	});

	test("truncates fallback titles to 30 unicode characters", () => {
		expect(
			getFirstUserMessageTitleFallback([
				userText(
					"一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十尾部",
				),
			]),
		).toBe("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
	});

	test("falls back to the display title when no user message text exists", () => {
		expect(
			resolveCopyableChatTitle({
				title: null,
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "Nope" }] },
				],
			}),
		).toBe("New Chat");
	});
});

describe("toSessionTitle", () => {
	test("normalizes blank titles to New Chat", () => {
		expect(toSessionTitle(null)).toBe("New Chat");
		expect(toSessionTitle(" ")).toBe("New Chat");
	});
});
