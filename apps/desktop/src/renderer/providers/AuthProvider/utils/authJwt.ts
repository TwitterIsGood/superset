const JWT_FALLBACK_TTL_MS = 55 * 60 * 1000;

export function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export function getJwtExpiresAt(token: string): string {
	const [, payload] = token.split(".");
	if (!payload) {
		return new Date(Date.now() + JWT_FALLBACK_TTL_MS).toISOString();
	}

	try {
		const paddedPayload = payload
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(Math.ceil(payload.length / 4) * 4, "=");
		const parsed = JSON.parse(atob(paddedPayload)) as { exp?: unknown };
		if (typeof parsed.exp === "number" && Number.isFinite(parsed.exp)) {
			return new Date(parsed.exp * 1000).toISOString();
		}
	} catch (error) {
		console.warn("[AuthProvider] Failed to read JWT expiration", error);
	}

	return new Date(Date.now() + JWT_FALLBACK_TTL_MS).toISOString();
}
