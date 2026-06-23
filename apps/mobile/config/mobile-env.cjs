const { z } = require("zod");

const MOBILE_PROFILE_NAMES = ["development", "online-canary", "production"];
const DEFAULT_MOBILE_PROFILE = "development";
const ONLINE_PUBLIC_DOMAIN = "bj1.v.lhb.ink";

const MOBILE_ALLOWED_HTTP_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]",
	ONLINE_PUBLIC_DOMAIN,
]);

const LOOPBACK_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const OPTIONAL_PUBLIC_ENV_KEYS = [
	"EXPO_PUBLIC_DEEP_LINK_DOMAIN",
	"EXPO_PUBLIC_POSTHOG_KEY",
	"EXPO_PUBLIC_POSTHOG_HOST",
	"EXPO_PUBLIC_STREAMS_URL",
];

const MOBILE_PUBLIC_ENV_KEYS = [
	"EXPO_PUBLIC_SUPERSET_PROFILE",
	"EXPO_PUBLIC_API_URL",
	"EXPO_PUBLIC_ELECTRIC_URL",
	"EXPO_PUBLIC_WEB_URL",
	"EXPO_PUBLIC_RELAY_URL",
	"EXPO_PUBLIC_DEEP_LINK_SCHEME",
	...OPTIONAL_PUBLIC_ENV_KEYS,
];

function buildOnlineDefaults(profile) {
	return {
		EXPO_PUBLIC_SUPERSET_PROFILE: profile,
		EXPO_PUBLIC_API_URL: `http://${ONLINE_PUBLIC_DOMAIN}:63001`,
		EXPO_PUBLIC_ELECTRIC_URL: `http://${ONLINE_PUBLIC_DOMAIN}:63012`,
		EXPO_PUBLIC_WEB_URL: `http://${ONLINE_PUBLIC_DOMAIN}:63000`,
		EXPO_PUBLIC_RELAY_URL: `http://${ONLINE_PUBLIC_DOMAIN}:63013`,
		EXPO_PUBLIC_DEEP_LINK_SCHEME: "superset",
	};
}

const MOBILE_PROFILE_DEFAULTS = {
	development: {
		EXPO_PUBLIC_SUPERSET_PROFILE: "development",
		EXPO_PUBLIC_API_URL: "http://localhost:3001",
		EXPO_PUBLIC_ELECTRIC_URL: "http://localhost:3012",
		EXPO_PUBLIC_WEB_URL: "http://localhost:3000",
		EXPO_PUBLIC_RELAY_URL: "http://localhost:3013",
		EXPO_PUBLIC_DEEP_LINK_SCHEME: "superset",
	},
	"online-canary": buildOnlineDefaults("online-canary"),
	production: buildOnlineDefaults("production"),
};

function optionalNonEmptyString(value) {
	return typeof value === "string" && value.trim().length === 0
		? undefined
		: value;
}

function isApprovedMobileHttpHost(hostname) {
	return MOBILE_ALLOWED_HTTP_HOSTS.has(hostname);
}

function isLoopbackHttpHost(hostname) {
	return LOOPBACK_HTTP_HOSTS.has(hostname);
}

function isHttpsOrApprovedHttpUrl(value) {
	try {
		const url = new URL(value);
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" && isApprovedMobileHttpHost(url.hostname);
	} catch {
		return false;
	}
}

const mobilePublicUrlSchema = z.url().refine(isHttpsOrApprovedHttpUrl, {
	message: "Mobile HTTP URLs are only allowed for approved hosts.",
});

const optionalNonEmptyStringSchema = z.preprocess(
	optionalNonEmptyString,
	z.string().trim().min(1).optional(),
);

const mobileProfileSchema = z.enum(MOBILE_PROFILE_NAMES);

const mobilePublicEnvSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	SUPERSET_MOBILE_PROFILE: mobileProfileSchema.optional(),
	EXPO_PUBLIC_SUPERSET_PROFILE: mobileProfileSchema.default(
		DEFAULT_MOBILE_PROFILE,
	),
	EXPO_PUBLIC_API_URL: mobilePublicUrlSchema,
	EXPO_PUBLIC_ELECTRIC_URL: mobilePublicUrlSchema,
	EXPO_PUBLIC_WEB_URL: mobilePublicUrlSchema,
	EXPO_PUBLIC_RELAY_URL: mobilePublicUrlSchema,
	EXPO_PUBLIC_STREAMS_URL: mobilePublicUrlSchema.optional(),
	EXPO_PUBLIC_DEEP_LINK_SCHEME: z.string().default("superset"),
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: z.string().optional(),
	EXPO_PUBLIC_POSTHOG_KEY: optionalNonEmptyStringSchema,
	EXPO_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
});

function readProfile(input) {
	const rawProfile =
		optionalNonEmptyString(input.SUPERSET_MOBILE_PROFILE) ??
		optionalNonEmptyString(input.EXPO_PUBLIC_SUPERSET_PROFILE);
	if (rawProfile === undefined) {
		return DEFAULT_MOBILE_PROFILE;
	}
	return mobileProfileSchema.parse(rawProfile);
}

function pickDefinedPublicEnv(input) {
	const picked = {};
	for (const key of MOBILE_PUBLIC_ENV_KEYS) {
		const value = optionalNonEmptyString(input[key]);
		if (value !== undefined) {
			picked[key] = value;
		}
	}
	return picked;
}

function resolveMobileEnv(input) {
	const profile = readProfile(input);
	const defaults = MOBILE_PROFILE_DEFAULTS[profile];
	return mobilePublicEnvSchema.parse({
		NODE_ENV: input.NODE_ENV,
		SUPERSET_MOBILE_PROFILE: profile,
		...defaults,
		...pickDefinedPublicEnv(input),
		EXPO_PUBLIC_SUPERSET_PROFILE: profile,
	});
}

function parseMobileEnv(input) {
	return resolveMobileEnv(input);
}

function toExpoPublicEnv(env) {
	const output = {
		EXPO_PUBLIC_SUPERSET_PROFILE: env.EXPO_PUBLIC_SUPERSET_PROFILE,
		EXPO_PUBLIC_API_URL: env.EXPO_PUBLIC_API_URL,
		EXPO_PUBLIC_ELECTRIC_URL: env.EXPO_PUBLIC_ELECTRIC_URL,
		EXPO_PUBLIC_WEB_URL: env.EXPO_PUBLIC_WEB_URL,
		EXPO_PUBLIC_RELAY_URL: env.EXPO_PUBLIC_RELAY_URL,
		EXPO_PUBLIC_DEEP_LINK_SCHEME: env.EXPO_PUBLIC_DEEP_LINK_SCHEME,
	};
	for (const key of OPTIONAL_PUBLIC_ENV_KEYS) {
		const value = env[key];
		if (typeof value === "string" && value.length > 0) {
			output[key] = value;
		}
	}
	return output;
}

function getPublicHttpHosts(env) {
	const hosts = new Set();
	for (const key of MOBILE_PUBLIC_ENV_KEYS) {
		if (key === "EXPO_PUBLIC_SUPERSET_PROFILE") continue;
		if (key === "EXPO_PUBLIC_DEEP_LINK_SCHEME") continue;
		if (key === "EXPO_PUBLIC_DEEP_LINK_DOMAIN") continue;
		if (key === "EXPO_PUBLIC_POSTHOG_KEY") continue;

		const value = env[key];
		if (!value) continue;
		const url = new URL(value);
		if (url.protocol !== "http:") continue;
		if (isLoopbackHttpHost(url.hostname)) continue;
		hosts.add(url.hostname);
	}
	return Array.from(hosts).sort();
}

function getIosAtsExceptionDomains(env) {
	return Object.fromEntries(
		getPublicHttpHosts(env).map((host) => [
			host,
			{
				NSExceptionAllowsInsecureHTTPLoads: true,
				NSIncludesSubdomains: true,
			},
		]),
	);
}

module.exports = {
	DEFAULT_MOBILE_PROFILE,
	MOBILE_ALLOWED_HTTP_HOSTS,
	MOBILE_PROFILE_DEFAULTS,
	MOBILE_PROFILE_NAMES,
	MOBILE_PUBLIC_ENV_KEYS,
	ONLINE_PUBLIC_DOMAIN,
	getIosAtsExceptionDomains,
	getPublicHttpHosts,
	isApprovedMobileHttpHost,
	isHttpsOrApprovedHttpUrl,
	isLoopbackHttpHost,
	mobilePublicEnvSchema,
	mobilePublicUrlSchema,
	parseMobileEnv,
	resolveMobileEnv,
	toExpoPublicEnv,
};
