import { describe, expect, it } from "bun:test";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChatRuntimeServiceRouter } from "../../../server/trpc";
import {
	findLatestAssistantErrorMessage,
	mergeRetainedAbortedMessages,
	toRetainedAbortedMessage,
	withoutActiveTurnAssistantHistory,
} from "./use-chat-display";

type RouterOutputs = inferRouterOutputs<ChatRuntimeServiceRouter>;
type SessionOutputs = RouterOutputs["session"];
type ListMessagesOutput = SessionOutputs["listMessages"];
type DisplayStateOutput = SessionOutputs["getDisplayState"];

function userMessage(id: string, text: string): ListMessagesOutput[number] {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function userMessageAt(
	id: string,
	text: string,
	createdAt: string,
): ListMessagesOutput[number] {
	return {
		...userMessage(id, text),
		createdAt: new Date(createdAt),
	} as unknown as ListMessagesOutput[number];
}

function assistantMessage(
	id: string,
	text: string,
): ListMessagesOutput[number] {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function assistantMessageAt(
	id: string,
	text: string,
	createdAt: string,
): ListMessagesOutput[number] {
	return {
		...assistantMessage(id, text),
		createdAt: new Date(createdAt),
	} as unknown as ListMessagesOutput[number];
}

function asCurrentMessage(
	message: ListMessagesOutput[number],
): DisplayStateOutput["currentMessage"] {
	return message as unknown as DisplayStateOutput["currentMessage"];
}

describe("withoutActiveTurnAssistantHistory", () => {
	it("drops active-turn assistant history while streaming an assistant currentMessage", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [
				userMessage("u_1", "edit readme"),
				assistantMessage("a_hist", "Let me start by reading..."),
			],
			currentMessage: asCurrentMessage(
				assistantMessage("a_current", "\n\nLet me start by reading..."),
			),
			isRunning: true,
		});

		expect(messages.map((message) => message.id)).toEqual(["u_1"]);
	});

	it("preserves completed turns and only removes assistant messages in the active turn", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [
				userMessage("u_1", "first"),
				assistantMessage("a_1", "done"),
				userMessage("u_2", "second"),
				assistantMessage("a_2", "in-progress"),
			],
			currentMessage: asCurrentMessage(
				assistantMessage("a_current", "new stream"),
			),
			isRunning: true,
		});

		expect(messages.map((message) => message.id)).toEqual([
			"u_1",
			"a_1",
			"u_2",
		]);
	});

	it("does not change messages when not running", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [userMessage("u_1", "hello"), assistantMessage("a_1", "hi")],
			currentMessage: asCurrentMessage(assistantMessage("a_current", "stream")),
			isRunning: false,
		});

		expect(messages.map((message) => message.id)).toEqual(["u_1", "a_1"]);
	});
});

describe("findLatestAssistantErrorMessage", () => {
	it("returns latest assistant error when the latest assistant message is an error", () => {
		const error = findLatestAssistantErrorMessage([
			userMessage("u_1", "first"),
			{
				...assistantMessage("a_1", "older error"),
				stopReason: "error",
				errorMessage: "older error",
			} as unknown as ListMessagesOutput[number],
			{
				...assistantMessage("a_2", "latest error"),
				stopReason: "error",
				errorMessage: "latest error",
			} as unknown as ListMessagesOutput[number],
		]);

		expect(error).toBe("latest error");
	});

	it("does not surface stale assistant error after a later successful assistant message", () => {
		const error = findLatestAssistantErrorMessage([
			userMessage("u_1", "first"),
			{
				...assistantMessage("a_1", "older error"),
				stopReason: "error",
				errorMessage: "older error",
			} as unknown as ListMessagesOutput[number],
			{
				...assistantMessage("a_2", "latest success"),
				stopReason: "stop",
			} as unknown as ListMessagesOutput[number],
		]);

		expect(error).toBeNull();
	});
});

describe("retained aborted messages", () => {
	it("keeps an interrupted assistant turn ordered before a later user message", () => {
		const retained = toRetainedAbortedMessage(
			asCurrentMessage(
				assistantMessageAt(
					"a_interrupted",
					"partial answer",
					"2026-02-26T00:00:01.000Z",
				),
			),
		);
		expect(retained).not.toBeNull();

		const merged = mergeRetainedAbortedMessages(
			[
				userMessageAt("u_1", "first", "2026-02-26T00:00:00.000Z"),
				userMessageAt("u_2", "next", "2026-02-26T00:00:02.000Z"),
			],
			[retained as ListMessagesOutput[number]],
		);

		expect(merged.map((message) => message.id)).toEqual([
			"u_1",
			"a_interrupted",
			"u_2",
		]);
		expect(merged[1]).toMatchObject({
			role: "assistant",
			stopReason: "aborted",
			content: [{ type: "text", text: "partial answer" }],
		});
	});

	it("does not duplicate a retained turn already present in history", () => {
		const retained = {
			...assistantMessage("a_interrupted", "partial answer"),
			stopReason: "aborted",
		} as unknown as ListMessagesOutput[number];

		const merged = mergeRetainedAbortedMessages(
			[userMessage("u_1", "first"), retained],
			[retained],
		);

		expect(merged.map((message) => message.id)).toEqual([
			"u_1",
			"a_interrupted",
		]);
	});
});
