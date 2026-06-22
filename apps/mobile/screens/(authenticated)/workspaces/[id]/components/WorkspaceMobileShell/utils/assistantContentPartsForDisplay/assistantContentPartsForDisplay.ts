export type AssistantToolDisplayState = "running" | "done";

export type AssistantDisplayPartWithToolState<
	T extends { type: string; id?: string },
> = T & {
	mobileToolDisplayState?: AssistantToolDisplayState;
};

interface AssistantContentDisplayOptions {
	allowPendingToolCalls: boolean;
}

function stringField(
	part: { type: string; id?: string },
	field: string,
): string | null {
	const record = part as Record<string, unknown>;
	const value = record[field];
	return typeof value === "string" ? value : null;
}

function isSettlingAssistantPart(part: { type: string }): boolean {
	return (
		part.type === "text" ||
		part.type === "reasoning" ||
		part.type === "thinking"
	);
}

export function assistantContentPartsForDisplay<
	T extends { type: string; id?: string },
>(
	parts: T[],
	options: AssistantContentDisplayOptions,
): AssistantDisplayPartWithToolState<T>[] {
	const resolvedToolCallIds = new Set(
		parts
			.filter((part) => part.type === "tool_result")
			.map((part) => part.id)
			.filter((id): id is string => Boolean(id?.trim())),
	);
	const finishedProgressToolCallIds = new Set(
		parts
			.filter((part) => {
				if (part.type !== "tool_progress") return false;
				const status = stringField(part, "status");
				return (
					status === "completed" ||
					status === "failed" ||
					status === "cancelled"
				);
			})
			.map((part) => stringField(part, "toolCallId"))
			.filter((id): id is string => Boolean(id?.trim())),
	);

	return parts.flatMap((part, index) => {
		if (part.type !== "tool_call") {
			return [part as AssistantDisplayPartWithToolState<T>];
		}

		const id = part.id;
		if (id && resolvedToolCallIds.has(id)) return [];

		const hasLaterAssistantProgress = parts
			.slice(index + 1)
			.some(isSettlingAssistantPart);
		const isFinishedByProgress =
			typeof id === "string" && finishedProgressToolCallIds.has(id);
		const displayState =
			options.allowPendingToolCalls &&
			!hasLaterAssistantProgress &&
			!isFinishedByProgress
				? "running"
				: "done";

		return [
			{
				...part,
				mobileToolDisplayState: displayState,
			} as AssistantDisplayPartWithToolState<T>,
		];
	});
}
