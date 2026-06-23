import type { z } from "zod";

export const MOBILE_PROFILE_NAMES = [
	"development",
	"online-canary",
	"production",
] as const;

export type MobileProfileName = (typeof MOBILE_PROFILE_NAMES)[number];

export const DEFAULT_MOBILE_PROFILE: MobileProfileName = "development";
export const ONLINE_PUBLIC_DOMAIN = "bj1.v.lhb.ink";

const OPTIONAL_PUBLIC_ENV_KEYS = [
	"EXPO_PUBLIC_DEEP_LINK_DOMAIN",
	"EXPO_PUBLIC_POSTHOG_KEY",
	"EXPO_PUBLIC_POSTHOG_HOST",
	"EXPO_PUBLIC_STREAMS_URL",
] as const;

export const MOBILE_PUBLIC_ENV_KEYS = [
	"EXPO_PUBLIC_SUPERSET_PROFILE",
	"EXPO_PUBLIC_API_URL",
	"EXPO_PUBLIC_ELECTRIC_URL",
	"EXPO_PUBLIC_WEB_URL",
	"EXPO_PUBLIC_RELAY_URL",
	"EXPO_PUBLIC_DEEP_LINK_SCHEME",
	...OPTIONAL_PUBLIC_ENV_KEYS,
] as const;

export type MobilePublicEnvKey = (typeof MOBILE_PUBLIC_ENV_KEYS)[number];

export type ResolvedMobileEnv = {
	NODE_ENV: "development" | "production" | "test";
	SUPERSET_MOBILE_PROFILE?: MobileProfileName;
	EXPO_PUBLIC_SUPERSET_PROFILE: MobileProfileName;
	EXPO_PUBLIC_API_URL: string;
	EXPO_PUBLIC_ELECTRIC_URL: string;
	EXPO_PUBLIC_WEB_URL: string;
	EXPO_PUBLIC_RELAY_URL: string;
	EXPO_PUBLIC_STREAMS_URL?: string;
	EXPO_PUBLIC_DEEP_LINK_SCHEME: string;
	EXPO_PUBLIC_DEEP_LINK_DOMAIN?: string;
	EXPO_PUBLIC_POSTHOG_KEY?: string;
	EXPO_PUBLIC_POSTHOG_HOST: string;
};

type MobileProfileDefaults = Pick<
	Record<MobilePublicEnvKey, string>,
	| "EXPO_PUBLIC_SUPERSET_PROFILE"
	| "EXPO_PUBLIC_API_URL"
	| "EXPO_PUBLIC_ELECTRIC_URL"
	| "EXPO_PUBLIC_WEB_URL"
	| "EXPO_PUBLIC_RELAY_URL"
	| "EXPO_PUBLIC_DEEP_LINK_SCHEME"
> &
	Partial<Record<(typeof OPTIONAL_PUBLIC_ENV_KEYS)[number], string>>;

type RuntimeExports = {
	DEFAULT_MOBILE_PROFILE: MobileProfileName;
	MOBILE_ALLOWED_HTTP_HOSTS: Set<string>;
	MOBILE_PROFILE_DEFAULTS: Record<MobileProfileName, MobileProfileDefaults>;
	MOBILE_PROFILE_NAMES: typeof MOBILE_PROFILE_NAMES;
	MOBILE_PUBLIC_ENV_KEYS: typeof MOBILE_PUBLIC_ENV_KEYS;
	ONLINE_PUBLIC_DOMAIN: typeof ONLINE_PUBLIC_DOMAIN;
	getIosAtsExceptionDomains: (env: ResolvedMobileEnv) => Record<
		string,
		{
			NSExceptionAllowsInsecureHTTPLoads: true;
			NSIncludesSubdomains: true;
		}
	>;
	getPublicHttpHosts: (env: ResolvedMobileEnv) => string[];
	isApprovedMobileHttpHost: (hostname: string) => boolean;
	isHttpsOrApprovedHttpUrl: (value: string) => boolean;
	isLoopbackHttpHost: (hostname: string) => boolean;
	mobilePublicEnvSchema: z.ZodType<ResolvedMobileEnv>;
	mobilePublicUrlSchema: z.ZodType<string>;
	parseMobileEnv: (input: Record<string, unknown>) => ResolvedMobileEnv;
	resolveMobileEnv: (input: Record<string, unknown>) => ResolvedMobileEnv;
	toExpoPublicEnv: (
		env: ResolvedMobileEnv,
	) => Partial<Record<MobilePublicEnvKey, string>>;
};

const runtime = require("./mobile-env.cjs") as RuntimeExports;

export const MOBILE_ALLOWED_HTTP_HOSTS = runtime.MOBILE_ALLOWED_HTTP_HOSTS;
export const MOBILE_PROFILE_DEFAULTS = runtime.MOBILE_PROFILE_DEFAULTS;
export const mobilePublicEnvSchema = runtime.mobilePublicEnvSchema;
export const mobilePublicUrlSchema = runtime.mobilePublicUrlSchema;
export const getIosAtsExceptionDomains = runtime.getIosAtsExceptionDomains;
export const getPublicHttpHosts = runtime.getPublicHttpHosts;
export const isApprovedMobileHttpHost = runtime.isApprovedMobileHttpHost;
export const isHttpsOrApprovedHttpUrl = runtime.isHttpsOrApprovedHttpUrl;
export const isLoopbackHttpHost = runtime.isLoopbackHttpHost;
export const parseMobileEnv = runtime.parseMobileEnv;
export const resolveMobileEnv = runtime.resolveMobileEnv;
export const toExpoPublicEnv = runtime.toExpoPublicEnv;
