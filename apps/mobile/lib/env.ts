export {
	mobilePublicEnvSchema,
	mobilePublicUrlSchema,
	parseMobileEnv,
	resolveMobileEnv,
} from "@/config/mobile-env";

import { resolveMobileEnv } from "@/config/mobile-env";

export const env = resolveMobileEnv({
	NODE_ENV: process.env.NODE_ENV as unknown,
	SUPERSET_MOBILE_PROFILE: process.env.SUPERSET_MOBILE_PROFILE as unknown,
	EXPO_PUBLIC_SUPERSET_PROFILE: process.env
		.EXPO_PUBLIC_SUPERSET_PROFILE as unknown,
	EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL as unknown,
	EXPO_PUBLIC_ELECTRIC_URL: process.env.EXPO_PUBLIC_ELECTRIC_URL as unknown,
	EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL as unknown,
	EXPO_PUBLIC_RELAY_URL: process.env.EXPO_PUBLIC_RELAY_URL as unknown,
	EXPO_PUBLIC_STREAMS_URL: process.env.EXPO_PUBLIC_STREAMS_URL as unknown,
	EXPO_PUBLIC_DEEP_LINK_SCHEME: process.env
		.EXPO_PUBLIC_DEEP_LINK_SCHEME as unknown,
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: process.env
		.EXPO_PUBLIC_DEEP_LINK_DOMAIN as unknown,
	EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY as unknown,
	EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST as unknown,
});
