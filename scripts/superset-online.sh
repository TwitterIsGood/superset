#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SUPERSET_ONLINE_ROOT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BASE_ENV_PATH="${SUPERSET_ONLINE_BASE_ENV_FILE:-$ROOT_DIR/.env}"
ONLINE_ENV_PATH="${SUPERSET_ONLINE_ENV_FILE:-$ROOT_DIR/.env.online}"
COMPOSE_PROJECT_NAME="${SUPERSET_ONLINE_COMPOSE_PROJECT:-superset-online}"
ONLINE_BUILD_DIR="${SUPERSET_ONLINE_BUILD_DIR:-$ROOT_DIR/.online-build}"
RUN_DIR="${SUPERSET_ONLINE_RUN_DIR:-$ROOT_DIR/.tmp/online-service}"
MOBILE_ENV_PATH="${SUPERSET_ONLINE_MOBILE_ENV_FILE:-$ROOT_DIR/apps/mobile/.env.local}"

LAUNCH_AGENT_LABEL="com.superset.online"
LAUNCH_AGENT_PATH="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
LAUNCH_SUPPORT_DIR="$HOME/Library/Application Support/Superset"
TMUX_SOCKET_PATH="${SUPERSET_ONLINE_TMUX_SOCKET:-$LAUNCH_SUPPORT_DIR/online-tmux.sock}"

ONLINE_WEB_PORT="43000"
ONLINE_API_PORT="43001"
ONLINE_ELECTRIC_PROXY_PORT="43012"
ONLINE_RELAY_PORT="43013"
ONLINE_ELECTRIC_PORT="43009"
ONLINE_PG_PORT="43014"
ONLINE_REDIS_PORT="43016"
ONLINE_KV_REST_PORT="43017"
ONLINE_S3_PORT="43018"
ONLINE_S3_CONSOLE_PORT="43019"

PUBLIC_DEFAULT_DOMAIN="bj1.v.lhb.ink"
PUBLIC_SCHEME="${SUPERSET_PUBLIC_SCHEME:-http}"
PUBLIC_DOMAIN="${SUPERSET_PUBLIC_DOMAIN:-$PUBLIC_DEFAULT_DOMAIN}"
PUBLIC_WEB_URL="${SUPERSET_PUBLIC_WEB_URL:-${PUBLIC_SCHEME}://${PUBLIC_DOMAIN}:63000}"
PUBLIC_API_URL="${SUPERSET_PUBLIC_API_URL:-${PUBLIC_SCHEME}://${PUBLIC_DOMAIN}:63001}"
PUBLIC_ELECTRIC_URL="${SUPERSET_PUBLIC_ELECTRIC_URL:-${PUBLIC_SCHEME}://${PUBLIC_DOMAIN}:63012}"
PUBLIC_RELAY_URL="${SUPERSET_PUBLIC_RELAY_URL:-${PUBLIC_SCHEME}://${PUBLIC_DOMAIN}:63013}"
MOBILE_PROFILE="${SUPERSET_MOBILE_PROFILE:-online-canary}"

HOST_DATABASE_URL="postgres://postgres:postgres@localhost:${ONLINE_PG_PORT}/main"
HOST_DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:${ONLINE_PG_PORT}/main"
CONTAINER_DATABASE_URL="postgres://postgres:postgres@postgres:5432/main"
CONTAINER_DATABASE_URL_UNPOOLED="postgres://postgres:postgres@postgres:5432/main"

export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"

log() {
	printf '[superset-online] %s\n' "$*"
}

fail() {
	printf '[superset-online] ERROR: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

escape_env_value() {
	local value="$1"
	value="${value//\\/\\\\}"
	value="${value//\"/\\\"}"
	value="${value//\$/\\\$}"
	value="${value//\`/\\\`}"
	printf '%s' "$value"
}

write_env_var() {
	local key="$1"
	local value="${2:-}"
	printf '%s="%s"\n' "$key" "$(escape_env_value "$value")"
}

load_base_env() {
	if [[ -f "$BASE_ENV_PATH" ]]; then
		set -a
		# shellcheck source=/dev/null
		source "$BASE_ENV_PATH"
		set +a
	fi
}

apply_host_env() {
	export NODE_ENV="production"
	export SUPERSET_ONLINE_SERVICE="1"
	export SUPERSET_HOME_DIR="${SUPERSET_ONLINE_HOME_DIR:-$RUN_DIR/superset-home}"
	export SUPERSET_NEXT_DIST_DIR=".next-online"

	export LOCAL_PG_PORT="$ONLINE_PG_PORT"
	unset LOCAL_NEON_PROXY_PORT
	export LOCAL_ELECTRIC_PORT="$ONLINE_ELECTRIC_PORT"
	export LOCAL_REDIS_PORT="$ONLINE_REDIS_PORT"
	export LOCAL_KV_REST_PORT="$ONLINE_KV_REST_PORT"
	export LOCAL_S3_PORT="$ONLINE_S3_PORT"
	export LOCAL_S3_CONSOLE_PORT="$ONLINE_S3_CONSOLE_PORT"

	export DATABASE_URL="$HOST_DATABASE_URL"
	export DATABASE_URL_UNPOOLED="$HOST_DATABASE_URL_UNPOOLED"
	export KV_REST_API_TOKEN="${KV_REST_API_TOKEN:-local-kv-token}"
	export KV_REST_API_URL="http://localhost:${ONLINE_KV_REST_PORT}"
	export KV_URL="redis://localhost:${ONLINE_REDIS_PORT}"

	export MINIO_ROOT_USER="${MINIO_ROOT_USER:-superset}"
	export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-superset-local-artifacts}"
	export SUPERSET_OBJECT_STORAGE_ENDPOINT="http://localhost:${ONLINE_S3_PORT}"
	export SUPERSET_OBJECT_STORAGE_BUCKET="${SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}"
	export SUPERSET_OBJECT_STORAGE_REGION="${SUPERSET_OBJECT_STORAGE_REGION:-us-east-1}"
	export SUPERSET_OBJECT_STORAGE_ACCESS_KEY="$MINIO_ROOT_USER"
	export SUPERSET_OBJECT_STORAGE_SECRET_KEY="$MINIO_ROOT_PASSWORD"
	export SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE="1"

	export ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"
	export ELECTRIC_URL="http://localhost:${ONLINE_ELECTRIC_PORT}/v1/shape"
	export ELECTRIC_SHAPE_URL="$ELECTRIC_URL"
	export AUTH_URL="$PUBLIC_API_URL"
	export AUTH_JWKS_URL="http://localhost:${ONLINE_API_PORT}"
	export RELAY_INTERNAL_API_URL="http://localhost:${ONLINE_API_PORT}"

	export WEB_PORT="$ONLINE_WEB_PORT"
	export API_PORT="$ONLINE_API_PORT"
	export WRANGLER_PORT="$ONLINE_ELECTRIC_PROXY_PORT"
	export RELAY_PORT="$ONLINE_RELAY_PORT"
	export ELECTRIC_PORT="$ONLINE_ELECTRIC_PORT"

	export NEXT_PUBLIC_WEB_URL="$PUBLIC_WEB_URL"
	export NEXT_PUBLIC_API_URL="$PUBLIC_API_URL"
	export NEXT_PUBLIC_ELECTRIC_URL="$PUBLIC_ELECTRIC_URL"
	export NEXT_PUBLIC_ELECTRIC_PROXY_URL="$PUBLIC_ELECTRIC_URL"
	export RELAY_URL="$PUBLIC_RELAY_URL"
	export NEXT_PUBLIC_RELAY_URL="$PUBLIC_RELAY_URL"
	export NEXT_PUBLIC_COOKIE_DOMAIN="$PUBLIC_DOMAIN"
	export SUPERSET_WEB_URL="$PUBLIC_WEB_URL"

	export SUPERSET_MOBILE_PROFILE="$MOBILE_PROFILE"
	export EXPO_PUBLIC_SUPERSET_PROFILE="$MOBILE_PROFILE"
	export EXPO_PUBLIC_API_URL="$PUBLIC_API_URL"
	export EXPO_PUBLIC_ELECTRIC_URL="$PUBLIC_ELECTRIC_URL"
	export EXPO_PUBLIC_WEB_URL="$PUBLIC_WEB_URL"
	export EXPO_PUBLIC_RELAY_URL="$PUBLIC_RELAY_URL"

	export NEXT_PUBLIC_MARKETING_URL="${NEXT_PUBLIC_MARKETING_URL:-$PUBLIC_WEB_URL}"
	export NEXT_PUBLIC_ADMIN_URL="${NEXT_PUBLIC_ADMIN_URL:-http://localhost:3003}"
	export NEXT_PUBLIC_DOCS_URL="${NEXT_PUBLIC_DOCS_URL:-http://localhost:3004}"
	export NEXT_PUBLIC_DESKTOP_URL="${NEXT_PUBLIC_DESKTOP_URL:-http://localhost:3005}"
	export NEXT_PUBLIC_STREAMS_URL="${NEXT_PUBLIC_STREAMS_URL:-http://localhost:3007}"
	export STREAMS_URL="${STREAMS_URL:-http://localhost:3007}"

	mkdir -p "$RUN_DIR" "$SUPERSET_HOME_DIR" "$(dirname "$ONLINE_ENV_PATH")"
}

write_online_env_file() {
	local managed_keys_re
	managed_keys_re='^(export[[:space:]]+)?(NODE_ENV|SUPERSET_ONLINE_SERVICE|SUPERSET_HOME_DIR|SUPERSET_NEXT_DIST_DIR|LOCAL_PG_PORT|LOCAL_NEON_PROXY_PORT|LOCAL_ELECTRIC_PORT|LOCAL_REDIS_PORT|LOCAL_KV_REST_PORT|LOCAL_S3_PORT|LOCAL_S3_CONSOLE_PORT|DATABASE_URL|DATABASE_URL_UNPOOLED|KV_REST_API_URL|KV_REST_API_TOKEN|KV_URL|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|SUPERSET_OBJECT_STORAGE_ENDPOINT|SUPERSET_OBJECT_STORAGE_BUCKET|SUPERSET_OBJECT_STORAGE_REGION|SUPERSET_OBJECT_STORAGE_ACCESS_KEY|SUPERSET_OBJECT_STORAGE_SECRET_KEY|SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE|ELECTRIC_SECRET|ELECTRIC_URL|ELECTRIC_SHAPE_URL|AUTH_URL|AUTH_JWKS_URL|RELAY_INTERNAL_API_URL|WEB_PORT|API_PORT|WRANGLER_PORT|RELAY_PORT|ELECTRIC_PORT|NEXT_PUBLIC_WEB_URL|NEXT_PUBLIC_API_URL|NEXT_PUBLIC_ELECTRIC_URL|NEXT_PUBLIC_ELECTRIC_PROXY_URL|NEXT_PUBLIC_RELAY_URL|RELAY_URL|NEXT_PUBLIC_COOKIE_DOMAIN|SUPERSET_WEB_URL|SUPERSET_MOBILE_PROFILE|EXPO_PUBLIC_SUPERSET_PROFILE|EXPO_PUBLIC_API_URL|EXPO_PUBLIC_ELECTRIC_URL|EXPO_PUBLIC_WEB_URL|EXPO_PUBLIC_RELAY_URL|NEXT_PUBLIC_MARKETING_URL|NEXT_PUBLIC_ADMIN_URL|NEXT_PUBLIC_DOCS_URL|NEXT_PUBLIC_DESKTOP_URL|NEXT_PUBLIC_STREAMS_URL|STREAMS_URL|FLY_REGION|FLY_MACHINE_ID|RELAY_PUBLIC_URL|RELAY_SYNTHETIC_JWT|NO_PROXY|no_proxy)='

	{
		if [[ -f "$BASE_ENV_PATH" ]]; then
			awk -v pattern="$managed_keys_re" '$0 !~ pattern { print }' "$BASE_ENV_PATH"
			printf '\n'
		fi
		printf '# --- Managed by scripts/superset-online.sh. Do not edit below. ---\n'
		write_env_var "NODE_ENV" "production"
		write_env_var "SUPERSET_ONLINE_SERVICE" "1"
		write_env_var "SUPERSET_HOME_DIR" "/var/lib/superset"
		write_env_var "SUPERSET_NEXT_DIST_DIR" ".next-online"
		write_env_var "LOCAL_PG_PORT" "$ONLINE_PG_PORT"
		write_env_var "LOCAL_ELECTRIC_PORT" "$ONLINE_ELECTRIC_PORT"
		write_env_var "LOCAL_REDIS_PORT" "$ONLINE_REDIS_PORT"
		write_env_var "LOCAL_KV_REST_PORT" "$ONLINE_KV_REST_PORT"
		write_env_var "LOCAL_S3_PORT" "$ONLINE_S3_PORT"
		write_env_var "LOCAL_S3_CONSOLE_PORT" "$ONLINE_S3_CONSOLE_PORT"
		write_env_var "DATABASE_URL" "$CONTAINER_DATABASE_URL"
		write_env_var "DATABASE_URL_UNPOOLED" "$CONTAINER_DATABASE_URL_UNPOOLED"
		write_env_var "KV_REST_API_TOKEN" "$KV_REST_API_TOKEN"
		write_env_var "KV_REST_API_URL" "http://kv-rest:80"
		write_env_var "KV_URL" "redis://redis:6379"
		write_env_var "MINIO_ROOT_USER" "$MINIO_ROOT_USER"
		write_env_var "MINIO_ROOT_PASSWORD" "$MINIO_ROOT_PASSWORD"
		write_env_var "SUPERSET_OBJECT_STORAGE_ENDPOINT" "http://minio:9000"
		write_env_var "SUPERSET_OBJECT_STORAGE_BUCKET" "$SUPERSET_OBJECT_STORAGE_BUCKET"
		write_env_var "SUPERSET_OBJECT_STORAGE_REGION" "$SUPERSET_OBJECT_STORAGE_REGION"
		write_env_var "SUPERSET_OBJECT_STORAGE_ACCESS_KEY" "$SUPERSET_OBJECT_STORAGE_ACCESS_KEY"
		write_env_var "SUPERSET_OBJECT_STORAGE_SECRET_KEY" "$SUPERSET_OBJECT_STORAGE_SECRET_KEY"
		write_env_var "SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE" "$SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE"
		write_env_var "ELECTRIC_SECRET" "$ELECTRIC_SECRET"
		write_env_var "ELECTRIC_URL" "http://electric:3000/v1/shape"
		write_env_var "ELECTRIC_SHAPE_URL" "http://electric:3000/v1/shape"
		write_env_var "AUTH_URL" "$PUBLIC_API_URL"
		write_env_var "AUTH_JWKS_URL" "http://api:3001"
		write_env_var "RELAY_INTERNAL_API_URL" "http://api:3001"
		write_env_var "WEB_PORT" "$ONLINE_WEB_PORT"
		write_env_var "API_PORT" "$ONLINE_API_PORT"
		write_env_var "WRANGLER_PORT" "$ONLINE_ELECTRIC_PROXY_PORT"
		write_env_var "RELAY_PORT" "8080"
		write_env_var "ELECTRIC_PORT" "$ONLINE_ELECTRIC_PORT"
		write_env_var "NEXT_PUBLIC_WEB_URL" "$PUBLIC_WEB_URL"
		write_env_var "NEXT_PUBLIC_API_URL" "$PUBLIC_API_URL"
		write_env_var "NEXT_PUBLIC_ELECTRIC_URL" "$PUBLIC_ELECTRIC_URL"
		write_env_var "NEXT_PUBLIC_ELECTRIC_PROXY_URL" "$PUBLIC_ELECTRIC_URL"
		write_env_var "NEXT_PUBLIC_RELAY_URL" "$PUBLIC_RELAY_URL"
		write_env_var "RELAY_URL" "$PUBLIC_RELAY_URL"
		write_env_var "NEXT_PUBLIC_COOKIE_DOMAIN" "$PUBLIC_DOMAIN"
		write_env_var "SUPERSET_WEB_URL" "$PUBLIC_WEB_URL"
		write_env_var "SUPERSET_MOBILE_PROFILE" "$MOBILE_PROFILE"
		write_env_var "EXPO_PUBLIC_SUPERSET_PROFILE" "$MOBILE_PROFILE"
		write_env_var "EXPO_PUBLIC_API_URL" "$PUBLIC_API_URL"
		write_env_var "EXPO_PUBLIC_ELECTRIC_URL" "$PUBLIC_ELECTRIC_URL"
		write_env_var "EXPO_PUBLIC_WEB_URL" "$PUBLIC_WEB_URL"
		write_env_var "EXPO_PUBLIC_RELAY_URL" "$PUBLIC_RELAY_URL"
		write_env_var "NEXT_PUBLIC_MARKETING_URL" "$NEXT_PUBLIC_MARKETING_URL"
		write_env_var "NEXT_PUBLIC_ADMIN_URL" "$NEXT_PUBLIC_ADMIN_URL"
		write_env_var "NEXT_PUBLIC_DOCS_URL" "$NEXT_PUBLIC_DOCS_URL"
		write_env_var "NEXT_PUBLIC_DESKTOP_URL" "$NEXT_PUBLIC_DESKTOP_URL"
		write_env_var "NEXT_PUBLIC_STREAMS_URL" "$NEXT_PUBLIC_STREAMS_URL"
		write_env_var "STREAMS_URL" "$STREAMS_URL"
		write_env_var "FLY_REGION" "local"
		write_env_var "FLY_MACHINE_ID" "superset-online"
		write_env_var "RELAY_PUBLIC_URL" "$PUBLIC_RELAY_URL"
		write_env_var "NO_PROXY" "localhost,127.0.0.1,api,web,relay,electric-proxy,electric,postgres,redis,kv-rest,minio"
		write_env_var "no_proxy" "localhost,127.0.0.1,api,web,relay,electric-proxy,electric,postgres,redis,kv-rest,minio"
	} > "$ONLINE_ENV_PATH"
	chmod 600 "$ONLINE_ENV_PATH"
}

write_mobile_env_file() {
	local mobile_dir
	mobile_dir="$(dirname "$MOBILE_ENV_PATH")"
	if [[ ! -d "$mobile_dir" ]]; then
		return
	fi

	local current=""
	if [[ -f "$MOBILE_ENV_PATH" ]]; then
		current="$(
			awk '
				/^[[:space:]]*(export[[:space:]]+)?(SUPERSET_MOBILE_PROFILE|EXPO_PUBLIC_SUPERSET_PROFILE|EXPO_PUBLIC_API_URL|EXPO_PUBLIC_ELECTRIC_URL|EXPO_PUBLIC_WEB_URL|EXPO_PUBLIC_RELAY_URL)=/ { next }
				{ print }
			' "$MOBILE_ENV_PATH"
		)"
	fi

	{
		if [[ -n "$current" ]]; then
			printf '%s\n' "$current"
		fi
		write_env_var "SUPERSET_MOBILE_PROFILE" "$MOBILE_PROFILE"
		write_env_var "EXPO_PUBLIC_SUPERSET_PROFILE" "$MOBILE_PROFILE"
		write_env_var "EXPO_PUBLIC_API_URL" "$PUBLIC_API_URL"
		write_env_var "EXPO_PUBLIC_ELECTRIC_URL" "$PUBLIC_ELECTRIC_URL"
		write_env_var "EXPO_PUBLIC_WEB_URL" "$PUBLIC_WEB_URL"
		write_env_var "EXPO_PUBLIC_RELAY_URL" "$PUBLIC_RELAY_URL"
	} > "$MOBILE_ENV_PATH"
}

prepare_env() {
	load_base_env
	apply_host_env
	write_online_env_file
	write_mobile_env_file
}

ensure_prereqs() {
	require_command bun
	require_command curl
	require_command docker
}

compose() {
	SUPERSET_ONLINE_ENV_FILE="$ONLINE_ENV_PATH" \
	COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
		docker compose \
			--env-file "$ONLINE_ENV_PATH" \
			-f "$ROOT_DIR/docker-compose.yml" \
			-f "$ROOT_DIR/docker-compose.online.yml" \
			-p "$COMPOSE_PROJECT_NAME" \
			"$@"
}

wait_for_docker() {
	local max_attempts="${1:-120}"
	local attempt=1
	while ! docker info >/dev/null 2>&1; do
		if (( attempt >= max_attempts )); then
			fail "Docker/OrbStack is not ready after ${max_attempts} attempts"
		fi
		if (( attempt == 1 )); then
			log "waiting for Docker/OrbStack..."
		fi
		sleep 2
		attempt=$((attempt + 1))
	done
}

stop_legacy_host_services() {
	if command -v tmux >/dev/null 2>&1 && [[ -S "$TMUX_SOCKET_PATH" ]]; then
		log "stopping legacy tmux online services"
		tmux -S "$TMUX_SOCKET_PATH" kill-server >/dev/null 2>&1 || true
	fi

	local domain="gui/$(id -u)"
	if [[ -f "$LAUNCH_AGENT_PATH" ]]; then
		log "removing legacy LaunchAgent $LAUNCH_AGENT_PATH"
		launchctl bootout "$domain" "$LAUNCH_AGENT_PATH" >/dev/null 2>&1 || true
		rm -f "$LAUNCH_AGENT_PATH"
	fi
}

build_app_artifacts() {
	if [[ "${SUPERSET_ONLINE_SKIP_BUILD:-0}" == "1" ]]; then
		log "skipping app artifact build because SUPERSET_ONLINE_SKIP_BUILD=1"
		return
	fi

	log "building API standalone artifact"
	(
		cd "$ROOT_DIR/apps/api"
		rm -rf .next-online
		SUPERSET_ONLINE_SERVICE=1 \
			SUPERSET_NEXT_DIST_DIR=.next-online \
			NODE_ENV=production \
			SKIP_ENV_VALIDATION=1 \
			bun run build
	)

	log "building Web standalone artifact"
	(
		cd "$ROOT_DIR/apps/web"
		rm -rf .next-online
		SUPERSET_ONLINE_SERVICE=1 \
			SUPERSET_NEXT_DIST_DIR=.next-online \
			NODE_ENV=production \
			SKIP_ENV_VALIDATION=1 \
			bun run build
	)

	log "building Relay bundle"
	rm -rf "$ONLINE_BUILD_DIR/relay"
	mkdir -p "$ONLINE_BUILD_DIR/relay"
	bun build "$ROOT_DIR/apps/relay/src/index.ts" \
		--target=bun \
		--outdir "$ONLINE_BUILD_DIR/relay" \
		--entry-naming=index.js

	log "building Electric Proxy bundle"
	rm -rf "$ONLINE_BUILD_DIR/electric-proxy"
	mkdir -p "$ONLINE_BUILD_DIR/electric-proxy"
	bun build "$ROOT_DIR/apps/electric-proxy/src/server.ts" \
		--target=bun \
		--outdir "$ONLINE_BUILD_DIR/electric-proxy" \
		--entry-naming=server.js
}

db_query_ok() {
	compose exec -T postgres psql -U postgres -d main -At -v ON_ERROR_STOP=1 -c "select 1" 2>/dev/null |
		grep -qx "1"
}

wait_for_db_query() {
	local max_attempts="${1:-60}"
	local attempt=1
	while ! db_query_ok; do
		if (( attempt >= max_attempts )); then
			fail "postgres did not serve SQL queries after ${max_attempts} attempts"
		fi
		if (( attempt == 1 )); then
			log "waiting for postgres SQL queries..."
		fi
		sleep 2
		attempt=$((attempt + 1))
	done
	log "postgres query ready"
}

wait_for_probe() {
	local label="$1"
	local url="$2"
	local expected="$3"
	local max_attempts="${4:-60}"
	local attempt=1
	local status

	while true; do
		status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
		if [[ "$status" == "$expected" ]]; then
			log "$label ready ($status)"
			return
		fi
		if (( attempt >= max_attempts )); then
			fail "$label did not become ready; got ${status:-000}, expected $expected at $url"
		fi
		sleep 2
		attempt=$((attempt + 1))
	done
}

wait_for_object_storage() {
	wait_for_probe "object-storage" "http://localhost:${ONLINE_S3_PORT}/minio/health/live" "200" 60
}

query_online_schema_missing() {
	compose exec -T postgres psql -U postgres -d main -At -v ON_ERROR_STOP=1 <<'SQL'
WITH checks(name, ok) AS (
	VALUES
		('table public.automation_config_versions', to_regclass('public.automation_config_versions') IS NOT NULL),
		('table public.control_chat_messages', to_regclass('public.control_chat_messages') IS NOT NULL),
		('table public.control_chat_runs', to_regclass('public.control_chat_runs') IS NOT NULL),
		('table public.control_chat_sessions', to_regclass('public.control_chat_sessions') IS NOT NULL),
		('table public.control_chat_tool_calls', to_regclass('public.control_chat_tool_calls') IS NOT NULL)
)
SELECT COALESCE(string_agg(name, ', ' ORDER BY name), '')
FROM checks
WHERE NOT ok;
SQL
}

assert_online_schema_ready() {
	log "checking online database schema guard"
	local missing
	missing="$(query_online_schema_missing)"
	if [[ -n "$missing" ]]; then
		fail "online database schema is missing: $missing. Migration ledger may be out of sync; repair the online database before starting app services."
	fi
}

run_migrations_and_seed() {
	log "running database migrations against online database"
	DATABASE_URL="$HOST_DATABASE_URL" \
		DATABASE_URL_UNPOOLED="$HOST_DATABASE_URL_UNPOOLED" \
		bun run --cwd "$ROOT_DIR/packages/db" migrate
	assert_online_schema_ready
	if [[ "${ONLINE_SEED_DEV:-0}" != "0" ]]; then
		log "ensuring development admin account exists"
		DATABASE_URL="$HOST_DATABASE_URL" \
			DATABASE_URL_UNPOOLED="$HOST_DATABASE_URL_UNPOOLED" \
			bun run --cwd "$ROOT_DIR" db:seed-dev
	fi
}

start_data_services() {
	log "starting Docker data services on 430xx ports"
	compose up -d --no-build postgres electric redis minio
	if ! compose up -d --no-build kv-rest; then
		log "kv-rest image missing; building it once"
		compose up -d --build kv-rest
	fi
	compose run --rm minio-init
}

start_app_services() {
	log "building app images from prepared artifacts"
	compose build api web relay electric-proxy
	log "starting Docker app services"
	compose up -d --remove-orphans api web relay electric-proxy
}

wait_for_local_services() {
	log "waiting for online app services to become ready"
	wait_for_probe "api" "http://localhost:${ONLINE_API_PORT}/api/auth/get-session" "200" 90
	wait_for_probe "web" "http://localhost:${ONLINE_WEB_PORT}/sign-in" "200" 90
	wait_for_probe "electric-proxy" "http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}/v1/shape" "401" 60
	wait_for_probe "relay" "http://localhost:${ONLINE_RELAY_PORT}/health" "200" 60
}

probe_url() {
	local label="$1"
	local url="$2"
	local expected="$3"
	local status
	status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
	if [[ "$status" == "$expected" ]]; then
		printf '  OK   %-24s %s %s\n' "$label" "$status" "$url"
	else
		printf '  FAIL %-24s got %s expected %s %s\n' "$label" "${status:-000}" "$expected" "$url"
	fi
}

print_status() {
	prepare_env
	echo "online local ports:"
	echo "  web              http://localhost:${ONLINE_WEB_PORT}"
	echo "  api              http://localhost:${ONLINE_API_PORT}"
	echo "  electric-proxy   http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}"
	echo "  relay            http://localhost:${ONLINE_RELAY_PORT}"
	echo "  postgres         localhost:${ONLINE_PG_PORT}"
	echo "  electric         localhost:${ONLINE_ELECTRIC_PORT}"
	echo "  redis            localhost:${ONLINE_REDIS_PORT}"
	echo "  kv-rest          localhost:${ONLINE_KV_REST_PORT}"
	echo "  object-storage   localhost:${ONLINE_S3_PORT}"
	echo "  object-console   localhost:${ONLINE_S3_CONSOLE_PORT}"
	echo
	echo "public router targets:"
	echo "  63000 -> ${ONLINE_WEB_PORT}"
	echo "  63001 -> ${ONLINE_API_PORT}"
	echo "  63012 -> ${ONLINE_ELECTRIC_PROXY_PORT}"
	echo "  63013 -> ${ONLINE_RELAY_PORT}"
	echo
	echo "docker compose project: $COMPOSE_PROJECT_NAME"
	if docker info >/dev/null 2>&1; then
		compose ps
	else
		echo "  Docker/OrbStack is not reachable"
	fi
	echo
	echo "local probes:"
	if db_query_ok; then
		printf '  OK   %-24s %s\n' "postgres SQL" "SELECT"
	else
		printf '  FAIL %-24s %s\n' "postgres SQL" "localhost:${ONLINE_PG_PORT}"
	fi
	probe_url "object storage" "http://localhost:${ONLINE_S3_PORT}/minio/health/live" "200"
	probe_url "api session" "http://localhost:${ONLINE_API_PORT}/api/auth/get-session" "200"
	probe_url "web /sign-in" "http://localhost:${ONLINE_WEB_PORT}/sign-in" "200"
	probe_url "electric auth gate" "http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}/v1/shape" "401"
	probe_url "relay health" "http://localhost:${ONLINE_RELAY_PORT}/health" "200"
	echo
	echo "public probes:"
	probe_url "public web /sign-in" "${PUBLIC_WEB_URL}/sign-in" "200"
	probe_url "public api session" "${PUBLIC_API_URL}/api/auth/get-session" "200"
	probe_url "public electric" "${PUBLIC_ELECTRIC_URL}/v1/shape" "401"
	probe_url "public relay health" "${PUBLIC_RELAY_URL}/health" "200"
}

start_all() {
	prepare_env
	ensure_prereqs
	wait_for_docker "${ONLINE_DOCKER_WAIT_ATTEMPTS:-300}"
	stop_legacy_host_services
	build_app_artifacts
	start_data_services
	wait_for_db_query
	wait_for_object_storage
	run_migrations_and_seed
	start_app_services
	wait_for_local_services
	print_status
}

stop_all() {
	prepare_env
	ensure_prereqs
	stop_legacy_host_services
	log "stopping Docker online stack"
	compose down
}

restart_all() {
	stop_all
	start_all
}

logs() {
	prepare_env
	ensure_prereqs
	compose logs -f "${@:2}"
}

usage() {
	cat <<USAGE
Usage: $0 <command>

Commands:
  start              Build artifacts and start the full Docker online stack
  stop               Stop the Docker online stack (volumes are preserved)
  restart            Stop and start the Docker online stack
  status             Print compose status and probes
  logs [service...]  Follow Docker logs
  build              Rebuild app artifacts and Docker images only
  uninstall-launchd  Remove the old host LaunchAgent if it exists
USAGE
}

main() {
	local command="${1:-status}"
	case "$command" in
		start)
			start_all
			;;
		stop)
			stop_all
			;;
		restart)
			restart_all
			;;
		status)
			ensure_prereqs
			print_status
			;;
		logs)
			logs "$@"
			;;
		build)
			prepare_env
			ensure_prereqs
			wait_for_docker "${ONLINE_DOCKER_WAIT_ATTEMPTS:-300}"
			build_app_artifacts
			compose build api web relay electric-proxy
			;;
		uninstall-launchd)
			stop_legacy_host_services
			;;
		help|-h|--help)
			usage
			;;
		*)
			usage
			fail "unknown command: $command"
			;;
	esac
}

main "$@"
