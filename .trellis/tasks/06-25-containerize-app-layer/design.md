# Design: Containerize Application Layer

## Architecture

All services run in a single Docker compose project `superset-online`. Containers
communicate over the compose default bridge network using service names as hostnames.

```
┌─────────────────────────────────────────────────────┐
│ Docker compose project: superset-online             │
│                                                     │
│  Data layer (existing, unchanged):                  │
│    postgres:5432  neon-proxy:4444  electric:3000   │
│    redis:6379     kv-rest:80       minio:9000      │
│                                                     │
│  App layer (new containers):                        │
│    api:3001       web:3000                          │
│    relay:8080     electric-proxy:8787               │
│                                                     │
│  Init:                                              │
│    migrate (one-shot, runs drizzle-kit migrate)     │
│    minio-init (existing)                            │
│                                                     │
│  Host ports:                                        │
│    43000->3000 (web)   43001->3001 (api)           │
│    43012->8787 (eprox) 43013->8080 (relay)         │
│    43014->5432 (pg)    43015->4444 (neon)          │
│    43009->3000 (elec)  43016->6379 (redis)         │
│    43017->80 (kv)      43018->9000 (minio)         │
└─────────────────────────────────────────────────────┘
```

## Dockerfiles

Implementation note: the original plan used container-internal Bun install and
Turbo prune. On this Mac mini, Docker/Bun/proxy interaction made that path
unreliable for online deploys. The shipped design instead builds artifacts on
the host with the already-installed workspace toolchain, then packages only the
runtime artifacts into Docker images. Online services still run entirely inside
Docker; host processes are limited to build/migration orchestration.

### API and Web (Next.js)

Both are Next.js apps in the monorepo. `scripts/superset-online.sh start`
builds them with:

```bash
SUPERSET_ONLINE_SERVICE=1 SUPERSET_NEXT_DIST_DIR=.next-online NODE_ENV=production bun run build
```

The Dockerfiles copy `.next-online/standalone` plus static assets into a
`node:20-slim` runtime image:

```dockerfile
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=<port> SUPERSET_NEXT_DIST_DIR=.next-online
COPY apps/<app>/.next-online/standalone ./
COPY apps/<app>/.next-online/static ./apps/<app>/.next-online/static
EXPOSE <port>
CMD ["node", "apps/<app>/server.js"]
```

Note: Next.js `standalone` output must be enabled in `next.config.ts`:
```ts
output: "standalone",
```

### Relay

`scripts/superset-online.sh` bundles `apps/relay/src/index.ts` to
`.online-build/relay/index.js` with `bun build --target=bun`. The Docker image
copies that single bundle into `oven/bun:1.3.11` and runs it.

### Electric Proxy (Bun, not wrangler)

Wrangler dev server is not suitable for containers. `src/server.ts` wraps the
Cloudflare Worker-style handler in `Bun.serve`, and the online script bundles it
to `.online-build/electric-proxy/server.js`.

```dockerfile
FROM oven/bun:1.3.11 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY .online-build/electric-proxy/server.js ./server.js
EXPOSE 8787
CMD ["bun", "server.js"]
```

Relay and Electric Proxy use public API URLs as JWT issuers, but use internal
container URLs for JWKS/tRPC calls (`AUTH_JWKS_URL=http://api:3001`,
`RELAY_INTERNAL_API_URL=http://api:3001`) so containers do not depend on router
hairpin behavior.

## Compose Changes

New `docker-compose.online.yml` overlay adds the app services to the existing
data-layer compose project. App healthchecks use Node/Bun `fetch` so the runtime
images do not need curl.

```yaml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "43001:3001"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/auth/get-session"]
      interval: 10s
      timeout: 5s
      retries: 10

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "43000:3000"
    env_file: .env
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/sign-in"]
      interval: 10s
      timeout: 5s
      retries: 10

  relay:
    build:
      context: .
      dockerfile: apps/relay/Dockerfile
    ports:
      - "43013:8080"
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 10

  electric-proxy:
    build:
      context: .
      dockerfile: apps/electric-proxy/Dockerfile
    ports:
      - "43012:8787"
    env_file: .env
    restart: unless-stopped

```

Migrations run from the host before app containers start, against the isolated
online database ports. This avoids container-internal dependency installation
while keeping all long-lived online services in Docker.

## Internal Network

Containers talk to each other by service name:
- API connects to `postgres:5432` via `DATABASE_URL`
- Electric Proxy connects to `electric:3000` via `ELECTRIC_SHAPE_URL`
- Relay connects to `redis:6379`
- KV REST connects to `redis:6379`

The env vars for container-internal connections use service names, while
host-facing ports (43001 etc.) stay for external access (router, desktop, mobile).

## Risk and Mitigation

| Risk | Mitigation |
|------|-----------|
| Next.js standalone build fails | Test build locally before compose integration |
| Electric Proxy can't run under Bun | Fall back to wrangler in a Node container |
| Migration runs before DB ready | Use depends_on condition service_healthy |
| Env var conflicts between host and container | Use a dedicated `.env.online` file |
| Image build time too long | Build app artifacts once on host, then package only runtime outputs |

## Rollback

If containers fail, revert to tmux-based launch:
```bash
bash scripts/superset-online.sh start
```
The script remains in the repo as a fallback.
