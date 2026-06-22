import { stripEmbeddedFilePayloads } from "../userMessageDisplay";

export interface MergeableChatMessage {
	id?: string | null;
	role: string;
	content: Array<{
		type: string;
		text?: string;
	}>;
	createdAt?: Date | string | null;
}

const optimisticMessageIdPrefix = "mobile-";
const equivalentMessageWindowMs = 5 * 60 * 1000;

function isUserOriginatedRole(role: string): boolean {
	return role === "user" || role === "signal";
}

function messageTime(message: MergeableChatMessage): number | null {
	if (!message.createdAt) return null;
	const time = new Date(message.createdAt).getTime();
	return Number.isNaN(time) ? null : time;
}

function userTextSignature(message: MergeableChatMessage): string | null {
	if (!isUserOriginatedRole(message.role)) return null;
	const text = message.content
		.map((part) => (part.type === "text" && part.text ? part.text : ""))
		.join("\n")
		.trim();
	const displayText = stripEmbeddedFilePayloads(text);
	return displayText.length > 0 ? displayText : null;
}

function isOptimisticUserMessage(message: MergeableChatMessage): boolean {
	return (
		isUserOriginatedRole(message.role) &&
		typeof message.id === "string" &&
		message.id.startsWith(optimisticMessageIdPrefix)
	);
}

function isEquivalentUserMessage(
	serverMessage: MergeableChatMessage,
	optimisticMessage: MergeableChatMessage,
): boolean {
	if (
		serverMessage.id &&
		optimisticMessage.id &&
		serverMessage.id === optimisticMessage.id
	) {
		return true;
	}

	const serverText = userTextSignature(serverMessage);
	const optimisticText = userTextSignature(optimisticMessage);
	if (!serverText || !optimisticText || serverText !== optimisticText) {
		return false;
	}

	const serverTime = messageTime(serverMessage);
	const optimisticTime = messageTime(optimisticMessage);
	if (serverTime === null || optimisticTime === null) {
		return true;
	}

	return serverTime >= optimisticTime - equivalentMessageWindowMs;
}

function insertByCreatedAt<T extends MergeableChatMessage>(
	messages: T[],
	message: T,
): T[] {
	const messageCreatedAt = messageTime(message);
	if (messageCreatedAt === null) return [...messages, message];

	const insertIndex = messages.findIndex((existingMessage) => {
		const existingCreatedAt = messageTime(existingMessage);
		return existingCreatedAt !== null && existingCreatedAt > messageCreatedAt;
	});

	if (insertIndex === -1) return [...messages, message];
	return [
		...messages.slice(0, insertIndex),
		message,
		...messages.slice(insertIndex),
	];
}

export function mergeSnapshotMessagesWithPending<
	T extends MergeableChatMessage,
>({
	snapshotMessages,
	currentMessages,
}: {
	snapshotMessages: T[];
	currentMessages: T[];
}): T[] {
	const unmatchedOptimisticMessages = currentMessages.filter(
		isOptimisticUserMessage,
	);
	if (unmatchedOptimisticMessages.length === 0) return snapshotMessages;

	for (const snapshotMessage of snapshotMessages) {
		const matchIndex = unmatchedOptimisticMessages.findIndex(
			(optimisticMessage) =>
				isEquivalentUserMessage(snapshotMessage, optimisticMessage),
		);
		if (matchIndex >= 0) {
			unmatchedOptimisticMessages.splice(matchIndex, 1);
		}
	}

	if (unmatchedOptimisticMessages.length === 0) return snapshotMessages;
	return unmatchedOptimisticMessages.reduce(
		(mergedMessages, optimisticMessage) =>
			insertByCreatedAt(mergedMessages, optimisticMessage),
		[...snapshotMessages],
	);
}
