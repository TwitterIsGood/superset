# Containerize Application Layer into Docker Compose

## Problem

Online application services (API, Web, Relay, Electric Proxy) run as bare tmux
processes on the host. They are killed when Codex exits (SIGTERM to process
group), and launchd KeepAlive fails due to PATH pollution and script exit
behavior. This makes the production service unreliable across restarts and
Codex sessions.

## Goal

Move all four application services into Docker containers within the existing
`superset-online` compose project. The entire online stack (data + apps) starts
with `docker compose up -d` and survives Codex exits, machine reboots (via
OrbStack auto-start), and host process churn.

## Requirements

- All four app services run as Docker containers in the `superset-online` compose project.
- Host port mappings stay identical so frontend, mobile, and router configs are unchanged.
- Each container has a healthcheck and `restart: unless-stopped`.
- The `scripts/superset-online.sh` launcher is replaced by `docker compose` commands.
- Migration runs as a one-shot compose service (or init container) before apps start.
- Env vars are injected via a single `.env` file consumed by compose.
- Electric Proxy gets a Bun-based Dockerfile (replacing wrangler dev server).

## Port Mapping (must not change)

| Service          | Host Port | Container Port |
|------------------|-----------|----------------|
| Web              | 43000     | 3000           |
| API              | 43001     | 3001           |
| Electric Proxy   | 43012     | 8787           |
| Relay            | 43013     | 8080           |
| Postgres         | 43014     | 5432           |
| Neon Proxy       | 43015     | 4444           |
| Electric         | 43009     | 3000           |
| Redis            | 43016     | 6379           |
| KV REST          | 43017     | 80             |
| MinIO            | 43018     | 9000           |
| MinIO Console    | 43019     | 9001           |

## Acceptance Criteria

- [x] `./scripts/superset-online.sh start` starts the full stack through Docker Compose.
- [x] All four app services pass healthcheck within 60s.
- [x] Public probes pass: web 200, api 200, electric 401, relay 200.
- [ ] Killing Codex does not affect any service.
- [x] `scripts/superset-online.sh` is simplified to wrap compose commands.
- [x] launchd plist is removed by the script when present; Docker restart policy owns persistence.
- [x] No tmux sessions needed for online services.

## Validation Notes

- 2026-06-26: `./scripts/superset-online.sh start` completed successfully.
- Local probes passed:
  - `http://localhost:43000/sign-in` -> 200
  - `http://localhost:43001/api/auth/get-session` -> 200
  - `http://localhost:43012/v1/shape` -> 401
  - `http://localhost:43013/health` -> 200
- Public probes passed:
  - `http://bj1.v.lhb.ink:63000/sign-in` -> 200
  - `http://bj1.v.lhb.ink:63001/api/auth/get-session` -> 200
  - `http://bj1.v.lhb.ink:63012/v1/shape` -> 401
  - `http://bj1.v.lhb.ink:63013/health` -> 200
