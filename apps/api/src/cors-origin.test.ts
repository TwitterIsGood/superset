import { describe, expect, test } from "bun:test";
import { isAllowedCorsOrigin } from "./cors-origin";

describe("API CORS origins", () => {
	test("does not allow arbitrary credentialed localhost origins in production", () => {
		expect(
			isAllowedCorsOrigin({
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "production",
				origin: "http://localhost:48733",
			}),
		).toBe(false);
		expect(
			isAllowedCorsOrigin({
				allowedOrigins: ["https://app.superset.sh"],
				nodeEnv: "production",
				origin: "http://127.0.0.1:48733",
			}),
		).toBe(false);
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
});
