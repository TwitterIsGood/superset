/**
 * Environment variables for the RENDERER PROCESS (browser context).
 *
 * These values are injected at BUILD TIME by Vite's `define` in electron.vite.config.ts.
 * They are NOT read from process.env at runtime - Vite replaces the references with
 * literal strings during compilation.
 *
 * Only import this file in src/renderer/ code - never in main or shared code.
 *
 * For main process env vars, use src/main/env.main.ts instead.
 */

type RendererNodeEnv = "development" | "production" | "test";

export interface RendererEnv {
	NODE_ENV: RendererNodeEnv;
	NEXT_PUBLIC_API_URL: string;
	NEXT_PUBLIC_WEB_URL: string;
	NEXT_PUBLIC_MARKETING_URL: string;
	NEXT_PUBLIC_ELECTRIC_URL: string;
	NEXT_PUBLIC_POSTHOG_KEY?: string;
	NEXT_PUBLIC_POSTHOG_HOST: string;
	SENTRY_DSN_DESKTOP?: string;
	RELAY_URL: string;
	SKIP_ENV_VALIDATION: boolean;
}

type RawRendererEnv = {
	NODE_ENV?: string;
	NEXT_PUBLIC_API_URL?: string;
	NEXT_PUBLIC_WEB_URL?: string;
	NEXT_PUBLIC_MARKETING_URL?: string;
	NEXT_PUBLIC_ELECTRIC_URL?: string;
	NEXT_PUBLIC_POSTHOG_KEY?: string;
	NEXT_PUBLIC_POSTHOG_HOST?: string;
	SENTRY_DSN_DESKTOP?: string;
	RELAY_URL?: string;
};

const DEFAULT_RENDERER_ENV = {
	NODE_ENV: "development",
	NEXT_PUBLIC_API_URL: "https://api.superset.sh",
	NEXT_PUBLIC_WEB_URL: "https://app.superset.sh",
	NEXT_PUBLIC_MARKETING_URL: "https://superset.sh",
	NEXT_PUBLIC_ELECTRIC_URL: "https://electric-proxy.avi-6ac.workers.dev",
	NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
	RELAY_URL: "https://relay.superset.sh",
} satisfies Omit<
	RendererEnv,
	"NEXT_PUBLIC_POSTHOG_KEY" | "SENTRY_DSN_DESKTOP" | "SKIP_ENV_VALIDATION"
>;

/**
 * Build-time environment variables.
 *
 * Vite replaces these process.env.* and import.meta.env.* references at build time.
 * The values are baked into the bundle as string literals.
 */
const rawEnv = {
	// These are replaced by Vite's define at build time
	NODE_ENV: process.env.NODE_ENV,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
	NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
	NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
	NEXT_PUBLIC_POSTHOG_KEY: import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
		| string
		| undefined,
	NEXT_PUBLIC_POSTHOG_HOST: import.meta.env.NEXT_PUBLIC_POSTHOG_HOST as
		| string
		| undefined,
	SENTRY_DSN_DESKTOP: import.meta.env.SENTRY_DSN_DESKTOP as string | undefined,
	RELAY_URL: process.env.RELAY_URL,
};

// Only allow skipping validation in development (never in production)
const SKIP_ENV_VALIDATION =
	process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION;

function stringOrDefault(value: string | undefined, defaultValue: string) {
	return value && value.length > 0 ? value : defaultValue;
}

function optionalString(value: string | undefined) {
	return value && value.length > 0 ? value : undefined;
}

function parseNodeEnv(value: string | undefined): RendererNodeEnv {
	const nodeEnv = stringOrDefault(value, DEFAULT_RENDERER_ENV.NODE_ENV);
	if (
		nodeEnv === "development" ||
		nodeEnv === "production" ||
		nodeEnv === "test"
	) {
		return nodeEnv;
	}
	throw new Error(
		`Invalid renderer env NODE_ENV: expected development, production, or test; received ${JSON.stringify(nodeEnv)}`,
	);
}

function assertValidUrl(name: string, value: string) {
	try {
		new URL(value);
	} catch {
		throw new Error(`Invalid renderer env ${name}: expected URL`);
	}
}

function createRendererEnv(
	raw: RawRendererEnv,
	{ skipValidation }: { skipValidation: boolean },
): RendererEnv {
	const parsed = {
		NODE_ENV: parseNodeEnv(raw.NODE_ENV),
		NEXT_PUBLIC_API_URL: stringOrDefault(
			raw.NEXT_PUBLIC_API_URL,
			DEFAULT_RENDERER_ENV.NEXT_PUBLIC_API_URL,
		),
		NEXT_PUBLIC_WEB_URL: stringOrDefault(
			raw.NEXT_PUBLIC_WEB_URL,
			DEFAULT_RENDERER_ENV.NEXT_PUBLIC_WEB_URL,
		),
		NEXT_PUBLIC_MARKETING_URL: stringOrDefault(
			raw.NEXT_PUBLIC_MARKETING_URL,
			DEFAULT_RENDERER_ENV.NEXT_PUBLIC_MARKETING_URL,
		),
		NEXT_PUBLIC_ELECTRIC_URL: stringOrDefault(
			raw.NEXT_PUBLIC_ELECTRIC_URL,
			DEFAULT_RENDERER_ENV.NEXT_PUBLIC_ELECTRIC_URL,
		),
		NEXT_PUBLIC_POSTHOG_KEY: optionalString(raw.NEXT_PUBLIC_POSTHOG_KEY),
		NEXT_PUBLIC_POSTHOG_HOST: stringOrDefault(
			raw.NEXT_PUBLIC_POSTHOG_HOST,
			DEFAULT_RENDERER_ENV.NEXT_PUBLIC_POSTHOG_HOST,
		),
		SENTRY_DSN_DESKTOP: optionalString(raw.SENTRY_DSN_DESKTOP),
		RELAY_URL: stringOrDefault(raw.RELAY_URL, DEFAULT_RENDERER_ENV.RELAY_URL),
		SKIP_ENV_VALIDATION: skipValidation,
	};

	if (!skipValidation) {
		assertValidUrl("NEXT_PUBLIC_API_URL", parsed.NEXT_PUBLIC_API_URL);
		assertValidUrl("NEXT_PUBLIC_WEB_URL", parsed.NEXT_PUBLIC_WEB_URL);
		assertValidUrl(
			"NEXT_PUBLIC_MARKETING_URL",
			parsed.NEXT_PUBLIC_MARKETING_URL,
		);
		assertValidUrl("NEXT_PUBLIC_ELECTRIC_URL", parsed.NEXT_PUBLIC_ELECTRIC_URL);
		assertValidUrl("NEXT_PUBLIC_POSTHOG_HOST", parsed.NEXT_PUBLIC_POSTHOG_HOST);
		assertValidUrl("RELAY_URL", parsed.RELAY_URL);
	}

	return parsed;
}

export const env = createRendererEnv(rawEnv, {
	skipValidation: SKIP_ENV_VALIDATION,
});
