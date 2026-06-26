#!/usr/bin/env bash
# Worktree-local development lifecycle for desktop E2E.
set -euo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"
SCRIPT_PATH="$SUPERSET_SCRIPT_DIR/worktree-dev.sh"
RUN_DIR="${SUPERSET_WORKTREE_DEV_RUN_DIR:-$ROOT_DIR/.tmp/worktree-dev}"
LOG_DIR="$RUN_DIR/logs"
PROFILE_MARKER_PATH="$RUN_DIR/active-profile"
TMUX_SOCKET_PATH="${SUPERSET_WORKTREE_DEV_TMUX_SOCKET:-$RUN_DIR/tmux.sock}"
WORKTREE_DEV_PROFILE="${WORKTREE_DEV_PROFILE:-full}"
ALL_APP_SESSIONS=("api" "relay" "electric-proxy" "desktop")
SESSIONS=()
WORKTREE_DEV_REQUIRES_LOCAL_API=1
WORKTREE_DEV_REQUIRES_LOCAL_DATA=1
WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES=0

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/worktree-local.sh"

configure_profile() {
  case "$WORKTREE_DEV_PROFILE" in
    full)
      SESSIONS=("api" "relay" "electric-proxy" "desktop")
      WORKTREE_DEV_REQUIRES_LOCAL_API=1
      WORKTREE_DEV_REQUIRES_LOCAL_DATA=1
      WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES=0
      ;;
    desktop-lite)
      SESSIONS=("relay" "electric-proxy" "desktop")
      WORKTREE_DEV_REQUIRES_LOCAL_API=0
      WORKTREE_DEV_REQUIRES_LOCAL_DATA=1
      WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES=0
      ;;
    desktop-online-lite)
      SESSIONS=("desktop")
      WORKTREE_DEV_REQUIRES_LOCAL_API=0
      WORKTREE_DEV_REQUIRES_LOCAL_DATA=0
      WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES=1
      ;;
    *)
      error "unknown WORKTREE_DEV_PROFILE: $WORKTREE_DEV_PROFILE (expected full, desktop-lite, or desktop-online-lite)"
      exit 1
      ;;
  esac

  export WORKTREE_DEV_PROFILE WORKTREE_DEV_REQUIRES_LOCAL_API WORKTREE_DEV_REQUIRES_LOCAL_DATA WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES
}

session_in_active_profile() {
  local needle="$1"
  local session
  for session in "${SESSIONS[@]}"; do
    if [ "$session" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

desktop_lite_uses_skipped_local_api() {
  [ "$WORKTREE_DEV_REQUIRES_LOCAL_API" = "0" ] || return 1
  case "$NEXT_PUBLIC_API_URL" in
    "http://localhost:${API_PORT}"|"http://localhost:${API_PORT}/"*|"http://127.0.0.1:${API_PORT}"|"http://127.0.0.1:${API_PORT}/"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

warn_if_desktop_lite_api_is_skipped() {
  if desktop_lite_uses_skipped_local_api; then
    warn "desktop-lite skips the local API, but NEXT_PUBLIC_API_URL points at the skipped local API; cached/Electric views can work, but login and API mutations need an already running API or a different .env API URL"
  fi
}

apply_profile_target_env() {
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" != "1" ]; then
    return
  fi

  WORKTREE_DEV_EXTERNAL_WEB_URL="${WORKTREE_DEV_EXTERNAL_WEB_URL:-http://localhost:43000}"
  WORKTREE_DEV_EXTERNAL_API_URL="${WORKTREE_DEV_EXTERNAL_API_URL:-http://localhost:43001}"
  WORKTREE_DEV_EXTERNAL_ELECTRIC_URL="${WORKTREE_DEV_EXTERNAL_ELECTRIC_URL:-http://localhost:43012}"
  WORKTREE_DEV_EXTERNAL_RELAY_URL="${WORKTREE_DEV_EXTERNAL_RELAY_URL:-http://localhost:43013}"
  WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT="${WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT:-43015}"
  WORKTREE_DEV_EXTERNAL_PG_PORT="${WORKTREE_DEV_EXTERNAL_PG_PORT:-43014}"
  WORKTREE_DEV_EXTERNAL_DATABASE_URL="${WORKTREE_DEV_EXTERNAL_DATABASE_URL:-postgres://postgres:postgres@localhost:${WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT}/main}"
  WORKTREE_DEV_EXTERNAL_DATABASE_URL_UNPOOLED="${WORKTREE_DEV_EXTERNAL_DATABASE_URL_UNPOOLED:-postgres://postgres:postgres@localhost:${WORKTREE_DEV_EXTERNAL_PG_PORT}/main}"
  WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN="${WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN:-http://bj1.v.lhb.ink:63000}"
  SUPERSET_DESKTOP_PROXY_API_TARGET="${SUPERSET_DESKTOP_PROXY_API_TARGET:-$WORKTREE_DEV_EXTERNAL_API_URL}"
  SUPERSET_DESKTOP_PROXY_ORIGIN="${SUPERSET_DESKTOP_PROXY_ORIGIN:-$WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN}"
  SUPERSET_DESKTOP_TARGET_API_URL="${SUPERSET_DESKTOP_TARGET_API_URL:-http://localhost:${DESKTOP_VITE_PORT}}"

  NEXT_PUBLIC_WEB_URL="$WORKTREE_DEV_EXTERNAL_WEB_URL"
  NEXT_PUBLIC_API_URL="$SUPERSET_DESKTOP_TARGET_API_URL"
  NEXT_PUBLIC_ELECTRIC_URL="$WORKTREE_DEV_EXTERNAL_ELECTRIC_URL"
  NEXT_PUBLIC_ELECTRIC_PROXY_URL="$WORKTREE_DEV_EXTERNAL_ELECTRIC_URL"
  RELAY_URL="$WORKTREE_DEV_EXTERNAL_RELAY_URL"
  NEXT_PUBLIC_RELAY_URL="$WORKTREE_DEV_EXTERNAL_RELAY_URL"

  export WORKTREE_DEV_EXTERNAL_WEB_URL WORKTREE_DEV_EXTERNAL_API_URL WORKTREE_DEV_EXTERNAL_ELECTRIC_URL WORKTREE_DEV_EXTERNAL_RELAY_URL
  export WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT WORKTREE_DEV_EXTERNAL_PG_PORT WORKTREE_DEV_EXTERNAL_DATABASE_URL WORKTREE_DEV_EXTERNAL_DATABASE_URL_UNPOOLED WORKTREE_DEV_EXTERNAL_TRUSTED_ORIGIN
  export SUPERSET_DESKTOP_PROXY_API_TARGET SUPERSET_DESKTOP_PROXY_ORIGIN SUPERSET_DESKTOP_TARGET_API_URL
  export NEXT_PUBLIC_WEB_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_ELECTRIC_URL NEXT_PUBLIC_ELECTRIC_PROXY_URL RELAY_URL NEXT_PUBLIC_RELAY_URL
}

load_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ROOT_DIR/.env"
    set +a
  fi

  SUPERSET_WORKTREE_ID="${SUPERSET_WORKTREE_ID:-$(worktree_path_hash "$ROOT_DIR")}"
  SUPERSET_WORKTREE_ROOT="${SUPERSET_WORKTREE_ROOT:-$(worktree_physical_root "$ROOT_DIR")}"
  SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(worktree_default_workspace_name "$ROOT_DIR")}"
  SUPERSET_HOME_DIR="${SUPERSET_HOME_DIR:-$(worktree_expected_home_dir "$ROOT_DIR")}"
  SUPERSET_PORT_BASE="${SUPERSET_PORT_BASE:-3000}"
  LOCAL_DB_PROJECT="${LOCAL_DB_PROJECT:-$(worktree_default_db_project "$ROOT_DIR")}"

  LOCAL_PG_PORT="${LOCAL_PG_PORT:-$((SUPERSET_PORT_BASE + 14))}"
  LOCAL_NEON_PROXY_PORT="${LOCAL_NEON_PROXY_PORT:-$((SUPERSET_PORT_BASE + 15))}"
  LOCAL_ELECTRIC_PORT="${LOCAL_ELECTRIC_PORT:-$((SUPERSET_PORT_BASE + 9))}"
  LOCAL_REDIS_PORT="${LOCAL_REDIS_PORT:-$((SUPERSET_PORT_BASE + 16))}"
  LOCAL_KV_REST_PORT="${LOCAL_KV_REST_PORT:-$((SUPERSET_PORT_BASE + 17))}"
  LOCAL_S3_PORT="${LOCAL_S3_PORT:-$((SUPERSET_PORT_BASE + 19))}"
  LOCAL_S3_CONSOLE_PORT="${LOCAL_S3_CONSOLE_PORT:-$((SUPERSET_PORT_BASE + 20))}"

  WEB_PORT="${WEB_PORT:-$SUPERSET_PORT_BASE}"
  API_PORT="${API_PORT:-$((SUPERSET_PORT_BASE + 1))}"
  DESKTOP_VITE_PORT="${DESKTOP_VITE_PORT:-$((SUPERSET_PORT_BASE + 5))}"
  DESKTOP_NOTIFICATIONS_PORT="${DESKTOP_NOTIFICATIONS_PORT:-$((SUPERSET_PORT_BASE + 6))}"
  CADDY_ELECTRIC_PORT="${CADDY_ELECTRIC_PORT:-$((SUPERSET_PORT_BASE + 10))}"
  WRANGLER_PORT="${WRANGLER_PORT:-$((SUPERSET_PORT_BASE + 12))}"
  RELAY_PORT="${RELAY_PORT:-$((SUPERSET_PORT_BASE + 13))}"
  DESKTOP_AUTOMATION_PORT="${DESKTOP_AUTOMATION_PORT:-$((SUPERSET_PORT_BASE + 18))}"

  DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:$LOCAL_NEON_PROXY_PORT/main}"
  DATABASE_URL_UNPOOLED="${DATABASE_URL_UNPOOLED:-postgres://postgres:postgres@localhost:$LOCAL_PG_PORT/main}"
  KV_REST_API_TOKEN="${KV_REST_API_TOKEN:-local-kv-token}"
  KV_REST_API_URL="${KV_REST_API_URL:-http://localhost:$LOCAL_KV_REST_PORT}"
  KV_URL="${KV_URL:-redis://localhost:$LOCAL_REDIS_PORT}"
  ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"
  ELECTRIC_URL="${ELECTRIC_URL:-http://localhost:$LOCAL_ELECTRIC_PORT/v1/shape}"
  NEXT_PUBLIC_ELECTRIC_URL="${NEXT_PUBLIC_ELECTRIC_URL:-http://localhost:$WRANGLER_PORT}"
  NEXT_PUBLIC_ELECTRIC_PROXY_URL="${NEXT_PUBLIC_ELECTRIC_PROXY_URL:-$NEXT_PUBLIC_ELECTRIC_URL}"
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:$API_PORT}"
  NEXT_PUBLIC_DESKTOP_URL="${NEXT_PUBLIC_DESKTOP_URL:-http://localhost:$DESKTOP_VITE_PORT}"
  RELAY_URL="${RELAY_URL:-http://localhost:$RELAY_PORT}"
  NEXT_PUBLIC_RELAY_URL="${NEXT_PUBLIC_RELAY_URL:-$RELAY_URL}"

  configure_profile

  export SUPERSET_WORKTREE_ID SUPERSET_WORKTREE_ROOT SUPERSET_WORKSPACE_NAME SUPERSET_HOME_DIR SUPERSET_PORT_BASE LOCAL_DB_PROJECT
  export LOCAL_PG_PORT LOCAL_NEON_PROXY_PORT LOCAL_ELECTRIC_PORT LOCAL_REDIS_PORT LOCAL_KV_REST_PORT LOCAL_S3_PORT LOCAL_S3_CONSOLE_PORT
  export WEB_PORT API_PORT DESKTOP_VITE_PORT DESKTOP_NOTIFICATIONS_PORT CADDY_ELECTRIC_PORT WRANGLER_PORT RELAY_PORT DESKTOP_AUTOMATION_PORT
  export DATABASE_URL DATABASE_URL_UNPOOLED KV_REST_API_TOKEN KV_REST_API_URL KV_URL
  export ELECTRIC_SECRET ELECTRIC_URL NEXT_PUBLIC_ELECTRIC_URL NEXT_PUBLIC_ELECTRIC_PROXY_URL
  export NEXT_PUBLIC_API_URL NEXT_PUBLIC_DESKTOP_URL RELAY_URL NEXT_PUBLIC_RELAY_URL

  mkdir -p "$RUN_DIR" "$LOG_DIR" "$SUPERSET_HOME_DIR"
}

ensure_local_setup() {
  if worktree_env_requires_local_setup "$ROOT_DIR" "$ROOT_DIR/.env"; then
    warn "workspace .env is missing or stale for this worktree; running .superset/setup.local.sh"
    "$SUPERSET_SCRIPT_DIR/setup.local.sh"
  fi
  load_env
  worktree_assert_current_local_env "$ROOT_DIR"
}

load_and_assert_local_env() {
  load_env
  worktree_assert_current_local_env "$ROOT_DIR"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    error "missing required command: $1"
    exit 1
  }
}

ensure_prereqs() {
  require_command bun
  require_command curl
  require_command docker
  require_command tmux
  require_command jq
}

wait_for_docker() {
  local max_attempts="${1:-90}"
  local attempt=1
  while ! docker info >/dev/null 2>&1; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "Docker/OrbStack is not ready after ${max_attempts} attempts"
      exit 1
    fi
    if [ "$attempt" -eq 1 ]; then
      warn "waiting for Docker/OrbStack..."
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

compose() {
  COMPOSE_PROJECT_NAME="$LOCAL_DB_PROJECT" docker compose \
    -p "$LOCAL_DB_PROJECT" \
    -f "$ROOT_DIR/docker-compose.yml" \
    "$@"
}

compose_build_args_for_data_services() {
  if [ "${WORKTREE_DEV_REBUILD_DATA:-0}" = "1" ]; then
    printf '%s\n' "--build"
    return
  fi

  if ! docker image inspect superset-local-kv-rest:latest >/dev/null 2>&1; then
    warn "superset-local-kv-rest:latest is missing; building data service image" >&2
    printf '%s\n' "--build"
  fi
}

cleanup_stale_minio_init_containers() {
  if ! docker info >/dev/null 2>&1; then
    return
  fi

  local ids=()
  while IFS= read -r id; do
    [ -n "$id" ] && ids+=("$id")
  done < <(docker ps -aq --filter "name=^/${LOCAL_DB_PROJECT}-minio-init-run-" 2>/dev/null || true)

  if [ "${#ids[@]}" -gt 0 ]; then
    docker rm -f "${ids[@]}" >/dev/null 2>&1 || true
  fi
}

run_minio_init() {
  local attempts="${WORKTREE_DEV_MINIO_INIT_ATTEMPTS:-30}"
  if compose run --rm \
    -e MINIO_INIT_ATTEMPTS="$attempts" \
    -e NO_PROXY="localhost,127.0.0.1,minio" \
    -e no_proxy="localhost,127.0.0.1,minio" \
    --entrypoint /bin/sh minio-init -c '
attempt=1
while [ "$attempt" -le "${MINIO_INIT_ATTEMPTS:-30}" ]; do
  if mc alias set superset http://minio:9000 "${MINIO_ROOT_USER:-superset}" "${MINIO_ROOT_PASSWORD:-superset-local-artifacts}"; then
    mc mb --ignore-existing "superset/${SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}" &&
      mc anonymous set none "superset/${SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}" &&
      mc anonymous set download "superset/${SUPERSET_OBJECT_STORAGE_BUCKET:-superset-artifacts}/packs"
    exit $?
  fi
  sleep 1
  attempt=$((attempt + 1))
done
exit 1
'; then
    success "minio artifact bucket ready"
  else
    warn "minio artifact bucket initialization did not complete; S3-dependent flows may need retry"
  fi
}

start_data_services() {
  echo "Starting worktree Docker data services ($LOCAL_DB_PROJECT)..."
  wait_for_docker "${WORKTREE_DEV_DOCKER_WAIT_ATTEMPTS:-180}"
  local build_args=()
  while IFS= read -r build_arg; do
    [ -n "$build_arg" ] && build_args+=("$build_arg")
  done < <(compose_build_args_for_data_services)

  local services=("postgres" "neon-proxy" "electric" "redis" "kv-rest" "minio")
  local up_ok=0
  if [ "${#build_args[@]}" -gt 0 ]; then
    compose up -d "${build_args[@]}" --wait "${services[@]}" || up_ok=$?
  else
    compose up -d --wait "${services[@]}" || up_ok=$?
  fi

  if [ "$up_ok" -ne 0 ]; then
    warn "docker compose --wait failed or is unsupported; falling back to detached startup"
    if [ "${#build_args[@]}" -gt 0 ]; then
      compose up -d "${build_args[@]}" "${services[@]}"
    else
      compose up -d "${services[@]}"
    fi
  fi
  compose rm -sf minio-init >/dev/null 2>&1 || true
  cleanup_stale_minio_init_containers
  run_minio_init
  cleanup_stale_minio_init_containers
}

db_proxy_query_ok() {
  curl -sS --max-time 5 \
    -X POST "http://localhost:${LOCAL_NEON_PROXY_PORT}/sql" \
    -H "Neon-Connection-String: ${DATABASE_URL}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select 1","params":[]}' 2>/dev/null |
    grep -q '"command"'
}

wait_for_db_proxy_query() {
  local max_attempts="${1:-60}"
  local attempt=1
  while true; do
    if db_proxy_query_ok; then
      success "neon proxy query ready"
      return
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "neon proxy did not serve SQL queries after ${max_attempts} attempts"
      exit 1
    fi
    if [ "$attempt" -eq 1 ]; then
      warn "waiting for neon proxy SQL queries..."
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

run_migrations_and_seed() {
  echo "Applying migrations and ensuring local dev account..."
  NODE_ENV=development bun run --cwd "$ROOT_DIR" db:migrate
  NODE_ENV=development bun run --cwd "$ROOT_DIR" db:seed-dev
}

desktop_perf_fixture_args() {
  local host_backed_default="1"
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    host_backed_default="0"
  fi

  printf '%s\n' \
    "--slug" "${WORKTREE_DEV_FIXTURE_SLUG:-desktop-perf-loaded}" \
    "--projects" "${WORKTREE_DEV_FIXTURE_PROJECTS:-10}" \
    "--workspaces-per-project" "${WORKTREE_DEV_FIXTURE_WORKSPACES_PER_PROJECT:-20}" \
    "--tasks" "${WORKTREE_DEV_FIXTURE_TASKS:-300}" \
    "--host-backed-workspaces" "${WORKTREE_DEV_FIXTURE_HOST_BACKED_WORKSPACES:-$host_backed_default}"
}

ensure_desktop_perf_fixture_if_requested() {
  if [ "${WORKTREE_DEV_LOAD_FIXTURE:-0}" != "1" ]; then
    return
  fi

  echo "Ensuring loaded desktop performance fixture..."
  local args=()
  while IFS= read -r arg; do
    args+=("$arg")
  done < <(desktop_perf_fixture_args)
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    DATABASE_URL="$WORKTREE_DEV_EXTERNAL_DATABASE_URL" \
      DATABASE_URL_UNPOOLED="$WORKTREE_DEV_EXTERNAL_DATABASE_URL_UNPOOLED" \
      NODE_ENV=development bun run --cwd "$ROOT_DIR" desktop:perf-fixture -- ensure "${args[@]}"
  else
    NODE_ENV=development bun run --cwd "$ROOT_DIR" desktop:perf-fixture -- ensure "${args[@]}"
  fi
}

external_db_proxy_query_ok() {
  curl -sS --max-time 5 \
    -X POST "http://localhost:${WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT}/sql" \
    -H "Neon-Connection-String: ${WORKTREE_DEV_EXTERNAL_DATABASE_URL}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select 1","params":[]}' 2>/dev/null |
    grep -q '"command"'
}

dense_fixture_database_available() {
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    external_db_proxy_query_ok
  else
    db_proxy_query_ok
  fi
}

print_desktop_perf_fixture_status() {
  echo "dense desktop fixture:"
  if ! dense_fixture_database_available; then
    printf '  - %-24s %s\n' "desktop-perf-loaded" "database unavailable"
    if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
      printf '  ! %-24s %s\n' "online-like data" "run: bun run online:start:loaded"
    fi
    return
  fi

  local args=()
  while IFS= read -r arg; do
    args+=("$arg")
  done < <(desktop_perf_fixture_args)

  local output
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    output="$(
      DATABASE_URL="$WORKTREE_DEV_EXTERNAL_DATABASE_URL" \
        DATABASE_URL_UNPOOLED="$WORKTREE_DEV_EXTERNAL_DATABASE_URL_UNPOOLED" \
        NODE_ENV=development bun run --cwd "$ROOT_DIR" desktop:perf-fixture -- stats "${args[@]}" 2>/dev/null
    )" || {
      printf '  ✗ %-24s %s\n' "desktop-perf-loaded" "stats failed"
      return
    }
  elif ! output="$(NODE_ENV=development bun run --cwd "$ROOT_DIR" desktop:perf-fixture -- stats "${args[@]}" 2>/dev/null)"; then
    printf '  ✗ %-24s %s\n' "desktop-perf-loaded" "stats failed"
    return
  fi

  local summary
  summary="$(
    printf '%s' "$output" | jq -r \
      '"\(.slug): \(.projectCount) projects / \(.workspaceCount) workspaces / \(.taskCount) tasks / \(.hostBackedWorkspaceCount) host-backed (loaded=\(.isLoaded))"'
  )"
  printf '  %s\n' "$summary"
  if [ "$(printf '%s' "$output" | jq -r '.isLoaded')" != "true" ]; then
    if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
      printf '  ! %-24s %s\n' "loaded data" "run: bun run online:start:loaded"
    else
      printf '  ! %-24s %s\n' "loaded data" "run: bun run dev:worktree:start:loaded"
    fi
  fi
}

prepare_desktop() {
  echo "Preparing desktop dev runtime..."
  NODE_ENV=development bun run --cwd "$ROOT_DIR/apps/desktop" predev
}

tmux_session_exists() {
  tmux -S "$TMUX_SOCKET_PATH" has-session -t "$1" >/dev/null 2>&1
}

start_tmux_service() {
  local service="$1"
  if tmux_session_exists "$service"; then
    success "tmux session already running: $service"
    return
  fi

  echo "Starting $service..."
  tmux -S "$TMUX_SOCKET_PATH" new-session -d -s "$service" -c "$ROOT_DIR" \
    "exec '$SCRIPT_PATH' run-service '$service'"
}

restart_desktop_if_profile_changed() {
  session_in_active_profile "desktop" || return 0
  tmux_session_exists "desktop" || return 0

  local previous_profile=""
  if [ -f "$PROFILE_MARKER_PATH" ]; then
    previous_profile="$(cat "$PROFILE_MARKER_PATH")"
  fi

  if [ "$previous_profile" != "$WORKTREE_DEV_PROFILE" ]; then
    echo "Restarting desktop for WORKTREE_DEV_PROFILE change (${previous_profile:-none} -> $WORKTREE_DEV_PROFILE)..."
    tmux -S "$TMUX_SOCKET_PATH" kill-session -t "desktop" || true
  fi
}

start_app_services() {
  local session
  for session in "${ALL_APP_SESSIONS[@]}"; do
    if ! session_in_active_profile "$session" && tmux_session_exists "$session"; then
      echo "Stopping $session (not part of WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE)..."
      tmux -S "$TMUX_SOCKET_PATH" kill-session -t "$session" || true
    fi
  done

  restart_desktop_if_profile_changed

  for session in "${SESSIONS[@]}"; do
    start_tmux_service "$session"
  done

  printf '%s\n' "$WORKTREE_DEV_PROFILE" > "$PROFILE_MARKER_PATH"
}

stop_app_services() {
  local session
  for session in "${ALL_APP_SESSIONS[@]}"; do
    if tmux_session_exists "$session"; then
      echo "Stopping $session..."
      tmux -S "$TMUX_SOCKET_PATH" kill-session -t "$session" || true
    fi
  done
  if tmux -S "$TMUX_SOCKET_PATH" list-sessions >/dev/null 2>&1; then
    tmux -S "$TMUX_SOCKET_PATH" kill-server >/dev/null 2>&1 || true
  fi
}

stop_data_services() {
  echo "Stopping worktree Docker data services ($LOCAL_DB_PROJECT)..."
  if docker info >/dev/null 2>&1; then
    compose down
  else
    warn "Docker/OrbStack is not reachable; skipping compose down"
  fi
}

run_service() {
  load_and_assert_local_env
  apply_profile_target_env
  local service="${1:-}"
  local log_file="$LOG_DIR/${service}.log"
  exec > >(tee -a "$log_file") 2>&1
  echo "[worktree-dev] service=$service started at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  case "$service" in
    api)
      cd "$ROOT_DIR/apps/api"
      rm -rf "${SUPERSET_NEXT_DIST_DIR:-.next}"
      if [ -n "${SUPERSET_API_DEV_NODE_OPTIONS:-}" ]; then
        export NODE_OPTIONS="${SUPERSET_API_DEV_NODE_OPTIONS}${NODE_OPTIONS:+ $NODE_OPTIONS}"
      elif [ -z "${NODE_OPTIONS:-}" ]; then
        export NODE_OPTIONS="--max-old-space-size=768"
      fi
      exec ./node_modules/.bin/next dev --port "$API_PORT"
      ;;
    relay)
      cd "$ROOT_DIR/apps/relay"
      exec bun --hot src/index.ts
      ;;
    electric-proxy)
      cd "$ROOT_DIR/apps/electric-proxy"
      exec bunx wrangler dev \
        --port "$WRANGLER_PORT" \
        --persist-to "$RUN_DIR/wrangler-state" \
        --env-file "$ROOT_DIR/apps/electric-proxy/.dev.vars"
      ;;
    desktop)
      cd "$ROOT_DIR/apps/desktop"
      export NODE_ENV=development
      export DESKTOP_AUTOMATION_PORT
      if [ -n "${SUPERSET_DESKTOP_DEV_NODE_OPTIONS:-}" ]; then
        export NODE_OPTIONS="${SUPERSET_DESKTOP_DEV_NODE_OPTIONS}${NODE_OPTIONS:+ $NODE_OPTIONS}"
      elif [ -z "${NODE_OPTIONS:-}" ]; then
        export NODE_OPTIONS="--max-old-space-size=2048"
      fi
      exec ./node_modules/.bin/electron-vite dev --watch
      ;;
    *)
      error "unknown service: $service"
      exit 1
      ;;
  esac
}

probe_url() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
  if [ "$status" = "$expected" ]; then
    printf '  ✓ %-24s %s %s\n' "$label" "$status" "$url"
  else
    printf '  ✗ %-24s got %s expected %s %s\n' "$label" "${status:-000}" "$expected" "$url"
  fi
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
    if [ "$status" = "$expected" ]; then
      success "$label ready ($status)"
      return
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "$label did not become ready; got ${status:-000}, expected $expected at $url"
      exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

wait_for_desktop_automation() {
  local max_attempts="${1:-90}"
  local attempt=1
  while true; do
    if DESKTOP_AUTOMATION_PORT="$DESKTOP_AUTOMATION_PORT" bun run --cwd "$ROOT_DIR" desktop:automation -- window-info --json >/dev/null 2>&1; then
      success "desktop automation ready (:${DESKTOP_AUTOMATION_PORT})"
      return
    fi
    if ! tmux_session_exists "desktop"; then
      error "desktop session exited before automation became ready; inspect $LOG_DIR/desktop.log"
      exit 1
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "desktop automation did not become ready on port ${DESKTOP_AUTOMATION_PORT}"
      exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

wait_for_local_services() {
  echo "Waiting for app service readiness..."
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    wait_for_probe "external api session" "${WORKTREE_DEV_EXTERNAL_API_URL}/api/auth/get-session" "200"
    wait_for_probe "external electric auth gate" "${WORKTREE_DEV_EXTERNAL_ELECTRIC_URL}/v1/shape" "401"
    wait_for_probe "external relay health" "${WORKTREE_DEV_EXTERNAL_RELAY_URL}/health" "200"
  elif [ "$WORKTREE_DEV_REQUIRES_LOCAL_API" = "1" ]; then
    wait_for_probe "api session" "http://localhost:${API_PORT}/api/auth/get-session" "200"
  else
    warn_if_desktop_lite_api_is_skipped
    success "api session skipped (WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE, NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL)"
  fi
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" != "1" ]; then
    wait_for_probe "relay health" "http://localhost:${RELAY_PORT}/health" "200"
    wait_for_probe "electric auth gate" "http://localhost:${WRANGLER_PORT}/v1/shape" "401"
  fi
  wait_for_desktop_automation
}

print_tmux_status() {
  echo "tmux socket: $TMUX_SOCKET_PATH"
  local session
  for session in "${ALL_APP_SESSIONS[@]}"; do
    local profile_marker=""
    if ! session_in_active_profile "$session"; then
      profile_marker=" (not in $WORKTREE_DEV_PROFILE)"
    fi
    if tmux_session_exists "$session"; then
      printf '  ✓ %s%s\n' "$session" "$profile_marker"
    else
      printf '  ✗ %s%s\n' "$session" "$profile_marker"
    fi
  done
}

print_docker_status() {
  echo "docker compose project: $LOCAL_DB_PROJECT"
  if docker info >/dev/null 2>&1; then
    compose ps
  else
    echo "  Docker/OrbStack is not reachable"
  fi
}

format_mib() {
  local kib="${1:-0}"
  awk -v kib="$kib" 'BEGIN { printf "%.1f MiB", kib / 1024 }'
}

docker_mem_to_kib() {
  local value="$1"
  awk -v raw="$value" '
    BEGIN {
      number = raw
      sub(/[[:alpha:]]+$/, "", number)
      unit = raw
      sub(/^[0-9.]+/, "", unit)
      if (unit == "GiB") {
        printf "%.0f", number * 1024 * 1024
      } else if (unit == "MiB") {
        printf "%.0f", number * 1024
      } else if (unit == "KiB") {
        printf "%.0f", number
      } else if (unit == "B") {
        printf "%.0f", number / 1024
      } else {
        printf "0"
      }
    }
  '
}

worktree_app_memory_kib() {
  ps -axo rss=,args= | awk -v root="$ROOT_DIR" '
    index($0, root) > 0 &&
    $0 !~ /worktree-dev\.sh status/ &&
    $0 !~ /ps -axo rss=,args=/ &&
    $0 !~ /awk -v root=/ {
      total += $1
    }
    END { printf "%d", total }
  '
}

worktree_docker_memory_kib() {
  if [ "$WORKTREE_DEV_REQUIRES_LOCAL_DATA" != "1" ] || ! docker info >/dev/null 2>&1; then
    printf "0"
    return
  fi

  local total=0
  local line name usage value kib
  while IFS=$'\t' read -r name usage; do
    case "$name" in
      "$LOCAL_DB_PROJECT"-*)
        value="${usage%% / *}"
        kib="$(docker_mem_to_kib "$value")"
        total=$((total + kib))
        ;;
    esac
  done < <(docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' 2>/dev/null || true)

  printf "%d" "$total"
}

print_worktree_top_process_memory() {
  ps -axo rss=,pid=,comm=,args= | awk -v root="$ROOT_DIR" '
    index($0, root) > 0 &&
    $0 !~ /worktree-dev\.sh status/ &&
    $0 !~ /ps -axo rss=,pid=,comm=,args=/ &&
    $0 !~ /awk -v root=/ {
      rss = $1
      pid = $2
      comm = $3
      $1 = ""; $2 = ""; $3 = ""
      gsub(/^[[:space:]]+/, "", $0)
      printf "%012d\t%s\t%s\t%s\n", rss, pid, comm, $0
    }
  ' | sort -r | head -8 | awk -F '\t' '
    {
      rss = $1 + 0
      command = $4
      if (length(command) > 110) {
        command = substr(command, 1, 107) "..."
      }
      printf "  %8.1f MiB  pid %-7s %-18s %s\n", rss / 1024, $2, $3, command
    }
  '
}

print_memory_status() {
  local app_kib docker_kib total_kib
  app_kib="$(worktree_app_memory_kib)"
  docker_kib="$(worktree_docker_memory_kib)"
  total_kib=$((app_kib + docker_kib))

  echo "memory:"
  printf '  %-24s %s\n' "app processes" "$(format_mib "$app_kib")"
  if [ "$WORKTREE_DEV_REQUIRES_LOCAL_DATA" = "1" ]; then
    printf '  %-24s %s\n' "docker compose" "$(format_mib "$docker_kib")"
  else
    printf '  %-24s skipped %s\n' "docker compose" "WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE"
  fi
  printf '  %-24s %s\n' "tracked total" "$(format_mib "$total_kib")"
  echo "top app processes:"
  print_worktree_top_process_memory || true
}

print_status() {
  load_env
  apply_profile_target_env
  echo "worktree: $SUPERSET_WORKSPACE_NAME"
  echo "profile:  $WORKTREE_DEV_PROFILE"
  echo "home:     $SUPERSET_HOME_DIR"
  echo "logs:     $LOG_DIR"
  echo
  echo "ports:"
  echo "  api              http://localhost:${API_PORT}"
  echo "  relay            http://localhost:${RELAY_PORT}"
  echo "  electric-proxy   http://localhost:${WRANGLER_PORT}"
  echo "  desktop vite     http://localhost:${DESKTOP_VITE_PORT}"
  echo "  desktop cdp      http://localhost:${DESKTOP_AUTOMATION_PORT}"
  echo "  postgres         localhost:${LOCAL_PG_PORT}"
  echo "  neon-proxy       localhost:${LOCAL_NEON_PROXY_PORT}"
  echo "  electric         localhost:${LOCAL_ELECTRIC_PORT}"
  echo "  redis            localhost:${LOCAL_REDIS_PORT}"
  echo "  kv-rest          localhost:${LOCAL_KV_REST_PORT}"
  echo "  s3               localhost:${LOCAL_S3_PORT}"
  echo "  s3 console       localhost:${LOCAL_S3_CONSOLE_PORT}"
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    echo
    echo "external app targets:"
    echo "  web              ${WORKTREE_DEV_EXTERNAL_WEB_URL}"
    echo "  api              ${WORKTREE_DEV_EXTERNAL_API_URL}"
    echo "  electric         ${WORKTREE_DEV_EXTERNAL_ELECTRIC_URL}"
    echo "  relay            ${WORKTREE_DEV_EXTERNAL_RELAY_URL}"
    echo "  neon-proxy       localhost:${WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT}"
  fi
  echo
  print_tmux_status
  echo
  if [ "$WORKTREE_DEV_REQUIRES_LOCAL_DATA" = "1" ]; then
    print_docker_status
  else
    echo "docker compose project: skipped (WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE)"
  fi
  echo
  print_memory_status
  echo
  echo "probes:"
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    if external_db_proxy_query_ok; then
      printf '  ✓ %-24s %s\n' "external neon SQL" "SELECT"
    else
      printf '  ✗ %-24s failed %s\n' "external neon SQL" "http://localhost:${WORKTREE_DEV_EXTERNAL_NEON_PROXY_PORT}/sql"
    fi
    probe_url "external api session" "${WORKTREE_DEV_EXTERNAL_API_URL}/api/auth/get-session" "200"
    probe_url "external electric" "${WORKTREE_DEV_EXTERNAL_ELECTRIC_URL}/v1/shape" "401"
    probe_url "external relay health" "${WORKTREE_DEV_EXTERNAL_RELAY_URL}/health" "200"
  elif db_proxy_query_ok; then
    printf '  ✓ %-24s %s\n' "neon proxy SQL" "SELECT"
  else
    printf '  ✗ %-24s failed %s\n' "neon proxy SQL" "http://localhost:${LOCAL_NEON_PROXY_PORT}/sql"
  fi
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" = "1" ]; then
    :
  elif [ "$WORKTREE_DEV_REQUIRES_LOCAL_API" = "1" ]; then
    probe_url "api session" "http://localhost:${API_PORT}/api/auth/get-session" "200"
  else
    warn_if_desktop_lite_api_is_skipped
    printf '  - %-24s skipped %s\n' "api session" "$NEXT_PUBLIC_API_URL"
  fi
  if [ "$WORKTREE_DEV_USES_EXTERNAL_APP_SERVICES" != "1" ]; then
    probe_url "relay health" "http://localhost:${RELAY_PORT}/health" "200"
    probe_url "electric auth gate" "http://localhost:${WRANGLER_PORT}/v1/shape" "401"
  fi
  if DESKTOP_AUTOMATION_PORT="$DESKTOP_AUTOMATION_PORT" bun run --cwd "$ROOT_DIR" desktop:automation -- window-info --json >/dev/null 2>&1; then
    printf '  ✓ %-24s %s\n' "desktop automation" "connected"
  else
    printf '  ✗ %-24s failed %s\n' "desktop automation" "port ${DESKTOP_AUTOMATION_PORT}"
  fi
  echo
  print_desktop_perf_fixture_status
}

cleanup_fixture() {
  local mode="$1"
  local value="$2"
  local fixture_output
  fixture_output="$(bun run --cwd "$ROOT_DIR" e2e:workspace-fixture -- cleanup "--$mode" "$value")"
  echo "$fixture_output" >&2
  echo "$fixture_output" | jq -r '.cleanupCandidates[]?'
}

remove_candidate_dirs() {
  local dry_run="$1"
  shift
  local candidates=("$@")
  local roots=(
    "$HOME/.superset/worktrees"
    "$SUPERSET_HOME_DIR/worktrees"
    "$SUPERSET_HOME_DIR/repos"
    "$SUPERSET_HOME_DIR/clones"
  )
  local root candidate target
  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] || continue
    case "$candidate" in
      "."|".."|"/"|*"/"*|"~"*) continue ;;
    esac
    for root in "${roots[@]}"; do
      target="$root/$candidate"
      if [ -e "$target" ]; then
        if [ "$dry_run" = "1" ]; then
          echo "dry-run remove $target"
        else
          echo "removing $target"
          rm -rf "$target"
        fi
      fi
    done
  done
}

cleanup_all() {
  load_and_assert_local_env
  ensure_prereqs

  local dry_run=0
  local slugs=()
  local ids=()
  local explicit_candidates=()

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run)
        dry_run=1
        shift
        ;;
      --e2e-slug|--slug)
        slugs+=("${2:?missing slug}")
        shift 2
        ;;
      --e2e-id|--id)
        ids+=("${2:?missing id}")
        shift 2
        ;;
      --worktree-name|--dir-name)
        explicit_candidates+=("${2:?missing directory name}")
        shift 2
        ;;
      *)
        error "unknown cleanup option: $1"
        exit 1
        ;;
    esac
  done

  if [ "$dry_run" = "1" ]; then
    warn "dry run: services will not be stopped and files will not be deleted"
  else
    stop_app_services
    trap 'stop_data_services' EXIT
  fi

  local candidates=("${explicit_candidates[@]}")
  local slug id candidate
  if [ "$dry_run" = "0" ]; then
    if [ "${#slugs[@]}" -gt 0 ]; then
      for slug in "${slugs[@]}"; do
        while IFS= read -r candidate; do
          candidates+=("$candidate")
        done < <(cleanup_fixture "slug" "$slug")
      done
    fi
    if [ "${#ids[@]}" -gt 0 ]; then
      for id in "${ids[@]}"; do
        while IFS= read -r candidate; do
          candidates+=("$candidate")
        done < <(cleanup_fixture "id" "$id")
      done
    fi
  else
    if [ "${#slugs[@]}" -gt 0 ]; then
      for slug in "${slugs[@]}"; do
        candidates+=("$slug")
      done
    fi
    if [ "${#ids[@]}" -gt 0 ]; then
      for id in "${ids[@]}"; do
        candidates+=("$id")
      done
    fi
  fi

  if [ "${#candidates[@]}" -gt 0 ]; then
    remove_candidate_dirs "$dry_run" "${candidates[@]}"
  fi

  if [ "$dry_run" = "0" ]; then
    stop_data_services
    trap - EXIT
  fi
}

start_all() {
  ensure_local_setup
  apply_profile_target_env
  ensure_prereqs
  if [ "$WORKTREE_DEV_REQUIRES_LOCAL_DATA" = "1" ]; then
    start_data_services
    wait_for_db_proxy_query
    run_migrations_and_seed
  else
    warn "local Docker data services skipped (WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE); expected external loaded source: bun run online:start:loaded"
  fi
  ensure_desktop_perf_fixture_if_requested
  prepare_desktop
  start_app_services
  wait_for_local_services
  print_status
}

stop_all() {
  load_and_assert_local_env
  apply_profile_target_env
  ensure_prereqs
  stop_app_services
  if [ "$WORKTREE_DEV_REQUIRES_LOCAL_DATA" = "1" ]; then
    stop_data_services
  else
    warn "local Docker data services skipped for WORKTREE_DEV_PROFILE=$WORKTREE_DEV_PROFILE"
  fi
}

usage() {
  cat <<USAGE
Usage: $0 <command> [options]

Commands:
  start                         Start this worktree's Docker, API, Relay, Electric proxy, and Desktop app
                                Set WORKTREE_DEV_PROFILE=desktop-lite to skip the local API Next dev server
                                Set WORKTREE_DEV_PROFILE=desktop-online-lite to run only Desktop against online-like targets
  status                        Print sessions, ports, Docker state, and readiness probes
  stop                          Stop only this worktree's sessions and Docker compose project
  cleanup [options]             Stop services and remove optional E2E fixture state/directories
  run-service <service>         Internal tmux entrypoint
  help                          Show this help

Cleanup options:
  --e2e-slug <slug>             Delete matching fixture project/workspace rows and local dirs
  --e2e-id <id>                 Delete matching fixture project/workspace rows and local dirs
  --worktree-name <name>        Also remove this local worktree directory name
  --dry-run                     Print intended local directory removals without stopping/deleting
USAGE
}

main() {
  local command="${1:-status}"
  case "$command" in
    start)
      start_all
      ;;
    status)
      load_env
      ensure_prereqs
      print_status
      ;;
    stop)
      stop_all
      ;;
    cleanup)
      shift
      cleanup_all "$@"
      ;;
    run-service)
      run_service "${2:-}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      error "unknown command: $command"
      exit 1
      ;;
  esac
}

main "$@"
