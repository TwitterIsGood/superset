import type { ModelProviderRuntimeResolver } from "../types";
import {
	buildAnthropicRuntimeEnv,
	getAnthropicEnvConfig,
	stripAnthropicCredentialEnvVariables,
} from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";
import {
	hasUsableCredential,
	resolveAnthropicCredential,
	resolveOpenAICredential,
} from "./utils";

const CLEANUP_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

const CREDENTIAL_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

const PLACEHOLDER_CREDENTIAL_MARKERS = [
	"fake",
	"dummy",
	"placeholder",
	"example",
	"local-dev",
] as const;

interface LocalModelProviderOptions {
	anthropicEnvConfigPath?: string;
	envResolver?: () => Record<string, string | undefined>;
}

function pickNonEmptyEnv(
	sourceEnv: Record<string, string | undefined>,
	keys: readonly string[],
): Record<string, string> {
	return Object.fromEntries(
		keys
			.map((key) => [key, sourceEnv[key]?.trim() ?? ""] as const)
			.filter(([, value]) => value.length > 0),
	);
}

function isUsableEnvCredentialValue(
	value: string | undefined,
): value is string {
	const trimmed = value?.trim();
	if (!trimmed) return false;
	const normalized = trimmed.toLowerCase();
	return !PLACEHOLDER_CREDENTIAL_MARKERS.some((marker) =>
		normalized.includes(marker),
	);
}

function pickCredentialEnv(
	sourceEnv: Record<string, string | undefined>,
	keys: readonly string[],
): Record<string, string> {
	return Object.fromEntries(
		keys.flatMap((key) => {
			const value = sourceEnv[key];
			if (!isUsableEnvCredentialValue(value)) return [];
			return [[key, value.trim()] as const];
		}),
	);
}

function removePlaceholderCredentials(
	env: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(env).filter(
			([key, value]) =>
				!CREDENTIAL_ENV_KEYS.includes(
					key as (typeof CREDENTIAL_ENV_KEYS)[number],
				) || isUsableEnvCredentialValue(value),
		),
	);
}

export class LocalModelProvider implements ModelProviderRuntimeResolver {
	private readonly anthropicEnvConfigPath?: string;
	private readonly envResolver: () => Record<string, string | undefined>;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: LocalModelProviderOptions) {
		this.anthropicEnvConfigPath = options?.anthropicEnvConfigPath;
		this.envResolver =
			options?.envResolver ??
			(() => process.env as Record<string, string | undefined>);
	}

	private async resolveRuntimeEnv(): Promise<{
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	}> {
		const sourceEnv = this.envResolver();
		const anthropicCredential = await resolveAnthropicCredential();
		const openaiCredential = resolveOpenAICredential();
		const anthropicEnvConfig = getAnthropicEnvConfig({
			configPath: this.anthropicEnvConfigPath,
		});
		const envCredentialRuntimeEnv = buildAnthropicRuntimeEnv({
			...pickCredentialEnv(sourceEnv, [
				"ANTHROPIC_API_KEY",
				"ANTHROPIC_AUTH_TOKEN",
			]),
			...pickNonEmptyEnv(sourceEnv, [
				"ANTHROPIC_BASE_URL",
				"ANTHROPIC_CUSTOM_HEADERS",
			]),
		});
		const openaiRuntimeEnv = pickCredentialEnv(sourceEnv, [
			"OPENAI_API_KEY",
			"OPENAI_AUTH_TOKEN",
		]);
		const persistedRuntimeEnv = removePlaceholderCredentials(
			buildAnthropicRuntimeEnv(
				stripAnthropicCredentialEnvVariables(anthropicEnvConfig.variables),
			),
		);
		const runtimeEnv = {
			...envCredentialRuntimeEnv,
			...openaiRuntimeEnv,
			...persistedRuntimeEnv,
		};

		return {
			env: runtimeEnv,
			cleanupKeys: [...CLEANUP_KEYS],
			hasUsableRuntimeEnv:
				hasUsableCredential(anthropicCredential) ||
				hasUsableCredential(openaiCredential) ||
				Boolean(
					envCredentialRuntimeEnv.ANTHROPIC_API_KEY ||
						envCredentialRuntimeEnv.ANTHROPIC_AUTH_TOKEN ||
						openaiRuntimeEnv.OPENAI_API_KEY ||
						openaiRuntimeEnv.OPENAI_AUTH_TOKEN,
				),
		};
	}

	async hasUsableRuntimeEnv(): Promise<boolean> {
		return (await this.resolveRuntimeEnv()).hasUsableRuntimeEnv;
	}

	async prepareRuntimeEnv(): Promise<void> {
		const runtimeEnv = await this.resolveRuntimeEnv();
		this.currentRuntimeEnv = applyRuntimeEnv(
			runtimeEnv.env,
			runtimeEnv.cleanupKeys,
			this.currentRuntimeEnv,
		);
	}
}
