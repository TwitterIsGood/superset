const DEFAULT_CHAT_TITLE = "New Chat";
const FALLBACK_TITLE_CHARACTER_LIMIT = 30;

export interface CopyableChatTitleMessagePart {
	type: string;
	text?: string;
	filename?: string | null;
}

export interface CopyableChatTitleMessage {
	role: string;
	content: readonly CopyableChatTitleMessagePart[];
}

export function toSessionTitle(title: string | null | undefined): string {
	const trimmed = title?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CHAT_TITLE;
}

export function shouldUseMessageTitleFallback(title: string): boolean {
	const trimmed = title.trim();
	return trimmed.length === 0 || trimmed === DEFAULT_CHAT_TITLE;
}

export function textFromMessageContent(
	content: readonly CopyableChatTitleMessagePart[],
) {
	return content
		.map((part) => {
			if (part.type === "text") return part.text ?? "";
			if (part.type === "file") {
				return part.filename ? `[File: ${part.filename}]` : "[File]";
			}
			if (part.type === "image") return "[Image]";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

export function getFirstUserMessageTitleFallback(
	messages: readonly CopyableChatTitleMessage[],
) {
	const firstUserMessage = messages.find((message) => message.role === "user");
	if (!firstUserMessage) return null;

	const normalizedText = textFromMessageContent(firstUserMessage.content)
		.replace(/\s+/g, " ")
		.trim();
	if (!normalizedText) return null;

	return Array.from(normalizedText)
		.slice(0, FALLBACK_TITLE_CHARACTER_LIMIT)
		.join("")
		.trimEnd();
}

export function resolveCopyableChatTitle({
	title,
	messages,
}: {
	title: string | null | undefined;
	messages?: readonly CopyableChatTitleMessage[];
}) {
	const sessionTitle = toSessionTitle(title);
	if (!shouldUseMessageTitleFallback(sessionTitle)) return sessionTitle;

	return messages
		? (getFirstUserMessageTitleFallback(messages) ?? sessionTitle)
		: sessionTitle;
}
