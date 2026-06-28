import { describe, expect, test } from "bun:test";
import { isAllowedCorsOrigin } from "./cors-origin";

describe("API CORS origins", () => {
	test("does not allow arbitrary credentialed localhost origins in production", () => {
		expect(
			isAllowedCorsOrigin({
				allowLocalhost: false,
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "production",
				origin: "http://localhost:48733",
			}),
		).toBe(false);
		expect(
			isAllowedCorsOrigin({
				allowLocalhost: false,
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "production",
				origin: "http://127.0.0.1:48733",
			}),
		).toBe(false);
	});

	test("does not treat the online service profile as localhost CORS approval", () => {
		const originalOnlineService = process.env.SUPERSET_ONLINE_SERVICE;
		const originalAllowLocalhost = process.env.SUPERSET_ALLOW_LOCALHOST_CORS;
		process.env.SUPERSET_ONLINE_SERVICE = "1";
		delete process.env.SUPERSET_ALLOW_LOCALHOST_CORS;
		try {
			expect(
				isAllowedCorsOrigin({
					allowedOrigins: ["https://app.superset.sh"],
					nodeEnv: "production",
					origin: "http://localhost:48733",
				}),
			).toBe(false);
		} finally {
			if (originalOnlineService === undefined) {
				delete process.env.SUPERSET_ONLINE_SERVICE;
			} else {
				process.env.SUPERSET_ONLINE_SERVICE = originalOnlineService;
			}
			if (originalAllowLocalhost === undefined) {
				delete process.env.SUPERSET_ALLOW_LOCALHOST_CORS;
			} else {
				process.env.SUPERSET_ALLOW_LOCALHOST_CORS = originalAllowLocalhost;
			}
		}
	});

	test("allows development localhost and explicit configured origins", () => {
		expect(
			isAllowedCorsOrigin({
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "development",
				origin: "http://localhost:48733",
			}),
		).toBe(true);
		expect(
			isAllowedCorsOrigin({
				allowedOrigins: ["http://localhost:48733"],
				nodeEnv: "production",
				origin: "http://localhost:48733",
			}),
		).toBe(true);
	});

	test("allows localhost origins for explicit online-like local services", () => {
		expect(
			isAllowedCorsOrigin({
				allowLocalhost: true,
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "production",
				origin: "http://localhost:3280",
			}),
		).toBe(true);
	});
});
