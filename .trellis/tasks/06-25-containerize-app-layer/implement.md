# Implementation Plan: Containerize Application Layer

## Step 1: Enable Next.js standalone output

- Add `output: "standalone"` to `apps/api/next.config.ts` and `apps/web/next.config.ts`.
- Verify build still works: `bun run --cwd apps/api build && bun run --cwd apps/web build`.

## Step 2: Write Dockerfiles

- `apps/api/Dockerfile` - Node runtime image that copies host-built `.next-online/standalone`.
- `apps/web/Dockerfile` - Node runtime image that copies host-built `.next-online/standalone`.
- `apps/electric-proxy/Dockerfile` - Bun runtime image that copies `.online-build/electric-proxy/server.js`.
- `apps/relay/Dockerfile` - Bun runtime image that copies `.online-build/relay/index.js`.

## Step 3: Create docker-compose.online.yml

New file extending the data layer with app services. Uses env vars from `.env`
with internal service-name hostnames for inter-container communication.

Key env overrides for containers:
- `DATABASE_URL=postgres://postgres:postgres@postgres:5432/main`
- `ELECTRIC_SHAPE_URL=http://electric:3000/v1/shape`
- `KV_URL=redis://redis:6379`
- `KV_REST_API_URL=http://kv-rest:80`
- `REDIS_ADDR=redis:6379`

Host-facing ports stay: 43000, 43001, 43012, 43013, etc.

## Step 4: Write online env file

`scripts/superset-online.sh` generates ignored `.env.online` from root `.env`
plus managed online overrides:
- Public-facing URLs (bj1.v.lhb.ink:63xxx)
- Container-internal service URLs (postgres:5432, electric:3000, redis:6379)
- All auth/secrets from current `.env`
- `NO_PROXY` for compose service names so Docker's HTTP proxy does not intercept
  internal traffic such as `minio:9000`.

## Step 5: Build and test locally

```bash
./scripts/superset-online.sh start
```

Verify:
- All containers healthy
- Public probes pass (curl bj1.v.lhb.ink:63xxx)
- Kill host processes -> services unaffected

## Step 6: Simplify superset-online.sh

Replace tmux/launchd logic with:
```bash
docker compose -f docker-compose.yml -f docker-compose.online.yml \
  -p superset-online --env-file .env.online up -d
```

Keep `start`, `stop`, `status` as compose wrappers.

## Step 7: Remove launchd plist

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.superset.online.plist
rm ~/Library/LaunchAgents/com.superset.online.plist
```

OrbStack auto-starts on boot + Docker `restart: unless-stopped` handles persistence.
The script also removes the legacy LaunchAgent and kills the old online tmux
socket on start/stop when present.

## Validation Commands

```bash
# Build and start
./scripts/superset-online.sh start

# Status
./scripts/superset-online.sh status

# Probes
curl -sf http://localhost:43001/api/auth/get-session
curl -sf http://localhost:43000/sign-in
curl -sf http://localhost:43013/health
curl -sf http://localhost:43012/v1/shape || true  # 401 is ok

# Public
curl -sf http://bj1.v.lhb.ink:63001/api/auth/get-session
curl -sf http://bj1.v.lhb.ink:63000/sign-in
```
