import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const generateTextMock = mock((async () => ({ text: null })) as (
	params: unknown,
) => Promise<{
	text: string | null;
}>);

mock.module("ai", () => ({
	generateText: generateTextMock,
}));

const { generateTitleFromMessage } = await import("./title-generation");

describe("generateTitleFromMessage", () => {
	beforeEach(() => {
		generateTextMock.mockClear();
		generateTextMock.mockResolvedValue({ text: null });
	});

	it("uses an existing title agent when provided", async () => {
		const agent = {
			generateTitleFromUserMessage: mock(async () => " Existing Agent Title "),
		};

		await expect(
			generateTitleFromMessage({
				message: "  describe this work  ",
				agent,
				modelId: "agent-model",
				tracingContext: { surface: "chat-title" },
			}),
		).resolves.toBe("Existing Agent Title");

		expect(agent.generateTitleFromUserMessage).toHaveBeenCalledWith({
			message: "describe this work",
			model: "agent-model",
			tracingContext: { surface: "chat-title" },
		});
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("uses AI SDK text generation for lightweight model-only titles", async () => {
		const model = { id: "small-model" };
		generateTextMock.mockResolvedValueOnce({ text: " Generated Title " });

		await expect(
			generateTitleFromMessage({
				message: "  summarize this branch  ",
				agentModel: model,
				agentId: "branch-namer",
				agentName: "Branch Namer",
				instructions: "Return one short branch name.",
				tracingContext: { surface: "branch-name" },
			}),
		).resolves.toBe("Generated Title");

		expect(generateTextMock).toHaveBeenCalledWith({
			model,
			system: "Return one short branch name.",
			prompt: "summarize this branch",
			temperature: 0.2,
			maxOutputTokens: 64,
			experimental_telemetry: {
				isEnabled: true,
				functionId: "branch-namer",
				metadata: {
					agentName: "Branch Namer",
					surface: "branch-name",
				},
			},
		});
	});
});

afterAll(() => {
	mock.restore();
});
