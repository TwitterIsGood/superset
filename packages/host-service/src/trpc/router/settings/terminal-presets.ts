import { DEFAULT_V2_TERMINAL_PRESET_IDS } from "@superset/shared/default-terminal-presets";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { protectedProcedure, router } from "../../index";
import type { HostAgentConfig } from "./agent-configs";
import { listAgentConfigs } from "./agent-configs";

const safeShellTokenPattern = /^[A-Za-z0-9_@%+=:,./~-]+$/;
const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface HostTerminalPresetSummary {
	id: string;
	presetId: string;
	label: string;
	description: string;
	command: string;
	commands: string[];
	agentId?: string;
	order: number;
}

function quoteShellToken(value: string): string {
	if (value === "") return "''";
	if (safeShellTokenPattern.test(value)) return value;
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatEnv(env: Record<string, string> | undefined) {
	if (!env) return "";
	return Object.entries(env)
		.filter(([key]) => envKeyPattern.test(key))
		.map(([key, value]) => `${key}=${quoteShellToken(value)}`)
		.join(" ");
}

function formatLaunchCommand({
	command,
	args,
	env,
}: {
	command: string;
	args: string[];
	env?: Record<string, string>;
}): string {
	const trimmedCommand = command.trim();
	const commandText =
		args.length === 0
			? trimmedCommand
			: [trimmedCommand, ...args].map(quoteShellToken).join(" ");
	const envPrefix = formatEnv(env);
	if (!envPrefix) return commandText;
	return commandText ? `${envPrefix} ${commandText}` : envPrefix;
}

export function buildTerminalPresetSummaries(
	agents: readonly HostAgentConfig[],
): HostTerminalPresetSummary[] {
	return DEFAULT_V2_TERMINAL_PRESET_IDS.flatMap((presetId, order) => {
		const preset = getPresetById(presetId);
		if (!preset) return [];

		const agent = agents.find(
			(candidate) =>
				candidate.presetId === presetId && candidate.command.trim().length > 0,
		);
		const command = formatLaunchCommand(agent ?? preset);

		if (!command) return [];

		return [
			{
				id: presetId,
				presetId,
				label: agent?.label ?? preset.label,
				description: preset.description,
				command,
				commands: [command],
				agentId: agent?.id,
				order,
			},
		];
	});
}

export const terminalPresetsRouter = router({
	/**
	 * Lists Terminal Settings presets for mobile/relay consumers. This is
	 * intentionally narrower than `settings.agentConfigs.list`: the visible
	 * preset list mirrors the desktop V2 Terminal default preset seed instead
	 * of exposing every installed terminal agent as a preset.
	 */
	list: protectedProcedure.query(({ ctx }) =>
		buildTerminalPresetSummaries(listAgentConfigs(ctx.db)),
	),
});
