/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "superset-online.sh"), {
	encoding: "utf8",
});

function shellExpansion(value: string): string {
	return `$${"{"}${value}}`;
}

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

	test("removes orphaned containers after online service topology changes", () => {
		expect(SOURCE).toContain(
			"compose up -d --remove-orphans --no-build postgres electric redis minio",
		);
		expect(SOURCE).toContain(
			"compose up -d --remove-orphans --no-build kv-rest",
		);
		expect(SOURCE).toContain("compose down --remove-orphans");
	});

	test("supports an explicit loaded desktop fixture mode", () => {
		const packageJson = readFileSync(
			join(import.meta.dir, "..", "package.json"),
			{
				encoding: "utf8",
			},
		);

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

	test("supports a lower-memory desktop online profile without the web app", () => {
		const packageJson = readFileSync(
			join(import.meta.dir, "..", "package.json"),
			{
				encoding: "utf8",
			},
		);

		expect(SOURCE).toContain("SUPERSET_ONLINE_PROFILE");
		expect(SOURCE).toContain("unknown SUPERSET_ONLINE_PROFILE");
		expect(SOURCE).toContain(
			"skipping Web standalone artifact build for SUPERSET_ONLINE_PROFILE=$ONLINE_PROFILE",
		);
		expect(SOURCE).toContain(
			"stopping web service for SUPERSET_ONLINE_PROFILE=$ONLINE_PROFILE",
		);
		expect(SOURCE).toContain("services=(api relay electric-proxy)");
		expect(SOURCE).toContain('if [[ "$ONLINE_PROFILE" == "full" ]]');
		expect(SOURCE).toContain(
			"web probe skipped (SUPERSET_ONLINE_PROFILE=$ONLINE_PROFILE)",
		);
		expect(SOURCE).toContain("SUPERSET_ONLINE_SKIP_DOCKER_BUILD");
		expect(SOURCE).toContain(
			"skipping Docker app image build because SUPERSET_ONLINE_SKIP_DOCKER_BUILD/SUPERSET_ONLINE_SKIP_BUILD is set",
		);
		expect(SOURCE).toContain(
			'printf \'  - %-24s skipped SUPERSET_ONLINE_PROFILE=%s\\n\' "web /sign-in" "$ONLINE_PROFILE"',
		);
		expect(packageJson).toContain(
			'online:start:desktop": "SUPERSET_ONLINE_PROFILE=desktop',
		);
		expect(packageJson).toContain(
			'online:start:desktop:loaded": "SUPERSET_ONLINE_PROFILE=desktop SUPERSET_ONLINE_LOAD_FIXTURE=1',
		);
	});

	test("keeps MinIO local by default and exposes only the API port when requested", () => {
		const composeFile = readFileSync(
			join(import.meta.dir, "..", "docker-compose.yml"),
			{
				encoding: "utf8",
			},
		);

		expect(composeFile).toContain(
			"$" + "{LOCAL_S3_BIND_HOST:-127.0.0.1}:$" + "{LOCAL_S3_PORT:-9000}:9000",
		);
		expect(composeFile).toContain(
			"$" +
				"{LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1}:$" +
				"{LOCAL_S3_CONSOLE_PORT:-9001}:9001",
		);
		expect(SOURCE).toContain("SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC");
		expect(SOURCE).toContain(
			'export LOCAL_S3_BIND_HOST="$' + '{LOCAL_S3_BIND_HOST:-0.0.0.0}"',
		);
		expect(SOURCE).toContain(
			'export LOCAL_S3_CONSOLE_BIND_HOST="$' +
				'{LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1}"',
		);
		expect(SOURCE).toContain(
			"resource-pack downloads only; do not expose $" +
				"{ONLINE_S3_CONSOLE_PORT}",
		);
		expect(SOURCE).toContain("minio_api_published_host");
		expect(SOURCE).toContain(
			'docker port "$' + '{COMPOSE_PROJECT_NAME}-minio-1" 9000/tcp',
		);
		expect(SOURCE).toContain('if minio_api_is_public "$runtime_s3_bind_host"');
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
		const composeFile = readFileSync(
			join(import.meta.dir, "..", "docker-compose.yml"),
			{
				encoding: "utf8",
			},
		);

		expect(SOURCE).toContain("SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC");
		expect(SOURCE).toContain(
			`export LOCAL_S3_BIND_HOST="${shellExpansion("LOCAL_S3_BIND_HOST:-0.0.0.0")}"`,
		);
		expect(SOURCE).toContain(
			`export LOCAL_S3_CONSOLE_BIND_HOST="${shellExpansion("LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1")}"`,
		);
		expect(composeFile).toContain(
			`${shellExpansion("LOCAL_S3_BIND_HOST:-127.0.0.1")}:${shellExpansion("LOCAL_S3_PORT:-9000")}:9000`,
		);
		expect(composeFile).toContain(
			`${shellExpansion("LOCAL_S3_CONSOLE_BIND_HOST:-127.0.0.1")}:${shellExpansion("LOCAL_S3_CONSOLE_PORT:-9001")}:9001`,
		);
		expect(composeFile).toContain(
			`mc anonymous set download "superset/${shellExpansion("SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts")}/packs"`,
		);
	});

	test("does not enable arbitrary localhost credentialed CORS for online API", () => {
		expect(SOURCE).toContain('export SUPERSET_ALLOW_LOCALHOST_CORS="0"');
		expect(SOURCE).toContain(
			'write_env_var "SUPERSET_ALLOW_LOCALHOST_CORS" "0"',
		);
		expect(SOURCE).not.toContain('export SUPERSET_ALLOW_LOCALHOST_CORS="1"');
		expect(SOURCE).not.toContain(
			'write_env_var "SUPERSET_ALLOW_LOCALHOST_CORS" "1"',
		);
	});
});
