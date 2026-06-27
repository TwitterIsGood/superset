/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "superset-online.sh"), {
	encoding: "utf8",
});

describe("superset online public URL defaults", () => {
	test("uses the configured public HTTP domain by default", () => {
		expect(SOURCE).toMatch(
			/PUBLIC_SCHEME="\$\{SUPERSET_PUBLIC_SCHEME:-http\}"/,
		);
		expect(SOURCE).toMatch(
			/PUBLIC_API_URL="\$\{SUPERSET_PUBLIC_API_URL:-\$\{PUBLIC_SCHEME\}:\/\/\$\{PUBLIC_DOMAIN\}:63001\}"/,
		);
		expect(SOURCE).not.toContain('PUBLIC_API_URL="http://bj1.v.lhb.ink');
	});

	test("syncs only mobile public URL keys into apps/mobile/.env.local", () => {
		expect(SOURCE).toContain("write_mobile_env_file");
		expect(SOURCE).toContain("SUPERSET_MOBILE_PROFILE");
		expect(SOURCE).toContain("EXPO_PUBLIC_SUPERSET_PROFILE");
		expect(SOURCE).toContain("EXPO_PUBLIC_API_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_ELECTRIC_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_WEB_URL");
		expect(SOURCE).toContain("EXPO_PUBLIC_RELAY_URL");
		expect(SOURCE).not.toContain("EXPO_PUBLIC_POSTHOG_KEY=");
	});

	test("connects app services directly to Postgres instead of Neon proxy", () => {
		expect(SOURCE).toContain(
			'CONTAINER_DATABASE_URL="postgres://postgres:postgres@postgres:5432/main"',
		);
		expect(SOURCE).toMatch(
			/HOST_DATABASE_URL="postgres:\/\/postgres:postgres@localhost:\$\{ONLINE_PG_PORT\}\/main"/,
		);
		expect(SOURCE).not.toContain("neon-proxy:4444");
		expect(SOURCE).not.toContain("wait_for_db_proxy_query");
	});

	test("supports an explicit loaded desktop fixture mode", () => {
		const packageJson = readFileSync(join(import.meta.dir, "..", "package.json"), {
			encoding: "utf8",
		});

		expect(SOURCE).toContain("SUPERSET_ONLINE_LOAD_FIXTURE");
		expect(SOURCE).toContain("ensure_desktop_perf_fixture_if_requested");
		expect(SOURCE).toContain("desktop:perf-fixture -- ensure");
		expect(SOURCE).toContain("desktop:perf-fixture -- stats");
		expect(SOURCE).toContain("dense desktop fixture:");
		expect(SOURCE).toContain("run: bun run online:start:loaded");
		expect(packageJson).toContain(
			'online:start:loaded": "SUPERSET_ONLINE_LOAD_FIXTURE=1',
		);
	});

	test("status reports online-like memory attribution", () => {
		expect(SOURCE).toContain("print_memory_status");
		expect(SOURCE).toContain("online_docker_memory_kib");
		expect(SOURCE).toContain("docker stats --no-stream");
		expect(SOURCE).toContain('echo "memory:"');
		expect(SOURCE).toContain("top containers:");
		expect(SOURCE).toContain(
			'print_memory_status\n\techo\n\techo "local probes:"',
		);
	});

	test("can expose only the MinIO API for public resource-pack downloads", () => {
		const composeFile = readFileSync(join(import.meta.dir, "..", "docker-compose.yml"), {
			encoding: "utf8",
		});

		expect(SOURCE).toContain("SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC");
		expect(SOURCE).toContain(
			'export LOCAL_S3_BIND_HOST="${LOCAL_S3_BIND_HOST:-0.0.0.0}"',
		);
		expect(SOURCE).toContain(
			'export LOCAL_S3_CONSOLE_BIND_HOST="${LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1}"',
		);
		expect(composeFile).toContain(
			"${LOCAL_S3_BIND_HOST:-127.0.0.1}:${LOCAL_S3_PORT:-9000}:9000",
		);
		expect(composeFile).toContain(
			"${LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1}:${LOCAL_S3_CONSOLE_PORT:-9001}:9001",
		);
		expect(composeFile).toContain(
			'mc anonymous set download "superset/${SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}/packs"',
		);
	});
});
