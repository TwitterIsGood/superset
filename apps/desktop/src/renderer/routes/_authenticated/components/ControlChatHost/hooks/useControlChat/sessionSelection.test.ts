import { describe, expect, it } from "bun:test";
import { shouldAutoSelectControlChatSession } from "./sessionSelection";

describe("Control Chat session selection", () => {
	it("auto-selects existing sessions on initial load only", () => {
		expect(
			shouldAutoSelectControlChatSession({
				activeSessionId: null,
				isCreatingNewSession: false,
				sessionCount: 1,
			}),
		).toBe(true);
	});

	it("does not auto-select when user explicitly starts a new chat", () => {
		expect(
			shouldAutoSelectControlChatSession({
				activeSessionId: null,
				isCreatingNewSession: true,
				sessionCount: 1,
			}),
		).toBe(false);
	});

	it("does not auto-select when a session is already selected", () => {
		expect(
			shouldAutoSelectControlChatSession({
				activeSessionId: "11111111-1111-4111-8111-111111111111",
				isCreatingNewSession: false,
				sessionCount: 1,
			}),
		).toBe(false);
	});
});
