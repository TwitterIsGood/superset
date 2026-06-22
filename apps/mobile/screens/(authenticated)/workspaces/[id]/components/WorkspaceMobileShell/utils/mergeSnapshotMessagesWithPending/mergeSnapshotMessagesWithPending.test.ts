/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { mergeSnapshotMessagesWithPending } from "./mergeSnapshotMessagesWithPending";

const userTextMessage = ({
	id,
	text,
	createdAt,
}: {
	id: string;
	text: string;
	createdAt: string;
}) => ({
	id,
	role: "user",
	content: [{ type: "text", text }],
	createdAt,
});

const signalTextMessage = ({
	id,
	text,
	createdAt,
}: {
	id: string;
	text: string;
	createdAt: string;
}) => ({
	id,
	role: "signal",
	content: [{ type: "text", text }],
	createdAt,
});

const assistantTextMessage = ({
	id,
	text,
	createdAt,
}: {
	id: string;
	text: string;
	createdAt: string;
}) => ({
	id,
	role: "assistant",
	content: [{ type: "text", text }],
	createdAt,
});

describe("mergeSnapshotMessagesWithPending", () => {
	test("keeps an optimistic user message when the host snapshot is stale", () => {
		const merged = mergeSnapshotMessagesWithPending({
			snapshotMessages: [
				assistantTextMessage({
					id: "assistant-1",
					text: "Previous answer",
					createdAt: "2026-06-13T10:00:00Z",
				}),
			],
			currentMessages: [
				assistantTextMessage({
					id: "assistant-1",
					text: "Previous answer",
					createdAt: "2026-06-13T10:00:00Z",
				}),
				userTextMessage({
					id: "mobile-pending-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:00Z",
				}),
			],
		});

		expect(merged.map((message) => message.id)).toEqual([
			"assistant-1",
			"mobile-pending-1",
		]);
	});

	test("removes the optimistic message once the host snapshot includes it", () => {
		const merged = mergeSnapshotMessagesWithPending({
			snapshotMessages: [
				userTextMessage({
					id: "server-user-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:01Z",
				}),
				assistantTextMessage({
					id: "assistant-1",
					text: "Hello. What should we work on?",
					createdAt: "2026-06-13T10:01:02Z",
				}),
			],
			currentMessages: [
				userTextMessage({
					id: "mobile-pending-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:00Z",
				}),
			],
		});

		expect(merged.map((message) => message.id)).toEqual([
			"server-user-1",
			"assistant-1",
		]);
	});

	test("removes the optimistic message when the host snapshot appends file payloads", () => {
		const prompt = "请读取我上传的文件，回复 file upload ok。";
		const merged = mergeSnapshotMessagesWithPending({
			snapshotMessages: [
				userTextMessage({
					id: "server-user-1",
					text: [
						prompt,
						"",
						"[File: mobile-upload-ok.txt]",
						"```",
						"bW9iaWxlLXVwbG9hZC1vayBmcm9tIFN1cGVyc2V0",
						"```",
					].join("\n"),
					createdAt: "2026-06-13T10:01:01Z",
				}),
				assistantTextMessage({
					id: "assistant-1",
					text: "file upload ok",
					createdAt: "2026-06-13T10:01:02Z",
				}),
			],
			currentMessages: [
				userTextMessage({
					id: "mobile-pending-1",
					text: prompt,
					createdAt: "2026-06-13T10:01:00Z",
				}),
			],
		});

		expect(merged.map((message) => message.id)).toEqual([
			"server-user-1",
			"assistant-1",
		]);
	});

	test("removes the optimistic message once the host snapshot includes a signal role user turn", () => {
		const merged = mergeSnapshotMessagesWithPending({
			snapshotMessages: [
				signalTextMessage({
					id: "server-signal-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:01Z",
				}),
				assistantTextMessage({
					id: "assistant-1",
					text: "Hello. What should we work on?",
					createdAt: "2026-06-13T10:01:02Z",
				}),
			],
			currentMessages: [
				userTextMessage({
					id: "mobile-pending-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:00Z",
				}),
			],
		});

		expect(merged.map((message) => message.id)).toEqual([
			"server-signal-1",
			"assistant-1",
		]);
	});

	test("keeps duplicate pending sends until matching server rows arrive", () => {
		const merged = mergeSnapshotMessagesWithPending({
			snapshotMessages: [
				userTextMessage({
					id: "server-user-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:01Z",
				}),
			],
			currentMessages: [
				userTextMessage({
					id: "mobile-pending-1",
					text: "Hello",
					createdAt: "2026-06-13T10:01:00Z",
				}),
				userTextMessage({
					id: "mobile-pending-2",
					text: "Hello",
					createdAt: "2026-06-13T10:01:03Z",
				}),
			],
		});

		expect(merged.map((message) => message.id)).toEqual([
			"server-user-1",
			"mobile-pending-2",
		]);
	});
});
