type MobileChatModelCandidate = {
	id: string;
	name: string;
	modelId: string;
	protocol?: string;
};

const nonTextChatModelPatterns = [
	/(^|[-_.\s])tts($|[-_.\s])/,
	/(^|[-_.\s])audio($|[-_.\s])/,
	/(^|[-_.\s])speech($|[-_.\s])/,
	/(^|[-_.\s])stt($|[-_.\s])/,
	/(^|[-_.\s])transcribe($|[-_.\s])/,
	/transcription/,
	/whisper/,
	/(^|[-_.\s])realtime($|[-_.\s])/,
	/voice/,
	/(^|[-_.\s])image($|[-_.\s])/,
];

const unsupportedOpenAIProxyAliasPatterns = [
	// The CPA/OpenAI-compatible gateway currently lists these human-readable
	// aliases, but chat completions rejects them with "unknown provider".
	/^claude\s+/,
	/^ws-claude/,
	// Listed by the CPA gateway, but the host chat runtime currently receives a
	// provider Bad Request when these are selected through mobile metadata.model.
	/^deepseek-/,
];

const preferredTextChatModelPatterns = [
	/gpt-5\.3-codex-spark/,
	/codex/,
	/^gpt-/,
	/^glm-/,
	/^mimo-/,
];

function isKnownUnsupportedModelAlias(
	model: MobileChatModelCandidate,
): boolean {
	if (model.protocol !== "openai-chat") return false;
	const modelId = model.modelId.trim().toLowerCase();
	return unsupportedOpenAIProxyAliasPatterns.some((pattern) =>
		pattern.test(modelId),
	);
}

function mobileChatModelRank(model: MobileChatModelCandidate): number {
	const searchText = [model.modelId, model.name, model.id]
		.join(" ")
		.toLowerCase();
	const rank = preferredTextChatModelPatterns.findIndex((pattern) =>
		pattern.test(searchText),
	);
	return rank === -1 ? preferredTextChatModelPatterns.length : rank;
}

export function isMobileAcpChatModel(model: MobileChatModelCandidate): boolean {
	const searchText = [model.id, model.name, model.modelId]
		.join(" ")
		.toLowerCase();
	return (
		!nonTextChatModelPatterns.some((pattern) => pattern.test(searchText)) &&
		!isKnownUnsupportedModelAlias(model)
	);
}

export function filterMobileAcpChatModels<T extends MobileChatModelCandidate>(
	models: T[],
): T[] {
	return [...models]
		.filter(isMobileAcpChatModel)
		.sort(
			(left: T, right: T) =>
				mobileChatModelRank(left) - mobileChatModelRank(right) ||
				left.name.localeCompare(right.name),
		);
}
