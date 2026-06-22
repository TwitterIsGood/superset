import { describe, expect, it } from "bun:test";
import { getControlChatIntentFlags } from "./intent";

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
});
