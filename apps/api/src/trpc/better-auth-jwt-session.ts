export type JwtPayload = Record<string, unknown>;

export function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export function getBearerToken(headers: Headers): string | null {
	const authorization = headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	return match?.[1] ?? null;
}

export function isRecord(value: unknown): value is JwtPayload {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFullSessionJwtPayload(
	payload: unknown,
): payload is JwtPayload {
	return isRecord(payload) && !Object.hasOwn(payload, "scope");
}

export async function sessionFromVerifiedBetterAuthJwtBearer<TSession>(
	headers: Headers,
	options: {
		verifyJwt: (token: string) => Promise<unknown>;
		sessionFromJwtPayload: (
			token: string,
			payload: JwtPayload,
		) => Promise<TSession | null>;
	},
): Promise<TSession | null> {
	const token = getBearerToken(headers);
	if (!token || !looksLikeJwt(token)) return null;

	try {
		const payload = await options.verifyJwt(token);
		if (!isFullSessionJwtPayload(payload)) return null;
		return options.sessionFromJwtPayload(token, payload);
	} catch {
		return null;
	}
}
