export const DEFAULT_V2_TERMINAL_PRESET_IDS = [
	"claude",
	"codex",
	"opencode",
	"copilot",
] as const;

export type DefaultV2TerminalPresetId =
	(typeof DEFAULT_V2_TERMINAL_PRESET_IDS)[number];
