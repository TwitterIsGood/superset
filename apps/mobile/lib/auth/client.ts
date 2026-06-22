import {
	expoClient,
	getSetCookie,
	storageAdapter,
} from "@better-auth/expo/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { env } from "../env";

const AUTH_STORAGE_PREFIX = "superset";
const AUTH_COOKIE_STORAGE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;
const authCookieStorage = storageAdapter(SecureStore);
let jwt: string | null = null;

type EmailSignInError = {
	code?: string;
	message?: string;
};

type EmailSignInResult = {
	error?: EmailSignInError;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function errorFromPayload(payload: unknown): EmailSignInError | null {
	if (!isRecord(payload)) return null;
	const error = payload.error;
	if (!isRecord(error)) return null;
	return {
		code: typeof error.code === "string" ? error.code : undefined,
		message: typeof error.message === "string" ? error.message : undefined,
	};
}

function readStoredCookieJson(): Record<string, unknown> {
	const existing = authCookieStorage.getItem(AUTH_COOKIE_STORAGE_KEY);
	if (!existing) return {};
	try {
		const parsed: unknown = JSON.parse(existing);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

async function persistEmailSignInCookie(response: Response) {
	const setCookie = response.headers.get("set-cookie");
	if (setCookie) {
		const nextCookie = getSetCookie(
			setCookie,
			authCookieStorage.getItem(AUTH_COOKIE_STORAGE_KEY) ?? undefined,
		);
		await authCookieStorage.setItem(AUTH_COOKIE_STORAGE_KEY, nextCookie);
		return;
	}

	const authToken = response.headers.get("set-auth-token");
	if (!authToken) return;

	const cookie = readStoredCookieJson();
	cookie["better-auth.session_token"] = {
		value: encodeURIComponent(authToken),
		expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
	};
	await authCookieStorage.setItem(
		AUTH_COOKIE_STORAGE_KEY,
		JSON.stringify(cookie),
	);
}

export function setJwt(token: string | null) {
	jwt = token;
}

export function getJwt(): string | null {
	return jwt;
}

export async function refreshJwt(): Promise<string | null> {
	try {
		const result = await authClient.token();
		const token = result.data?.token ?? null;
		if (!token) {
			setJwt(null);
			throw new Error(
				result.error?.message ?? "Auth token endpoint returned no JWT",
			);
		}
		setJwt(token);
		return token;
	} catch (error) {
		setJwt(null);
		throw error;
	}
}

export async function signInWithEmail(input: {
	email: string;
	password: string;
}): Promise<EmailSignInResult> {
	const response = await fetch(
		`${env.EXPO_PUBLIC_API_URL}/api/auth/sign-in/email`,
		{
			method: "POST",
			credentials: "omit",
			headers: {
				"content-type": "application/json",
				"expo-origin": Linking.createURL("", { scheme: "superset" }),
				"x-skip-oauth-proxy": "true",
			},
			body: JSON.stringify({
				email: input.email,
				password: input.password,
			}),
		},
	);

	const payload: unknown = await response.json().catch(() => null);
	const payloadError = errorFromPayload(payload);
	if (!response.ok || payloadError) {
		return {
			error: payloadError ?? {
				message: `Email sign-in failed with status ${response.status}`,
			},
		};
	}

	await persistEmailSignInCookie(response);
	await refreshJwt();
	await authClient.getSession();

	return {};
}

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_API_URL,
	plugins: [
		expoClient({
			scheme: "superset",
			storagePrefix: AUTH_STORAGE_PREFIX,
			storage: SecureStore,
		}),
		organizationClient({
			teams: { enabled: true },
			schema: {
				team: {
					additionalFields: {
						slug: { type: "string", input: true, required: true },
					},
				},
			},
		}),
		customSessionClient<typeof auth>(),
		jwtClient(),
	],
	fetchOptions: {
		onResponse: async (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});

export const { signIn, signOut, signUp, useSession } = authClient;
