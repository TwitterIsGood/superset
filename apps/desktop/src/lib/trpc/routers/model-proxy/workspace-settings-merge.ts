export const WORKSPACE_MODEL_ENV_KEYS = [
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"API_TIMEOUT_MS",
	"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
	"ANTHROPIC_DEFAULT_HAIKU_MODEL",
	"ANTHROPIC_DEFAULT_SONNET_MODEL",
	"ANTHROPIC_DEFAULT_OPUS_MODEL",
] as const;

export function mergeWorkspaceModelSettings(
	existingText: string | null,
	env: Record<(typeof WORKSPACE_MODEL_ENV_KEYS)[number], string>,
): {
	text: string;
	replacedInvalidJson: boolean;
	replacedNonObjectEnv: boolean;
	preservedEnvKeys: string[];
	currentModels: { haikuModel?: string; sonnetModel?: string; opusModel?: string };
} {
	let root: Record<string, unknown> = {};
	let replacedInvalidJson = false;
	if (existingText?.trim()) {
		try {
			const parsed = JSON.parse(existingText) as unknown;
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				root = parsed as Record<string, unknown>;
			} else {
				replacedInvalidJson = true;
			}
		} catch {
			replacedInvalidJson = true;
		}
	}
	const existingEnv = root.env;
	const replacedNonObjectEnv =
		existingEnv !== undefined &&
		(typeof existingEnv !== "object" || existingEnv === null || Array.isArray(existingEnv));
	const nextEnv: Record<string, unknown> = replacedNonObjectEnv
		? {}
		: { ...((existingEnv as Record<string, unknown> | undefined) ?? {}) };
	const preservedEnvKeys = Object.keys(nextEnv).filter(
		(key) => !WORKSPACE_MODEL_ENV_KEYS.includes(key as never),
	);
	const currentModels = {
		haikuModel:
			typeof nextEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL === "string"
				? nextEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL
				: undefined,
		sonnetModel:
			typeof nextEnv.ANTHROPIC_DEFAULT_SONNET_MODEL === "string"
				? nextEnv.ANTHROPIC_DEFAULT_SONNET_MODEL
				: undefined,
		opusModel:
			typeof nextEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === "string"
				? nextEnv.ANTHROPIC_DEFAULT_OPUS_MODEL
				: undefined,
	};
	for (const [key, value] of Object.entries(env)) {
		nextEnv[key] = value;
	}
	root.env = nextEnv;
	return {
		text: `${JSON.stringify(root, null, "\t")}\n`,
		replacedInvalidJson,
		replacedNonObjectEnv,
		preservedEnvKeys,
		currentModels,
	};
}
