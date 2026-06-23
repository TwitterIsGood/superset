import { z } from "zod";

const MOBILE_ALLOWED_HTTP_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]",
	"bj1.v.lhb.ink",
]);

function isHttpsOrLocalHttpUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol === "https:") return true;
		return (
			url.protocol === "http:" && MOBILE_ALLOWED_HTTP_HOSTS.has(url.hostname)
		);
	} catch {
		return false;
	}
}

export const mobilePublicUrlSchema = z.url().refine(isHttpsOrLocalHttpUrl, {
	message: "Mobile HTTP URLs are only allowed for approved hosts.",
});

const optionalNonEmptyStringSchema = z.preprocess(
	(value) =>
		typeof value === "string" && value.trim().length === 0 ? undefined : value,
	z.string().trim().min(1).optional(),
);

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	EXPO_PUBLIC_API_URL: mobilePublicUrlSchema,
	EXPO_PUBLIC_ELECTRIC_URL: mobilePublicUrlSchema.default(
		"https://electric-proxy.avi-6ac.workers.dev",
	),
	EXPO_PUBLIC_WEB_URL: mobilePublicUrlSchema.optional(),
	EXPO_PUBLIC_DEEP_LINK_SCHEME: z.string().default("superset"),
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: z.string().optional(),
	EXPO_PUBLIC_POSTHOG_KEY: optionalNonEmptyStringSchema,
	EXPO_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
});

export function parseMobileEnv(input: Record<string, unknown>) {
	return envSchema.parse(input);
}

export const env = parseMobileEnv({
	NODE_ENV: process.env.NODE_ENV as unknown,
	EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL as unknown,
	EXPO_PUBLIC_ELECTRIC_URL: process.env.EXPO_PUBLIC_ELECTRIC_URL as unknown,
	EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL as unknown,
	EXPO_PUBLIC_DEEP_LINK_SCHEME: process.env
		.EXPO_PUBLIC_DEEP_LINK_SCHEME as unknown,
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: process.env
		.EXPO_PUBLIC_DEEP_LINK_DOMAIN as unknown,
	EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY as unknown,
	EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST as unknown,
});
