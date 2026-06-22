import { describe, expect, it } from "bun:test";
import { isChatAbortError, toSendFailureMessage } from "./sendMessage";

describe("toSendFailureMessage", () => {
	it("maps auth failures when status is 401/403", () => {
		expect(toSendFailureMessage({ status: 401 })).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
		expect(toSendFailureMessage({ response: { status: 403 } })).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
	});

	it("keeps backend message when status is not auth-related", () => {
		expect(
			toSendFailureMessage(
				new Error("Unauthorized model provider token, please reconnect OAuth"),
			),
		).toBe("Unauthorized model provider token, please reconnect OAuth");
	});
});

describe("isChatAbortError", () => {
	it("matches user-initiated abort errors", () => {
		expect(isChatAbortError(new Error("Chat request was aborted."))).toBe(true);
		expect(isChatAbortError(new Error("Request was aborted."))).toBe(true);
	});

	it("does not match regular send failures", () => {
		expect(isChatAbortError(new Error("A response is already running."))).toBe(
			false,
		);
		expect(isChatAbortError(new Error("Provider returned HTTP 500"))).toBe(
			false,
		);
	});
});
