import { describe, expect, it } from "bun:test";
import {
	ControlChatRunAbortedError,
	isControlChatRunAbortedStatus,
	resolveControlChatTurnStatus,
} from "./runtime";

describe("control chat runtime status", () => {
	it("marks a turn failed when any tool failed", () => {
		expect(
			resolveControlChatTurnStatus({
				hasToolFailure: true,
				firstToolError: "Host not found",
			}),
		).toEqual({
			status: "failed",
			error: "Host not found",
		});
	});

	it("marks a turn completed when all tools succeeded", () => {
		expect(
			resolveControlChatTurnStatus({
				hasToolFailure: false,
				firstToolError: null,
			}),
		).toEqual({
			status: "completed",
			error: null,
		});
	});

	it("uses a typed abort error for stopped runs", () => {
		const error = new ControlChatRunAbortedError();
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("Control Chat run was stopped by the user.");
	});

	it("only treats aborted runs as stopped", () => {
		expect(isControlChatRunAbortedStatus("aborted")).toBe(true);
		expect(isControlChatRunAbortedStatus("running")).toBe(false);
		expect(isControlChatRunAbortedStatus("failed")).toBe(false);
		expect(isControlChatRunAbortedStatus(null)).toBe(false);
	});
});
