# Implementation Plan

## Steps

1. Update `packages/db` client dependencies and implementation.
   - Replace Neon imports with `pg` and `drizzle-orm/node-postgres`.
   - Remove local Neon proxy helper/tests.
   - Keep `db` / `dbWs` exports stable.
2. Remove Neon proxy from Docker compose files.
   - `docker-compose.online.yml`
   - `docker-compose.yml`
3. Update online script.
   - Direct Postgres URLs.
   - Remove Neon env keys from managed online env.
   - Replace Neon proxy SQL probe with direct Postgres SQL probe.
   - Remove compose startup dependency on `neon-proxy`.
4. Update dev/worktree script and tests.
   - Direct Postgres URLs.
   - Remove Neon readiness from data stack status.
   - Update generated env expectations.
5. Run focused tests and quality gates.
6. Restart online stack and verify local/public probes.
7. Commit and push if validation passes.

## Validation Commands

```bash
bun install
bun test scripts/superset-online.test.ts scripts/dev-worktree.test.ts scripts/worktree-local-shell.test.ts packages/db/src/*.test.ts
bun run lint:fix
bun run lint
bun run typecheck
./scripts/superset-online.sh start
./scripts/superset-online.sh status
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## Review Gates

- No `neon-proxy` service remains in compose.
- No online status output references Neon proxy.
- Frontend public URLs remain unchanged.
- Electric proxy status still returns expected auth-gated response.
- Postgres data volume remains intact.

## Validation Results

- `bun run --cwd packages/db typecheck` passed.
- `bun test scripts/superset-online.test.ts scripts/dev-worktree.test.ts scripts/worktree-local-shell.test.ts` passed.
- `bun run lint` passed.
- `bun run typecheck` passed.
- `./scripts/superset-online.sh status` passed all local and public probes:
  - Postgres SQL `SELECT`.
  - API session `200`.
  - Web `/sign-in` `200`.
  - Electric auth gate `401`.
  - Relay health `200`.
- Public login probe for `biang.wua@qq.com` returned HTTP `200` after the API container was rebuilt with direct Postgres.
- `bun test` full suite was attempted; unrelated `packages/pty-daemon` integration tests timed out and then Bun 1.3.14 crashed. Focused tests for this change passed before the crash.
