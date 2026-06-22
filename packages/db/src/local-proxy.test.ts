/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { neonConfig } from "@neondatabase/serverless";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";

describe("local Neon proxy configuration", () => {
	test("detects local proxy database URLs", () => {
		expect(
			isLocalProxy("postgres://postgres:postgres@db.localtest.me:3015/main"),
		).toBe(true);
		expect(
			isLocalProxy("postgres://postgres:postgres@localhost:3015/main"),
		).toBe(false);
	});

	test("routes local proxy traffic through loopback instead of DNS", () => {
		configureLocalProxy();

		expect(typeof neonConfig.fetchEndpoint).toBe("function");
		expect(typeof neonConfig.wsProxy).toBe("function");

		if (
			typeof neonConfig.fetchEndpoint !== "function" ||
			typeof neonConfig.wsProxy !== "function"
		) {
			throw new Error("local proxy endpoints were not configured as functions");
		}

		expect(neonConfig.fetchEndpoint("db.localtest.me", 3015)).toBe(
			"http://127.0.0.1:3015/sql",
		);
		expect(neonConfig.wsProxy("db.localtest.me", 3015)).toBe(
			"127.0.0.1:3015/v2",
		);
		expect(neonConfig.useSecureWebSocket).toBe(false);
	});
});
