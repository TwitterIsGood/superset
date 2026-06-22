import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatRuntimeServiceRouter } from "../../../server/trpc";
import { chatRuntimeServiceTrpc } from "../../provider";

type RouterInputs = inferRouterInputs<ChatRuntimeServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatRuntimeServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
type ListMessagesOutput = SessionOutputs["listMessages"];
type HistoryMessage = ListMessagesOutput[number];
type HistoryMessagePart = HistoryMessage["content"][number];
type HistoryMessageContent = HistoryMessagePart[];
type CurrentMessage = DisplayStateOutput["currentMessage"];

export type ChatDisplayState = DisplayStateOutput;
export type ChatHistoryMessages = ListMessagesOutput;

export interface UseChatDisplayOptions {
	sessionId: string | null;
	cwd?: string;
	enabled?: boolean;
	fps?: number;
}

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

function findLastUserMessageIndex(messages: ListMessagesOutput): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		// INVARIANT: optimistic user messages use the "optimistic-" ID prefix
		// (both the use-chat-display internal channel and the ChatPaneInterface
		// setData injection). Skipping them here keeps the turn-boundary anchored
		// to the real committed user message so withoutActiveTurnAssistantHistory
		// can dedupe the in-flight assistant message — see SUPER-753.
		if (message?.role === "user" && !message.id?.startsWith("optimistic-")) {
			return index;
		}
	}
	return -1;
}

export function findLatestAssistantErrorMessage(
	messages: ListMessagesOutput,
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as {
			role?: string;
			stopReason?: string;
			errorMessage?: string;
		};
		if (message.role !== "assistant") continue;
		if (message.stopReason !== undefined && message.stopReason !== "error") {
			return null;
		}
		if (
			typeof message.errorMessage === "string" &&
			message.errorMessage.trim().length > 0
		) {
			return message.errorMessage.trim();
		}
		return null;
	}
	return null;
}

export function withoutActiveTurnAssistantHistory({
	messages,
	currentMessage,
	isRunning,
}: {
	messages: ListMessagesOutput;
	currentMessage: DisplayStateOutput["currentMessage"] | null;
	isRunning: boolean;
}): ListMessagesOutput {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}

	const turnStartIndex = findLastUserMessageIndex(messages) + 1;
	const previousTurns = messages.slice(0, turnStartIndex);
	const activeTurnMessages = messages.slice(turnStartIndex);

	// Keep a historical assistant message only when it is both:
	//   1. Fully completed (has a stopReason) — a completed prior phase such as
	//      the read-file + ask_user message before a question answer.
	//   2. Not the message currently being streamed (different id from currentMessage)
	//      — guards the brief transition window where the same message is committed
	//      to history while currentMessage still references it.
	const currentMessageId = (currentMessage as { id?: string }).id;
	const deduped = activeTurnMessages.filter((message: HistoryMessage) => {
		if (message.role !== "assistant") return true;
		const stopReason = (message as unknown as { stopReason?: string })
			.stopReason;
		const messageId = (message as unknown as { id?: string }).id;
		return !!stopReason && messageId !== currentMessageId;
	});

	return [...previousTurns, ...deduped];
}

function hasFileOrImagePart(message: HistoryMessage): boolean {
	return message.content.some(
		(part: HistoryMessagePart) =>
			(part as Record<string, unknown>).type === "file" ||
			part.type === "image",
	);
}

function countFileMessages(messages: ListMessagesOutput): number {
	return messages.filter(
		(message: HistoryMessage) =>
			message.role === "user" && hasFileOrImagePart(message),
	).length;
}

function toMessageTimestamp(message: { createdAt?: unknown }): number {
	const value = message.createdAt;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "string" || typeof value === "number") {
		const timestamp = new Date(value).getTime();
		if (Number.isFinite(timestamp)) return timestamp;
	}
	return 0;
}

function getMessageContentSignature(message: {
	role?: string;
	content?: unknown;
}): string | null {
	if (message.role !== "assistant") return null;
	if (!Array.isArray(message.content) || message.content.length === 0) {
		return null;
	}
	return JSON.stringify(message.content);
}

export function mergeRetainedAbortedMessages(
	messages: ListMessagesOutput,
	retainedMessages: ListMessagesOutput,
): ListMessagesOutput {
	if (retainedMessages.length === 0) return messages;

	const merged = [...messages];
	for (const retainedMessage of retainedMessages) {
		const retainedSignature = getMessageContentSignature(retainedMessage);
		if (!retainedSignature) continue;
		const alreadyPresent = merged.some(
			(message) =>
				message.id === retainedMessage.id ||
				getMessageContentSignature(message) === retainedSignature,
		);
		if (alreadyPresent) continue;

		const retainedTimestamp = toMessageTimestamp(retainedMessage);
		const insertIndex = merged.findIndex(
			(message) => toMessageTimestamp(message) > retainedTimestamp,
		);
		if (insertIndex === -1) {
			merged.push(retainedMessage);
		} else {
			merged.splice(insertIndex, 0, retainedMessage);
		}
	}

	return merged as ListMessagesOutput;
}

export function toRetainedAbortedMessage(
	currentMessage: CurrentMessage | null,
): HistoryMessage | null {
	if (!currentMessage || currentMessage.role !== "assistant") return null;
	if (currentMessage.content.length === 0) return null;

	const retainedMessage = {
		...currentMessage,
		stopReason: "aborted",
	} as HistoryMessage & { errorMessage?: string | null };
	delete retainedMessage.errorMessage;
	return retainedMessage;
}

function getLegacyImagePayload(
	payload: SessionInputs["sendMessage"]["payload"],
): Array<{ data: string; mimeType: string }> {
	const images = (payload as { images?: unknown }).images;
	if (!Array.isArray(images)) return [];
	return images.flatMap((image) => {
		const record = image as { data?: unknown; mimeType?: unknown };
		return typeof record.data === "string" &&
			typeof record.mimeType === "string"
			? [{ data: record.data, mimeType: record.mimeType }]
			: [];
	});
}

export function useChatDisplay(options: UseChatDisplayOptions) {
	const { sessionId, cwd, enabled = true, fps = 4 } = options;
	const utils = chatRuntimeServiceTrpc.useUtils();
	const [commandError, setCommandError] = useState<unknown>(null);
	const [retainedAbortedMessages, setRetainedAbortedMessages] =
		useState<ListMessagesOutput>([]);
	const sessionCommandInput =
		sessionId === null ? null : { sessionId, ...(cwd ? { cwd } : {}) };
	const queryInput = sessionCommandInput ?? skipToken;
	const isQueryEnabled = enabled && Boolean(sessionId);
	const refetchIntervalMs = toRefetchIntervalMs(fps);
	const displayQueryOptions = {
		enabled: isQueryEnabled,
		refetchInterval: refetchIntervalMs,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: false,
	} as const;

	const displayQuery = chatRuntimeServiceTrpc.session.getDisplayState.useQuery(
		queryInput,
		displayQueryOptions,
	);

	const displayState = sessionId ? (displayQuery.data ?? null) : null;
	const displayStateFields = displayState as
		| (DisplayStateOutput & {
				activeTools?: Map<string, unknown>;
				toolInputBuffers?: Map<string, unknown>;
				activeSubagents?: Map<string, unknown>;
				pendingApproval?: unknown;
				pendingPlanApproval?: unknown;
				pendingQuestion?: unknown;
		  })
		| null;
	const runtimeErrorMessage =
		typeof displayState?.errorMessage === "string" &&
		displayState.errorMessage.trim()
			? displayState.errorMessage
			: null;
	const currentMessage = displayState?.currentMessage ?? null;
	const isRunning = displayState?.isRunning ?? false;
	const messagesQuery = chatRuntimeServiceTrpc.session.listMessages.useQuery(
		queryInput,
		{
			enabled: isQueryEnabled,
			refetchInterval: isRunning ? Math.max(1000, refetchIntervalMs) : false,
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: false,
			staleTime: 2000,
		},
	);
	const queryError = displayQuery.error ?? messagesQuery.error ?? null;
	const isConversationLoading =
		isQueryEnabled &&
		!queryError &&
		messagesQuery.data === undefined &&
		messagesQuery.isLoading;
	const historicalMessages = sessionId ? (messagesQuery.data ?? []) : [];
	const retainedHistoricalMessages = useMemo(
		() =>
			mergeRetainedAbortedMessages(historicalMessages, retainedAbortedMessages),
		[historicalMessages, retainedAbortedMessages],
	);
	const latestAssistantErrorMessage = isRunning
		? null
		: findLatestAssistantErrorMessage(retainedHistoricalMessages);
	const [optimisticUserMessage, setOptimisticUserMessage] = useState<
		ListMessagesOutput[number] | null
	>(null);
	const optimisticTextRef = useRef<string | null>(null);
	const optimisticIdRef = useRef<string | null>(null);
	const fileMessageCountAtSendRef = useRef<number | null>(null);

	useEffect(() => {
		if (!optimisticIdRef.current) return;

		const optimisticText = optimisticTextRef.current;

		const found = optimisticText
			? retainedHistoricalMessages.some(
					(message: HistoryMessage) =>
						message.role === "user" &&
						message.content.some(
							(part: HistoryMessagePart) =>
								part.type === "text" &&
								"text" in part &&
								part.text === optimisticText,
						),
				)
			: (() => {
					const currentFileMessageCount = countFileMessages(
						retainedHistoricalMessages,
					);
					return (
						fileMessageCountAtSendRef.current !== null &&
						currentFileMessageCount > fileMessageCountAtSendRef.current
					);
				})();
		if (!found) return;

		setOptimisticUserMessage(null);
		optimisticTextRef.current = null;
		optimisticIdRef.current = null;
		fileMessageCountAtSendRef.current = null;
	}, [retainedHistoricalMessages]);

	useEffect(() => {
		setRetainedAbortedMessages([]);
	}, []);

	const messages = useMemo(() => {
		const withOptimistic = optimisticUserMessage
			? [...retainedHistoricalMessages, optimisticUserMessage]
			: retainedHistoricalMessages;
		return withoutActiveTurnAssistantHistory({
			messages: withOptimistic,
			currentMessage,
			isRunning,
		});
	}, [
		retainedHistoricalMessages,
		optimisticUserMessage,
		currentMessage,
		isRunning,
	]);

	const commands = useMemo(
		() => ({
			sendMessage: async (
				input: Omit<SessionInputs["sendMessage"], "sessionId">,
			) => {
				if (!sessionId) {
					const error = new Error(
						"Chat session is still starting. Please retry in a moment.",
					);
					setCommandError(error);
					throw error;
				}
				setCommandError(null);
				const activeSessionInput = {
					sessionId,
					...(cwd ? { cwd } : {}),
				};

				const text =
					typeof input.payload?.content === "string"
						? input.payload.content
						: "";
				const files = input.payload?.files ?? [];
				const legacyImages = getLegacyImagePayload(input.payload);
				if (text || files.length > 0 || legacyImages.length > 0) {
					const optimisticId = `optimistic-${Date.now()}`;
					optimisticTextRef.current = text || null;
					optimisticIdRef.current = optimisticId;
					if (!text) {
						fileMessageCountAtSendRef.current = countFileMessages(
							retainedHistoricalMessages,
						);
					}
					const content: HistoryMessageContent = [];
					for (const file of files) {
						content.push({
							type: "file",
							data: file.data,
							mediaType: file.mediaType,
							filename: file.filename,
						} as HistoryMessagePart);
					}
					for (const image of legacyImages) {
						content.push({
							type: "image",
							data: image.data,
							mimeType: image.mimeType,
						} as HistoryMessagePart);
					}
					if (text) {
						content.push({
							type: "text",
							text,
						} as HistoryMessagePart);
					}
					setOptimisticUserMessage({
						id: optimisticId,
						role: "user",
						content,
						createdAt: new Date(),
					} as ListMessagesOutput[number]);
				}

				try {
					const result = await utils.client.session.sendMessage.mutate({
						...activeSessionInput,
						...input,
					});
					const [nextMessages, nextDisplayState] = await Promise.all([
						utils.client.session.listMessages.query(activeSessionInput),
						utils.client.session.getDisplayState.query(activeSessionInput),
					]);
					utils.session.listMessages.setData(activeSessionInput, nextMessages);
					utils.session.getDisplayState.setData(
						activeSessionInput,
						nextDisplayState,
					);
					return result;
				} catch (error) {
					setCommandError(error);
					setOptimisticUserMessage(null);
					optimisticTextRef.current = null;
					optimisticIdRef.current = null;
					fileMessageCountAtSendRef.current = null;
					throw error;
				}
			},
			stop: async () => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				const retainedMessage = toRetainedAbortedMessage(currentMessage);
				const nextRetainedMessages = retainedMessage
					? mergeRetainedAbortedMessages(retainedAbortedMessages, [
							retainedMessage,
						] as ListMessagesOutput)
					: retainedAbortedMessages;
				if (retainedMessage) {
					setRetainedAbortedMessages(nextRetainedMessages);
				}
				try {
					const result =
						await utils.client.session.stop.mutate(sessionCommandInput);
					const [nextMessages, nextDisplayState] = await Promise.all([
						utils.client.session.listMessages.query(sessionCommandInput),
						utils.client.session.getDisplayState.query(sessionCommandInput),
					]);
					utils.session.listMessages.setData(
						sessionCommandInput,
						mergeRetainedAbortedMessages(nextMessages, nextRetainedMessages),
					);
					utils.session.getDisplayState.setData(
						sessionCommandInput,
						nextDisplayState,
					);
					return result;
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				const retainedMessage = toRetainedAbortedMessage(currentMessage);
				const nextRetainedMessages = retainedMessage
					? mergeRetainedAbortedMessages(retainedAbortedMessages, [
							retainedMessage,
						] as ListMessagesOutput)
					: retainedAbortedMessages;
				if (retainedMessage) {
					setRetainedAbortedMessages(nextRetainedMessages);
				}
				try {
					const result =
						await utils.client.session.abort.mutate(sessionCommandInput);
					const [nextMessages, nextDisplayState] = await Promise.all([
						utils.client.session.listMessages.query(sessionCommandInput),
						utils.client.session.getDisplayState.query(sessionCommandInput),
					]);
					utils.session.listMessages.setData(
						sessionCommandInput,
						mergeRetainedAbortedMessages(nextMessages, nextRetainedMessages),
					);
					utils.session.getDisplayState.setData(
						sessionCommandInput,
						nextDisplayState,
					);
					return result;
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToApproval: async (
				input: Omit<SessionInputs["approval"]["respond"], "sessionId">,
			) => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.approval.respond.mutate({
						...sessionCommandInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToQuestion: async (
				input: Omit<SessionInputs["question"]["respond"], "sessionId">,
			) => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.question.respond.mutate({
						...sessionCommandInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToPlan: async (
				input: Omit<SessionInputs["plan"]["respond"], "sessionId">,
			) => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.plan.respond.mutate({
						...sessionCommandInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[
			cwd,
			currentMessage,
			retainedAbortedMessages,
			retainedHistoricalMessages,
			sessionCommandInput,
			sessionId,
			utils,
		],
	);

	return {
		...displayState,
		currentMessage,
		isRunning,
		activeTools: displayStateFields?.activeTools,
		toolInputBuffers: displayStateFields?.toolInputBuffers,
		activeSubagents: displayStateFields?.activeSubagents,
		pendingApproval: displayStateFields?.pendingApproval ?? null,
		pendingPlanApproval: displayStateFields?.pendingPlanApproval ?? null,
		pendingQuestion: displayStateFields?.pendingQuestion ?? null,
		messages,
		isConversationLoading,
		error:
			runtimeErrorMessage ??
			latestAssistantErrorMessage ??
			queryError ??
			commandError ??
			null,
		commands,
	};
}

export type UseChatDisplayReturn = ReturnType<typeof useChatDisplay>;
