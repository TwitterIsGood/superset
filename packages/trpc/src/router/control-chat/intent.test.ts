import { describe, expect, it } from "bun:test";
import {
	getControlChatIntentFlags,
	hasControlChatListOrCountIntent,
} from "./intent";

describe("control chat intent detection", () => {
	it("recognizes plural capability requests", () => {
		expect(getControlChatIntentFlags("list capabilities")).toMatchObject({
			asksCapability: true,
			asksAutomation: false,
		});
	});

	it("recognizes Tools & Skills requests", () => {
		expect(getControlChatIntentFlags("show Tools & Skills")).toMatchObject({
			asksCapability: true,
		});
	});

	it("recognizes automation requests independently", () => {
		expect(getControlChatIntentFlags("list automations")).toMatchObject({
			asksAutomation: true,
			asksCapability: false,
		});
	});

	it("recognizes Chinese automation count requests as list/count intent", () => {
		expect(getControlChatIntentFlags("我现在有多少个定时任务啊")).toMatchObject(
			{
				asksAutomation: true,
			},
		);
		expect(hasControlChatListOrCountIntent("我现在有多少个定时任务啊")).toBe(
			true,
		);
		expect(hasControlChatListOrCountIntent("我现在有几个自动化任务")).toBe(
			true,
		);
	});

	it("recognizes English capability count requests as list/count intent", () => {
		expect(
			getControlChatIntentFlags("how many skills do I have"),
		).toMatchObject({
			asksCapability: true,
		});
		expect(hasControlChatListOrCountIntent("how many skills do I have")).toBe(
			true,
		);
		expect(hasControlChatListOrCountIntent("count tools")).toBe(true);
	});
});
