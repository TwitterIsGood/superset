# Worktree Dev Slot Isolation Design

## Summary

Create a small local-dev orchestration layer that turns the existing port allocator into an explicit, idempotent, AI-friendly workflow:

```bash
bun run dev:worktree
```

The command prepares the current git worktree and starts the desktop-oriented dev graph with isolated app ports. By default, it reuses a shared local dev data stack so local account and cloud-backed development data stay consistent across worktrees.

The design must assume future AI sessions have no conversational memory. Every run derives the current repo root, worktree role, primary worktree path, port slot, and data mode from Git metadata and local files.

## Current Architecture

### Existing Port Allocation

`.superset/lib/setup/steps.sh` already has:

- `allocate_port_base`
- `port_base_is_safe`
- `SUPERSET_RESERVED_PORTS`
- `~/.superset/port-allocations.json`
- `~/.superset/port-allocations.lock`

This should remain the source of truth for port slots. New code should reuse or extract this logic rather than creating a second allocator.

### Existing Local Setup

`.superset/setup.local.sh` currently:

- copies `.env.local.example` to `.env`;
- installs dependencies;
- allocates ports;
- appends local overrides to `.env`;
- starts per-worktree Docker DB/Electric/Redis/KV;
- runs migrations and seed;
- writes `Caddyfile`, `apps/electric-proxy/.dev.vars`, `.superset/ports.json`, and `.superset/config.local.json`.

This is close but has two design mismatches:

1. It appends `.env` overrides repeatedly.
2. It defaults to per-worktree data isolation, while this task needs shared data by default.

## Proposed Commands

### Primary Command

```bash
bun run dev:worktree
```

Default behavior:

1. ensure dependencies are installed if needed;
2. allocate or reuse a port window for the current worktree;
3. detect and print whether this is the primary git worktree or a linked worktree;
4. write an idempotent `.env` managed block;
5. write `Caddyfile`, `apps/electric-proxy/.dev.vars`, and `.superset/ports.json`;
6. verify or start the shared dev data stack when using shared mode;
7. start `bun run dev:desktop:caddy` or the equivalent desktop dev graph.

### Prepare Only

```bash
bun run dev:worktree -- --prepare-only
```

Only writes/repairs files and prints URLs. Useful for validation and CI-style checks.

This is the safe mode for audits. It should perform all detection and file writes but must not start long-running dev servers.

### Data Mode

```bash
bun run dev:worktree -- --data shared
bun run dev:worktree -- --data isolated
```

- `shared` is the default.
- `isolated` preserves the current per-worktree Docker stack behavior.

### Optional Slot Controls

```bash
bun run dev:worktree -- --slot auto
bun run dev:worktree -- --base 3200
```

- `auto` uses the existing allocator.
- `--base` is a debugging/manual override and must still reject reserved/conflicting ranges.

## Data Mode Contracts

## Git Worktree Detection

Detection must use Git and filesystem state, not naming conventions alone:

- `git rev-parse --show-toplevel` gives the current repo root.
- `git rev-parse --git-dir` distinguishes a normal `.git` directory from a linked worktree `.git` file/path.
- `git worktree list --porcelain` gives the primary worktree and all linked worktrees.
- The first `worktree` entry from `git worktree list --porcelain` is treated as the primary checkout for shared data discovery.

The command should print:

```text
Superset worktree dev
Current root: /path/to/current
Role: primary | linked
Primary root: /path/to/primary
Data mode: shared | isolated
Port base: 3100
```

If the current directory is not a Superset repo root, exit before writing anything.

### Shared Data Mode

Shared data mode isolates only app-facing dev servers and worktree-local desktop state.

App ports come from the worktree's allocated base:

| Name | Offset |
| --- | ---: |
| `WEB_PORT` | `base + 0` |
| `API_PORT` | `base + 1` |
| `MARKETING_PORT` | `base + 2` |
| `ADMIN_PORT` | `base + 3` |
| `DOCS_PORT` | `base + 4` |
| `DESKTOP_VITE_PORT` | `base + 5` |
| `DESKTOP_NOTIFICATIONS_PORT` | `base + 6` |
| `STREAMS_PORT` | `base + 7` |
| `STREAMS_INTERNAL_PORT` | `base + 8` |
| `CADDY_ELECTRIC_PORT` | `base + 10` |
| `CODE_INSPECTOR_PORT` | `base + 11` |
| `WRANGLER_PORT` | `base + 12` |
| `RELAY_PORT` | `base + 13` |

Shared backing services point at the canonical local dev data stack. Initial recommendation:

- Canonical stack defaults to the existing main-dev ports:
  - Postgres: `3014`
  - Neon proxy: `3015`
  - raw Electric: `3009`
  - Redis: `3016`
  - KV REST: `3017`
- Current worktree still runs its own API, Electric proxy worker, Caddy, desktop renderer, and relay on its isolated app ports.
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` point to the shared Postgres/neon-proxy.
- `KV_REST_API_URL` and `KV_URL` point to shared KV/Redis.
- `ELECTRIC_URL` points to shared raw Electric.
- `NEXT_PUBLIC_ELECTRIC_URL` points to this worktree's Caddy/Electric proxy so the renderer uses the local API auth context and isolated worker port.
- `apps/electric-proxy/.dev.vars` uses this worktree's `AUTH_URL` but the shared raw Electric URL.

This gives app-port isolation while keeping account/workspace/provider/automation rows shared.

If the shared backing service probes fail:

1. If the primary worktree path is resolved and contains the expected Superset files, the command may start the shared stack from that primary root using the local Docker Compose project for the primary checkout.
2. If the primary root cannot be trusted, the command exits with a clear message that includes the path it expected and the setup command to run.
3. It must not silently switch to isolated mode, because that makes data appear "missing" and defeats the purpose of shared mode.

### Isolated Data Mode

Isolated mode keeps the current local setup behavior:

- use the current worktree port window for Postgres/neon-proxy/Electric/Redis/KV;
- start Docker Compose with a worktree-specific project name;
- run migrations and seed;
- write all URLs to isolated services.

This mode is slower but useful for schema migrations or destructive testing.

## Env File Strategy

Introduce a managed block:

```dotenv
# >>> superset worktree dev managed
...
# <<< superset worktree dev managed
```

Rules:

- If the block exists, replace it.
- If older `# ===== Local workspace overrides (setup.local.sh) =====` blocks exist, remove all of them before writing the new managed block.
- Preserve user credentials and non-managed values outside the block.
- Never write another worktree's `.env`.
- Use quoted values via the existing `write_env_var` escaping behavior.

## File Outputs

### `.env`

Contains the managed block for the selected mode.

### `Caddyfile`

Generated from selected `CADDY_ELECTRIC_PORT` and `WRANGLER_PORT`.

### `apps/electric-proxy/.dev.vars`

Generated from selected app/data mode:

- `AUTH_URL=http://localhost:$API_PORT`
- `ELECTRIC_SHAPE_URL=<shared or isolated raw electric>/v1/shape`
- `ELECTRIC_SECRET=local_electric_dev_secret`

### `.superset/ports.json`

Generated labels for current worktree ports. In shared mode, labels should make shared backing ports explicit, for example `Shared Postgres`, if they are included.

## Script Placement

Preferred implementation:

- Add a TypeScript or shell entry under `scripts/`, tentatively `scripts/dev-worktree.ts`.
- Add root package scripts:
  - `"dev:worktree": "bun run scripts/dev-worktree.ts"`
  - optionally `"dev:prepare": "bun run scripts/dev-worktree.ts --prepare-only"`

Reasoning:

- Root scripts are discoverable by AI agents and humans.
- Bun can run TypeScript directly and gives easier unit testing than complex shell.
- Existing shell helpers can remain, but idempotent text rewriting is safer in TypeScript.

## Compatibility And Migration

- Keep `.superset/setup.local.sh` available for existing Superset workspace setup flows.
- The new script can call or reuse existing shell setup only for isolated mode, but shared mode should avoid starting another DB stack.
- Update docs so new worktrees use `bun run dev:worktree`.
- Existing duplicate `.env` blocks are repaired on first run.
- Existing port allocations are reused if already present and safe.

## Risks

### Multiple API Instances Against One DB

Several worktrees may run API servers against the same DB. This is acceptable for development if migrations are not running concurrently. The script should not auto-run migrations in shared mode unless explicitly requested.

### Schema Drift Across Branches

If two worktrees have incompatible database schema expectations, shared mode can break one of them. Mitigation:

- default shared mode is for normal feature branches on nearby schema versions;
- destructive/schema-heavy work should use `--data isolated`;
- command output should warn when running in shared mode.

### Shared `SUPERSET_HOME_DIR`

Sharing `SUPERSET_HOME_DIR` would share host-service manifests, sockets, local SQLite, auth token, and window state. That can corrupt or confuse concurrent dev apps. The plan keeps `SUPERSET_HOME_DIR` per worktree by default.

## Review Decisions

1. Should shared mode auto-start the canonical shared data stack if it is not reachable?
   - Decision: yes, if the primary worktree can be found reliably; otherwise fail clearly with a repair command.
2. Should `bun run dev:worktree` immediately start dev servers?
   - Decision: yes, for AI无感. Keep `--prepare-only` for review/debugging.
3. Should `SUPERSET_HOME_DIR` be shared?
   - Decision: no. Keep it per worktree to avoid host-service/socket/SQLite collisions.
