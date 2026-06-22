import { describe, expect, mock, test } from "bun:test";
import {
	isFullSessionJwtPayload,
	sessionFromVerifiedBetterAuthJwtBearer,
} from "./better-auth-jwt-session";

describe("Better Auth JWT session fallback", () => {
	test("accepts only unscoped full-session JWT payloads", () => {
		expect(isFullSessionJwtPayload({ sub: "user-1" })).toBe(true);
		expect(
			isFullSessionJwtPayload({
				sub: "user-1",
				scope: "mobile-workspace-control",
			}),
		).toBe(false);
		expect(
			isFullSessionJwtPayload({
				sub: "user-1",
				scope: "automation-run",
			}),
		).toBe(false);
		expect(isFullSessionJwtPayload(null)).toBe(false);
	});

	test("does not convert a mobile workspace-control JWT into a protected session", async () => {
		const verifyJwt = mock(async () => ({
			sub: "user-1",
			scope: "mobile-workspace-control",
		}));
		const sessionFromJwtPayload = mock(async () => ({ id: "session-1" }));

		const session = await sessionFromVerifiedBetterAuthJwtBearer(
			new Headers({ authorization: "Bearer header.payload.signature" }),
			{ verifyJwt, sessionFromJwtPayload },
		);

		expect(session).toBeNull();
		expect(verifyJwt).toHaveBeenCalledTimes(1);
		expect(sessionFromJwtPayload).not.toHaveBeenCalled();
	});

	test("converts an unscoped Better Auth JWT into a protected session", async () => {
		const verifyJwt = mock(async () => ({ sub: "user-1" }));
		const sessionFromJwtPayload = mock(async () => ({ id: "session-1" }));

		const session = await sessionFromVerifiedBetterAuthJwtBearer(
			new Headers({ authorization: "Bearer header.payload.signature" }),
			{ verifyJwt, sessionFromJwtPayload },
		);

		expect(session).toEqual({ id: "session-1" });
		expect(verifyJwt).toHaveBeenCalledTimes(1);
		expect(sessionFromJwtPayload).toHaveBeenCalledWith(
			"header.payload.signature",
			{ sub: "user-1" },
		);
	});
});
