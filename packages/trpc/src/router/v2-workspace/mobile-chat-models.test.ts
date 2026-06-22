import { describe, expect, test } from "bun:test";
import { filterMobileAcpChatModels } from "./mobile-chat-models";

describe("filterMobileAcpChatModels", () => {
	test("keeps text ACP chat models and removes voice/audio/image models", () => {
		const models = [
			{
				id: "gpt-5.3-codex-spark",
				name: "gpt-5.3-codex-spark",
				modelId: "gpt-5.3-codex-spark",
			},
			{ id: "mimo-v2.5-pro", name: "mimo-v2.5-pro", modelId: "mimo-v2.5-pro" },
			{ id: "mimo-v2.5-tts", name: "mimo-v2.5-tts", modelId: "mimo-v2.5-tts" },
			{
				id: "mimo-v2.5-tts-voiceclone",
				name: "mimo-v2.5-tts-voiceclone",
				modelId: "mimo-v2.5-tts-voiceclone",
			},
			{ id: "speech-fast", name: "Speech Fast", modelId: "speech-fast" },
			{ id: "audio-pro", name: "Audio Pro", modelId: "audio-pro" },
			{
				id: "gpt-4o-mini-transcribe",
				name: "gpt-4o-mini-transcribe",
				modelId: "gpt-4o-mini-transcribe",
			},
			{ id: "whisper-1", name: "Whisper", modelId: "whisper-1" },
			{
				id: "gpt-realtime",
				name: "GPT Realtime",
				modelId: "gpt-realtime",
			},
			{ id: "fast-stt", name: "Fast STT", modelId: "fast-stt" },
			{ id: "gpt-image-2", name: "gpt-image-2", modelId: "gpt-image-2" },
		];

		expect(filterMobileAcpChatModels(models).map((model) => model.id)).toEqual([
			"gpt-5.3-codex-spark",
			"mimo-v2.5-pro",
		]);
	});

	test("removes known unroutable OpenAI proxy aliases from mobile chat choices", () => {
		const models = [
			{
				id: "encoded-claude-sonnet",
				name: "Claude Sonnet 4.6",
				modelId: "Claude Sonnet 4.6",
				protocol: "openai-chat",
			},
			{
				id: "encoded-ws-claude",
				name: "ws-claude-sonnet-4.6-thinking-1m",
				modelId: "ws-claude-sonnet-4.6-thinking-1m",
				protocol: "openai-chat",
			},
			{
				id: "anthropic-claude",
				name: "claude-sonnet-4-5",
				modelId: "claude-sonnet-4-5",
				protocol: "anthropic",
			},
			{
				id: "gpt-5.3-codex-spark",
				name: "gpt-5.3-codex-spark",
				modelId: "gpt-5.3-codex-spark",
				protocol: "openai-chat",
			},
			{
				id: "encoded-deepseek",
				name: "deepseek-v4-flash",
				modelId: "deepseek-v4-flash",
				protocol: "openai-chat",
			},
		];

		expect(filterMobileAcpChatModels(models).map((model) => model.id)).toEqual([
			"gpt-5.3-codex-spark",
			"anthropic-claude",
		]);
	});
});
