import type { ControlChatMessageContent } from "@superset/db/schema";

export interface ControlChatTurnResult {
	content: ControlChatMessageContent[];
	status: "completed" | "failed";
	error: string | null;
}

export class ControlChatRunAbortedError extends Error {
	constructor() {
		super("Control Chat run was stopped by the user.");
		this.name = "ControlChatRunAbortedError";
	}
}

export function isControlChatRunAbortedStatus(
	status: string | null | undefined,
) {
	return status === "aborted";
}

export function resolveControlChatTurnStatus(args: {
	hasToolFailure: boolean;
	firstToolError: string | null;
}): Pick<ControlChatTurnResult, "status" | "error"> {
	if (args.hasToolFailure) {
		return {
			status: "failed",
			error: args.firstToolError ?? "One or more Control Chat tools failed.",
		};
	}
	return { status: "completed", error: null };
}
