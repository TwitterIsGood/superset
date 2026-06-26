import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workRoot: string;

beforeEach(() => {
	workRoot = mkdtempSync(join(tmpdir(), "superset-worktree-shell-"));
});

afterEach(() => {
	rmSync(workRoot, { recursive: true, force: true });
});

function runBash(script: string) {
	return spawnSync("bash", ["-lc", script], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
	});
}

function shellString(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function shellExpansion(value: string): string {
	return `$${"{"}${value}}`;
}

describe("worktree local shell helpers", () => {
	test("does not force an 8GB V8 heap for desktop worktree dev", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).not.toContain("NODE_OPTIONS=--max-old-space-size=8192");
	});

	test("caps only the desktop dev runner heap with an override escape hatch", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).toContain("SUPERSET_DESKTOP_DEV_NODE_OPTIONS");
		expect(script).toContain('export NODE_OPTIONS="--max-old-space-size=2048"');
		expect(script).toContain(
			`export NODE_OPTIONS="${shellExpansion("SUPERSET_DESKTOP_DEV_NODE_OPTIONS")}${shellExpansion("NODE_OPTIONS:+ $NODE_OPTIONS")}"`,
		);
		expect(script).toContain(
			"exec ./node_modules/.bin/electron-vite dev --watch",
		);
	});

	test("caps only the local API dev runner heap with an override escape hatch", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).toContain("SUPERSET_API_DEV_NODE_OPTIONS");
		expect(script).toContain('export NODE_OPTIONS="--max-old-space-size=768"');
		expect(script).toContain(
			`export NODE_OPTIONS="${shellExpansion("SUPERSET_API_DEV_NODE_OPTIONS")}${shellExpansion("NODE_OPTIONS:+ $NODE_OPTIONS")}"`,
		);
		expect(script).toContain(
			'exec ./node_modules/.bin/next dev --port "$API_PORT"',
		);
	});

	test("defines a desktop-lite profile that skips only the local API app session", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).toContain("WORKTREE_DEV_PROFILE");
		expect(script).toContain(
			'full)\n      SESSIONS=("api" "relay" "electric-proxy" "desktop")',
		);
		expect(script).toContain(
			'desktop-lite)\n      SESSIONS=("relay" "electric-proxy" "desktop")',
		);
		expect(script).toContain("WORKTREE_DEV_REQUIRES_LOCAL_API=0");
		expect(script).toContain("WORKTREE_DEV_REQUIRES_LOCAL_DATA=1");
	});

	test("defines a desktop online-lite profile that uses external loaded app services", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");
		const packageJson = readFileSync("package.json", "utf8");

		expect(script).toContain(
			'desktop-online-lite)\n      SESSIONS=("desktop")',
		);
		expect(script).toContain("WORKTREE_DEV_REQUIRES_LOCAL_DATA=0");
		expect(script).toContain("WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES=1");
		expect(script).toContain(
			`WORKTREE_DEV_EXTERNAL_API_URL="${shellExpansion("WORKTREE_DEV_EXTERNAL_API_URL:-http://localhost:43001")}"`,
		);
		expect(script).toContain(
			`WORKTREE_DEV_EXTERNAL_ELECTRIC_URL="${shellExpansion("WORKTREE_DEV_EXTERNAL_ELECTRIC_URL:-http://localhost:43012")}"`,
		);
		expect(script).toContain(
			`WORKTREE_DEV_EXTERNAL_RELAY_URL="${shellExpansion("WORKTREE_DEV_EXTERNAL_RELAY_URL:-http://localhost:43013")}"`,
		);
		expect(script).toContain(
			`SUPERSET_DESKTOP_PROXY_API_TARGET="${shellExpansion("SUPERSET_DESKTOP_PROXY_API_TARGET:-$WORKTREE_DEV_EXTERNAL_API_URL")}"`,
		);
		expect(script).toContain(
			`WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN="${shellExpansion("WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN:-http://bj1.v.lhb.ink:63000")}"`,
		);
		expect(script).toContain(
			`SUPERSET_DESKTOP_PROXY_ORIGIN="${shellExpansion("SUPERSET_DESKTOP_PROXY_ORIGIN:-$WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN")}"`,
		);
		expect(script).toContain(
			`SUPERSET_DESKTOP_TARGET_API_URL="${shellExpansion(`SUPERSET_DESKTOP_TARGET_API_URL:-http://localhost:${shellExpansion("DESKTOP_VITE_PORT")}`)}"`,
		);
		expect(script).toContain(
			'NEXT_PUBLIC_API_URL="$SUPERSET_DESKTOP_TARGET_API_URL"',
		);
		expect(script).toContain(
			"expected external loaded source: bun run online:start:loaded",
		);
		expect(script).toContain(
			`wait_for_probe "external api session" "${shellExpansion("WORKTREE_DEV_EXTERNAL_API_URL")}/api/auth/get-session" "200"`,
		);
		expect(script).toContain(
			`probe_url "external electric" "${shellExpansion("WORKTREE_DEV_EXTERNAL_ELECTRIC_URL")}/v1/shape" "401"`,
		);
		expect(packageJson).toContain(
			'dev:worktree:start:online-lite": "WORKTREE_DEV_PROFILE=desktop-online-lite',
		);
		expect(packageJson).toContain(
			'dev:worktree:start:online-lite:loaded": "WORKTREE_DEV_PROFILE=desktop-online-lite WORKTREE_DEV_LOAD_FIXTURE=1',
		);
		expect(packageJson).toContain(
			'dev:worktree:status:online-lite": "WORKTREE_DEV_PROFILE=desktop-online-lite',
		);
	});

	test("desktop-lite status and readiness skip the local API probe", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");
		const packageJson = readFileSync("package.json", "utf8");

		expect(script).toContain(
			"api session skipped (WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE",
		);
		expect(script).toContain(
			'printf \'  - %-24s skipped %s\\n\' "api session" "$NEXT_PUBLIC_API_URL"',
		);
		expect(packageJson).toContain(
			'dev:worktree:start:lite": "WORKTREE_DEV_PROFILE=desktop-lite',
		);
		expect(script).toContain("desktop_lite_uses_skipped_local_api");
		expect(script).toContain(
			"login and API mutations need an already running API or a different .env API URL",
		);
	});

	test("loaded worktree profile ensures and reports dense desktop data", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");
		const packageJson = readFileSync("package.json", "utf8");

		expect(script).toContain("WORKTREE_DEV_LOAD_FIXTURE");
		expect(script).toContain("ensure_desktop_perf_fixture_if_requested");
		expect(script).toContain("desktop:perf-fixture -- ensure");
		expect(script).toContain("desktop:perf-fixture -- stats");
		expect(script).toContain("dense desktop fixture:");
		expect(script).toContain("run: bun run dev:worktree:start:loaded");
		expect(packageJson).toContain(
			'dev:worktree:start:loaded": "WORKTREE_DEV_LOAD_FIXTURE=1',
		);
		expect(packageJson).toContain(
			'dev:worktree:start:lite:loaded": "WORKTREE_DEV_PROFILE=desktop-lite WORKTREE_DEV_LOAD_FIXTURE=1',
		);
		expect(packageJson).toContain(
			'dev:worktree:start:online-lite:loaded": "WORKTREE_DEV_PROFILE=desktop-online-lite WORKTREE_DEV_LOAD_FIXTURE=1',
		);
		expect(packageJson).toContain(
			'desktop:perf-fixture:loaded": "bun run desktop:perf-fixture -- ensure --slug desktop-perf-loaded',
		);
	});

	test("profile switches stop app sessions that are no longer managed", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).toContain(
			'ALL_APP_SESSIONS=("api" "relay" "electric-proxy" "desktop")',
		);
		expect(script).toContain(
			"Stopping $session (not part of WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE)",
		);
		expect(script).toContain(
			'for session in "$' + '{ALL_APP_SESSIONS[@]}"; do',
		);
	});

	test("profile switches restart desktop so Vite-injected service URLs refresh", () => {
		const script = readFileSync(".superset/worktree-dev.sh", "utf8");

		expect(script).toContain('PROFILE_MARKER_PATH="$RUN_DIR/active-profile"');
		expect(script).toContain("restart_desktop_if_profile_changed");
		expect(script).toContain('session_in_active_profile "desktop" || return 0');
		expect(script).toContain('tmux_session_exists "desktop" || return 0');
		expect(script).toContain(
			"Restarting desktop for WORKTREE_DEV_PROFILE change",
		);
		expect(script).toContain(
			'tmux -S "$TMUX_SOCKET_PATH" kill-session -t "desktop"',
		);
		expect(script).toContain(
			'printf \'%s\\n\' "$WORKTREE_DEV_PROFILE" > "$PROFILE_MARKER_PATH"',
		);
	});

	test("data service startup reuses cached images unless rebuild is requested", () => {
		const worktreeScript = readFileSync(".superset/worktree-dev.sh", "utf8");
		const onlineScript = readFileSync("scripts/superset-online.sh", "utf8");

		expect(worktreeScript).not.toContain("compose up -d --build --wait");
		expect(worktreeScript).not.toContain("compose up -d --build postgres");
		expect(worktreeScript).toContain("WORKTREE_DEV_REBUILD_DATA");
		expect(worktreeScript).toContain(
			"docker image inspect superset-local-kv-rest:latest",
		);
		expect(worktreeScript).toContain(
			'local services=("postgres" "neon-proxy" "electric" "redis" "kv-rest" "minio")',
		);

		expect(onlineScript).not.toContain("compose up -d --build --wait");
		expect(onlineScript).not.toContain("compose up -d --build postgres");
		expect(onlineScript).toContain("SUPERSET_ONLINE_REBUILD_DATA");
		expect(onlineScript).toContain(
			"docker image inspect superset-local-kv-rest:latest",
		);
	});

	test("minio bucket initialization is bounded instead of an infinite startup blocker", () => {
		const worktreeScript = readFileSync(".superset/worktree-dev.sh", "utf8");
		const onlineScript = readFileSync("scripts/superset-online.sh", "utf8");

		expect(worktreeScript).not.toContain("compose run --rm minio-init");
		expect(worktreeScript).toContain("WORKTREE_DEV_MINIO_INIT_ATTEMPTS");
		expect(worktreeScript).toContain(
			'while [ "$attempt" -le "$' + '{MINIO_INIT_ATTEMPTS:-30}" ]; do',
		);
		expect(worktreeScript).toContain("S3-dependent flows may need retry");
		expect(worktreeScript).toContain("compose rm -sf minio-init");

		expect(onlineScript).not.toContain("compose run --rm minio-init");
		expect(onlineScript).toContain("SUPERSET_ONLINE_MINIO_INIT_ATTEMPTS");
		expect(onlineScript).toContain(
			'while [ "$attempt" -le "$' + '{MINIO_INIT_ATTEMPTS:-30}" ]; do',
		);
		expect(onlineScript).toContain("compose rm -sf minio-init");
	});

	test("minio init bypasses host proxy for the compose service hostname", () => {
		const worktreeScript = readFileSync(".superset/worktree-dev.sh", "utf8");
		const onlineScript = readFileSync("scripts/superset-online.sh", "utf8");
		const composeFile = readFileSync("docker-compose.yml", "utf8");

		expect(worktreeScript).toContain('NO_PROXY="localhost,127.0.0.1,minio"');
		expect(worktreeScript).toContain('no_proxy="localhost,127.0.0.1,minio"');
		expect(onlineScript).toContain('NO_PROXY="localhost,127.0.0.1,minio"');
		expect(onlineScript).toContain('no_proxy="localhost,127.0.0.1,minio"');
		expect(composeFile).toContain("NO_PROXY: localhost,127.0.0.1,minio");
		expect(composeFile).toContain("no_proxy: localhost,127.0.0.1,minio");
	});

	test("minio keeps artifacts private while allowing resource pack downloads", () => {
		const worktreeScript = readFileSync(".superset/worktree-dev.sh", "utf8");
		const onlineScript = readFileSync("scripts/superset-online.sh", "utf8");
		const composeFile = readFileSync("docker-compose.yml", "utf8");

		for (const source of [worktreeScript, onlineScript, composeFile]) {
			expect(source).toContain(
				'mc anonymous set none "superset/$' +
					'{SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}"',
			);
			expect(source).toContain(
				'mc anonymous set download "superset/$' +
					'{SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}/packs"',
			);
		}
	});

	test("derives different default compose projects for same-named worktree paths", () => {
		const first = join(workRoot, "first", "superset");
		const second = join(workRoot, "second", "superset");
		mkdirSync(first, { recursive: true });
		mkdirSync(second, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/worktree-local.sh
			first_project="$(worktree_default_db_project ${shellString(first)})"
			second_project="$(worktree_default_db_project ${shellString(second)})"
			[[ "$first_project" == superset-superset-* ]]
			[[ "$second_project" == superset-superset-* ]]
			[[ "$first_project" != "$second_project" ]]
		`);

		expect(result.status).toBe(0);
	});

	test("detects missing or stale managed local setup", () => {
		const root = join(workRoot, "review", "superset");
		const envPath = join(workRoot, ".env");
		mkdirSync(root, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			env_path=${shellString(envPath)}
			id="$(worktree_path_hash "$root")"
			cat > "$env_path" <<ENV
# ===== Local workspace overrides (setup.local.sh) =====
SUPERSET_WORKTREE_ID="$id"
SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
SUPERSET_PORT_BASE="3000"
LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
LOCAL_PG_PORT="3014"
LOCAL_NEON_PROXY_PORT="3015"
LOCAL_ELECTRIC_PORT="3009"
LOCAL_REDIS_PORT="3016"
LOCAL_KV_REST_PORT="3017"
LOCAL_S3_PORT="3019"
LOCAL_S3_CONSOLE_PORT="3020"
API_PORT="3001"
DESKTOP_VITE_PORT="3005"
CADDY_ELECTRIC_PORT="3010"
WRANGLER_PORT="3012"
RELAY_PORT="3013"
DATABASE_URL="postgres://postgres:postgres@localhost:3015/main"
DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
KV_REST_API_URL="http://localhost:3017"
KV_URL="redis://localhost:3016"
ELECTRIC_URL="http://localhost:3009/v1/shape"
NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"
NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
RELAY_URL="http://localhost:3013"
NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
ENV
			if worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
			cp "$env_path" "$env_path.local"
			sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"|' "$env_path"
			if ! worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
			cp "$env_path.local" "$env_path"
			sed -i.bak 's|^NEXT_PUBLIC_ELECTRIC_URL=.*|NEXT_PUBLIC_ELECTRIC_URL="https://localhost:3010"|' "$env_path"
			if ! worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
			cp "$env_path.local" "$env_path"
			sed -i.bak 's/^SUPERSET_WORKTREE_ID=.*/SUPERSET_WORKTREE_ID="stale"/' "$env_path"
			if ! worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
		`);

		expect(result.status).toBe(0);
	}, 10_000);

	test("rejects non-local service URLs before destructive worktree actions", () => {
		const root = join(workRoot, "remote-env", "superset");
		mkdirSync(root, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/common.sh
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			export SUPERSET_WORKTREE_ID="$(worktree_path_hash "$root")"
			export SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
			export SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
			export SUPERSET_PORT_BASE=3000
			export LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
			export LOCAL_PG_PORT=3014
			export LOCAL_NEON_PROXY_PORT=3015
			export LOCAL_ELECTRIC_PORT=3009
			export LOCAL_REDIS_PORT=3016
			export LOCAL_KV_REST_PORT=3017
			export API_PORT=3001
			export DESKTOP_VITE_PORT=3005
			export WRANGLER_PORT=3012
			export CADDY_ELECTRIC_PORT=3010
			export RELAY_PORT=3013
			export DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"
			export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
			export KV_REST_API_URL="http://localhost:3017"
			export KV_URL="redis://localhost:3016"
			export ELECTRIC_URL="http://localhost:3009/v1/shape"
			export NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"
			export NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"
			export NEXT_PUBLIC_API_URL="http://localhost:3001"
			export NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
			export RELAY_URL="http://localhost:3013"
			export NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
			if worktree_assert_current_local_env "$root"; then
				exit 1
			fi
		`);

		expect(result.status).toBe(0);
		expect(result.stderr + result.stdout).toContain("DATABASE_URL");
	});

	test("rejects caddy Electric URLs because worktree dev only starts Wrangler", () => {
		const root = join(workRoot, "caddy-env", "superset");
		mkdirSync(root, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/common.sh
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			export SUPERSET_WORKTREE_ID="$(worktree_path_hash "$root")"
			export SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
			export SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
			export SUPERSET_PORT_BASE=3000
			export LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
			export LOCAL_PG_PORT=3014
			export LOCAL_NEON_PROXY_PORT=3015
			export LOCAL_ELECTRIC_PORT=3009
			export LOCAL_REDIS_PORT=3016
			export LOCAL_KV_REST_PORT=3017
			export API_PORT=3001
			export DESKTOP_VITE_PORT=3005
			export WRANGLER_PORT=3012
			export CADDY_ELECTRIC_PORT=3010
			export RELAY_PORT=3013
			export DATABASE_URL="postgres://postgres:postgres@localhost:3015/main"
			export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
			export KV_REST_API_URL="http://localhost:3017"
			export KV_URL="redis://localhost:3016"
			export ELECTRIC_URL="http://localhost:3009/v1/shape"
			export NEXT_PUBLIC_ELECTRIC_URL="https://localhost:3010"
			export NEXT_PUBLIC_ELECTRIC_PROXY_URL="https://localhost:3010"
			export NEXT_PUBLIC_API_URL="http://localhost:3001"
			export NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
			export RELAY_URL="http://localhost:3013"
			export NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
			if worktree_assert_current_local_env "$root"; then
				exit 1
			fi
		`);

		expect(result.status).toBe(0);
		expect(result.stderr + result.stdout).toContain("Wrangler Electric proxy");
	});
});
