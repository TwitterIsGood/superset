# Worktree dev slot isolation

## Goal

Make Superset local dev work out of the box across multiple git worktrees by automatically isolating app ports while keeping shared dev data available by default.

## Background

Superset already has several pieces of a multi-worktree setup:

- `.superset/lib/setup/steps.sh` has `allocate_port_base`, backed by `~/.superset/port-allocations.json`, and reserves 20-port windows.
- `.superset/setup.local.sh` can allocate ports, write `.env`, generate `Caddyfile`, write `apps/electric-proxy/.dev.vars`, generate `.superset/ports.json`, start a local Docker DB stack, migrate, and seed.
- `docker-compose.yml` accepts local DB/Redis/KV ports through environment variables.
- Root `package.json` already has dev commands that read port variables from `.env`.

The current setup is not yet suitable for frequent AI-created worktrees:

- `.env` overrides are appended, not replaced, so repeated setup creates duplicate local override blocks.
- `.superset/setup.local.sh` defaults to one full DB stack per worktree, which prevents local accounts, workspaces, providers, and automations from being shared.
- There is no single `bun run dev:worktree`-style entry point that an agent can run without understanding the setup internals.
- Existing worktrees may already have stale or conflicting `.env` blocks and port allocations.

## User Value

Developers and AI agents can create or enter any Superset git worktree and run one command to get a working development environment without colliding with another running Superset dev instance. The command should be safe to repeat and should keep the developer's local test data connected by default.

## Requirements

### Functional Requirements

- Add a one-command local dev entry point for a Superset git worktree, tentatively `bun run dev:worktree`.
- The command must prepare the current worktree and then start the desktop-oriented dev graph by default, so it is genuinely one command for normal use.
- The command must also support `--prepare-only` for safe inspection, CI-style validation, and cases where an agent should configure but not launch long-running processes.
- Automatically allocate a stable 20-port window per worktree using the existing allocation file, lock, and reserved-port logic.
- Detect whether the current checkout is the primary git worktree or a linked git worktree using Git metadata, not chat context or human memory.
- Print the detected repo root, worktree role, selected port base, data mode, and data source before launching long-running processes.
- Isolate application/service ports per worktree:
  - `WEB_PORT`
  - `API_PORT`
  - `MARKETING_PORT`
  - `ADMIN_PORT`
  - `DOCS_PORT`
  - `DESKTOP_VITE_PORT`
  - `DESKTOP_NOTIFICATIONS_PORT`
  - `STREAMS_PORT`
  - `STREAMS_INTERNAL_PORT`
  - `CADDY_ELECTRIC_PORT`
  - `CODE_INSPECTOR_PORT`
  - `WRANGLER_PORT`
  - `RELAY_PORT`
- Default to shared local dev data mode:
  - reuse the canonical local Postgres/neon-proxy/Electric/Redis/KV stack from the main dev environment;
  - keep account, Workspace, Provider, Automation, Task, and related cloud-backed development data visible across worktrees;
  - do not start a second DB stack by default.
- In shared mode, if the canonical shared data stack is missing:
  - auto-start it when the primary worktree can be resolved safely;
  - otherwise fail with a clear command/path instead of silently falling back to isolated data.
- Support an explicit isolated data mode for rare cases, tentatively `bun run dev:worktree -- --data isolated`, which preserves the current one-DB-stack-per-worktree behavior.
- Write current-worktree `.env` through an idempotent managed block. Re-running setup must update the same block rather than appending duplicates.
- Repair current duplicated local override blocks in `.env` when the new setup command runs.
- Write or update `Caddyfile`, `apps/electric-proxy/.dev.vars`, and `.superset/ports.json` for the selected port/data mode.
- Keep `SUPERSET_HOME_DIR` per worktree by default so desktop app state, host-service manifests, local SQLite state, and window/session files do not stomp each other.
- Include a clear escape hatch to share `SUPERSET_HOME_DIR` only if explicitly requested later; it should not be the default because it risks multiple desktop instances sharing host-service sockets and SQLite files.
- Document the intended command for humans and agents.
- Keep the current production/canary endpoint rules untouched.

### Non-Functional Requirements

- Idempotent: safe to run repeatedly in the same worktree.
- Worktree-local: never edit another worktree's `.env`, `Caddyfile`, or `.superset/ports.json`.
- Conservative: do not delete existing port allocations for other worktrees.
- AI-friendly: command output should print the selected mode, base port, URLs, and the next action or running command.
- AI-safe after context compaction: the script must infer current worktree state from disk/Git every time and must not depend on chat memory.
- Backward-compatible enough for existing users: existing `.superset/setup.local.sh` remains usable, but the new entry point becomes the recommended path.
- No new package manager. Use Bun and existing shell/TypeScript tooling.
- No production database or production migrations.

## Out Of Scope

- Full cloud multi-tenant environment provisioning.
- Running several Electron apps against one shared `SUPERSET_HOME_DIR`.
- Changing Superset product-level remote workspace synchronization behavior.
- Reworking Docker images or replacing `docker-compose.yml`.
- Solving all stale worktrees under `~/.superset/worktrees`; cleanup can be a separate task.

## Acceptance Criteria

- [ ] `bun run dev:worktree` exists and can be run from a normal repo checkout or a git worktree.
- [ ] Running the command twice updates the same managed `.env` block and does not append duplicate local override blocks.
- [ ] Two different worktree paths receive different `SUPERSET_PORT_BASE` values and therefore different app ports.
- [ ] Shared data mode writes app URLs using the current worktree port window while writing DB/Electric/Redis/KV URLs that point to the canonical shared dev stack.
- [ ] Isolated data mode writes DB/Electric/Redis/KV URLs from the worktree's own port window and uses a worktree-specific Docker Compose project.
- [ ] `.superset/ports.json` is generated with labels for the actual selected ports.
- [ ] `apps/electric-proxy/.dev.vars` points to the correct local API URL and Electric shape URL for the selected mode.
- [ ] The command prints Web/API/Desktop/Electric/Relay URLs and the selected data mode.
- [ ] Unit tests cover port-plan generation, managed block replacement, shared mode, isolated mode, and duplicated-block cleanup.
- [ ] Documentation tells a new AI agent in a new worktree exactly what command to run.
- [ ] Planning is reviewed by the user before implementation starts.

## Open Questions For Review

- Resolved: `bun run dev:worktree` starts the dev graph by default and supports `--prepare-only`.
- Resolved: shared data mode should auto-start the canonical shared data stack when the primary worktree can be found safely; otherwise it should fail clearly and avoid guessing.
- Resolved: worktree detection must be automatic from Git metadata, so future AI sessions cannot rely on remembered context.
