type TitleModel = unknown;
type TitleAgent = {
	generateTitleFromUserMessage: (args: {
		message: string;
		model?: string;
		tracingContext?: Record<string, unknown>;
	}) => Promise<string | null | undefined>;
};
type GenerateTextFn = (params: {
	model: TitleModel;
	system: string;
	prompt: string;
	temperature?: number;
	maxOutputTokens?: number;
	experimental_telemetry?: {
		isEnabled?: boolean;
		functionId?: string;
		metadata?: Record<string, unknown>;
	};
}) => Promise<{ text?: string | null }>;

type GenerateTitleFromMessageParams =
	| {
			message: string;
			agent: TitleAgent;
			modelId: string;
			tracingContext?: Record<string, unknown>;
	  }
	| {
			message: string;
			agentModel: TitleModel;
			agentId?: string;
			agentName?: string;
			instructions?: string;
			tracingContext?: Record<string, unknown>;
	  };

export async function generateTitleFromMessage(
	params: GenerateTitleFromMessageParams,
): Promise<string | null> {
	const { message, tracingContext = {} } = params;
	const cleanedMessage = message.trim();
	if (!cleanedMessage) {
		return null;
	}

	if ("agent" in params) {
		const title = await params.agent.generateTitleFromUserMessage({
			message: cleanedMessage,
			model: params.modelId,
			tracingContext,
		});
		return title?.trim() || null;
	}

	const { generateText } = (await import("ai")) as {
		generateText?: GenerateTextFn;
	};
	if (!generateText) {
		throw new Error("AI SDK generateText is unavailable");
	}

	const result = await generateText({
		model: params.agentModel,
		system: params.instructions ?? "You generate concise titles.",
		prompt: cleanedMessage,
		temperature: 0.2,
		maxOutputTokens: 64,
		experimental_telemetry: {
			isEnabled: true,
			functionId: params.agentId ?? "title-generator",
			metadata: {
				agentName: params.agentName ?? "Title Generator",
				...tracingContext,
			},
		},
	});

	return result.text?.trim() || null;
}
