import {
	auth,
	resolveSessionOrganizationState,
	type Session,
} from "@superset/auth/server";
import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { createTRPCContext } from "@superset/trpc";
import { verifyAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
	isRecord,
	sessionFromVerifiedFullSessionJwtBearer,
} from "./better-auth-jwt-session";

const apiUrl = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

const TRUSTED_API_CLIENTS = new Set(["superset-cli"]);

async function sessionFromJwtPayload(
	token: string,
	payload: unknown,
): Promise<Session | null> {
	if (!isRecord(payload)) return null;

	const userId = typeof payload.sub === "string" ? payload.sub : null;
	if (!userId) return null;

	const user = await db.query.users.findFirst({
		where: eq(authSchema.users.id, userId),
	});
	if (!user) return null;

	const organizationIds = Array.isArray(payload.organizationIds)
		? payload.organizationIds.filter(
				(organizationId): organizationId is string =>
					typeof organizationId === "string",
			)
		: [];
	const tokenOrganizationId =
		typeof payload.organizationId === "string" ? payload.organizationId : null;
	const activeOrganizationId =
		tokenOrganizationId &&
		(organizationIds.length === 0 ||
			organizationIds.includes(tokenOrganizationId))
			? tokenOrganizationId
			: (organizationIds[0] ?? null);

	const issuedAt =
		typeof payload.iat === "number" ? new Date(payload.iat * 1000) : new Date();
	const expiresAt =
		typeof payload.exp === "number"
			? new Date(payload.exp * 1000)
			: new Date(Date.now() + 60 * 60 * 1000);
	const sessionId = typeof payload.sid === "string" ? payload.sid : userId;

	return {
		user,
		session: {
			id: sessionId,
			userId,
			activeOrganizationId,
			expiresAt,
			token,
			ipAddress: null,
			userAgent: null,
			createdAt: issuedAt,
			updatedAt: issuedAt,
		},
	} as unknown as Session;
}

async function sessionFromBetterAuthJwtBearer(
	headers: Headers,
): Promise<Session | null> {
	return sessionFromVerifiedFullSessionJwtBearer(headers, {
		verifyJwt: async (token) => {
			const { payload } = await auth.api.verifyJWT({
				body: { token },
			});
			return payload;
		},
		sessionFromJwtPayload,
	});
}

async function sessionFromOAuthBearer(
	headers: Headers,
): Promise<Session | null> {
	return sessionFromVerifiedFullSessionJwtBearer(headers, {
		verifyJwt: (token) =>
			verifyAccessToken(token, {
				jwksUrl: `${apiUrl}/api/auth/jwks`,
				verifyOptions: {
					issuer: apiUrl,
					audience: [apiUrl, `${apiUrl}/`],
				},
			}),
		sessionFromJwtPayload: async (token, payload) => {
			const authorizedClientId =
				typeof payload.azp === "string" ? payload.azp : null;
			if (authorizedClientId && !TRUSTED_API_CLIENTS.has(authorizedClientId)) {
				return null;
			}

			return sessionFromJwtPayload(token, payload);
		},
	});
}

async function resolveActiveOrganizationForSession(
	session: Session | null,
): Promise<Session | null> {
	if (!session) return null;

	const { activeOrganizationId } = await resolveSessionOrganizationState({
		userId: session.user.id,
		session: {
			id: session.session.id,
			activeOrganizationId: session.session.activeOrganizationId,
		},
	});

	if (activeOrganizationId === session.session.activeOrganizationId) {
		return session;
	}

	return {
		...session,
		session: {
			...session.session,
			activeOrganizationId,
		},
	};
}

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	let session = await auth.api.getSession({
		headers: req.headers,
	});

	if (!session) {
		session =
			(await sessionFromBetterAuthJwtBearer(req.headers)) ??
			(await sessionFromOAuthBearer(req.headers));
	}

	session = await resolveActiveOrganizationForSession(session);

	return createTRPCContext({
		session,
		auth,
		headers: req.headers,
	});
};
