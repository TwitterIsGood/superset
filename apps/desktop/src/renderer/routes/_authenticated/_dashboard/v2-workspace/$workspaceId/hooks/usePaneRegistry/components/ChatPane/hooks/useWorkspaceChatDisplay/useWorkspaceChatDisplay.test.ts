import { describe, expect, it } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import {
	getRetainedAbortedMessagesForScope,
	getRetainedAbortedMessagesScopeKey,
	withRetainedAbortedMessageForScope,
} from "./useWorkspaceChatDisplay";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ChatOutputs = RouterOutputs["chat"];
type ListMessagesOutput = ChatOutputs["getSnapshot"]["messages"];

function userMessage(id: string, text: string): ListMessagesOutput[number] {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
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
		createdAt: new Date("2026-02-26T00:00:01.000Z"),
		stopReason: "aborted",
	} as unknown as ListMessagesOutput[number];
}

describe("workspace retained aborted messages", () => {
	it("keeps retained stopped output isolated by session and workspace when switching sessions", () => {
		const retained = assistantMessage(
			"a_interrupted",
			"partial answer from workspace A",
		);
		const scopeA = getRetainedAbortedMessagesScopeKey({
			sessionId: "session-a",
			workspaceId: "workspace-a",
		});
		const sessionB = getRetainedAbortedMessagesScopeKey({
			sessionId: "session-b",
			workspaceId: "workspace-a",
		});
		const sameSessionDifferentWorkspace = getRetainedAbortedMessagesScopeKey({
			sessionId: "session-a",
			workspaceId: "workspace-b",
		});

		const retainedByScope = withRetainedAbortedMessageForScope(
			{},
			scopeA,
			retained,
		);

		expect(
			[
				userMessage("u_b", "session B prompt"),
				...getRetainedAbortedMessagesForScope(retainedByScope, sessionB),
			].map((message) => message.id),
		).toEqual(["u_b"]);
		expect(
			[
				userMessage("u_workspace", "same session in another workspace"),
				...getRetainedAbortedMessagesForScope(
					retainedByScope,
					sameSessionDifferentWorkspace,
				),
			].map((message) => message.id),
		).toEqual(["u_workspace"]);
		expect(
			[
				userMessage("u_a", "workspace A prompt"),
				...getRetainedAbortedMessagesForScope(retainedByScope, scopeA),
			].map((message) => message.id),
		).toEqual(["u_a", "a_interrupted"]);
	});
});
