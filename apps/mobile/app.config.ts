import path from "node:path";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";
import type * as MobileEnvConfig from "./config/mobile-env";

const {
	getIosAtsExceptionDomains,
	resolveMobileEnv,
}: typeof MobileEnvConfig = require("./config/mobile-env.cjs");

for (const envPath of [
	path.resolve(__dirname, ".env.local"),
	path.resolve(__dirname, ".env"),
	path.resolve(__dirname, "../../.env"),
]) {
	config({
		path: envPath,
		override: false,
		quiet: true,
	});
}

export default ({ config }: ConfigContext) => {
	const mobileEnv = resolveMobileEnv(process.env);

	return {
		...config,
		name: "Superset",
		slug: "superset",
		version: "1.0.0",
		orientation: "portrait",
		icon: "./assets/icon.png",
		userInterfaceStyle: "dark",
		scheme: mobileEnv.EXPO_PUBLIC_DEEP_LINK_SCHEME,
		splash: {
			image: "./assets/splash-icon.png",
			resizeMode: "contain" as const,
			backgroundColor: "#09090b",
		},
		ios: {
			...config.ios,
			supportsTablet: true,
			bundleIdentifier: "sh.superset.mobile",
			infoPlist: {
				...config.ios?.infoPlist,
				EXDevMenuShowFloatingActionButton: false,
				ITSAppUsesNonExemptEncryption: false,
				NSAppTransportSecurity: {
					NSAllowsArbitraryLoads: false,
					NSAllowsLocalNetworking: true,
					NSExceptionDomains: getIosAtsExceptionDomains(mobileEnv),
				},
			},
		},
		android: {
			...config.android,
			adaptiveIcon: {
				foregroundImage: "./assets/adaptive-icon.png",
				backgroundColor: "#ffffff",
			},
			package: "sh.superset.mobile",
			predictiveBackGestureEnabled: false,
		},
		web: {
			...config.web,
			favicon: "./assets/favicon.png",
			bundler: "metro" as const,
		},
		plugins: ["expo-router", "expo-localization"],
		extra: {
			...config.extra,
			router: {},
			eas: {
				projectId: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
			},
			superset: {
				mobileProfile: mobileEnv.EXPO_PUBLIC_SUPERSET_PROFILE,
				apiUrl: mobileEnv.EXPO_PUBLIC_API_URL,
				electricUrl: mobileEnv.EXPO_PUBLIC_ELECTRIC_URL,
				webUrl: mobileEnv.EXPO_PUBLIC_WEB_URL,
				relayUrl: mobileEnv.EXPO_PUBLIC_RELAY_URL,
			},
		},
		owner: "supserset-sh",
	};
};
