import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthContext {
	sub: string;
	email: string;
	organizationIds: string[];
}

export interface WhereClause {
	fragment: string;
	params: unknown[];
}

let jwks: {
	url: string;
	value: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJWKS(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks || jwks.url !== jwksUrl) {
		jwks = {
			url: jwksUrl,
			value: createRemoteJWKSet(new URL("/api/auth/jwks", jwksUrl)),
		};
	}
	return jwks.value;
}

export async function verifyJWT(
	token: string,
	authUrl: string,
	jwksUrl = authUrl,
): Promise<AuthContext | null> {
	try {
		const { payload } = await jwtVerify(token, getJWKS(jwksUrl), {
			issuer: authUrl,
			audience: authUrl,
		});

		const sub = payload.sub;
		const email = payload.email as string | undefined;
		const organizationIds = payload.organizationIds as string[] | undefined;

		if (!sub || !organizationIds) {
			return null;
		}

		return { sub, email: email ?? "", organizationIds };
	} catch {
		return null;
	}
}
