# Worktree Dev Slot Isolation Implementation Plan

## Phase 0: Planning Review

- [x] User reviews `prd.md` and `design.md`.
- [x] Decide whether shared mode should auto-start canonical data stack or only verify it.
- [x] Decide whether primary command starts dev immediately or defaults to prepare-only.
- [x] Do not run `task.py start` until planning is approved.

## Phase 1: Extract Core Planning Logic

- [x] Add a small module for port/data planning.
- [x] Reuse the current offset map from `.superset/lib/setup/steps.sh`.
- [x] Model:
  - worktree path;
  - worktree role: primary or linked;
  - primary worktree path;
  - workspace name;
  - port base;
  - data mode: `shared` or `isolated`;
  - shared data ports;
  - derived URLs and env vars.
- [x] Add unit tests for:
  - primary vs linked worktree detection from sample `git worktree list --porcelain` output;
  - base `3000` and `3100` offset calculations;
  - shared mode DB/Electric/Redis/KV URLs;
  - isolated mode DB/Electric/Redis/KV URLs;
  - reserved/conflicting base rejection if manual `--base` is supported.

## Phase 2: Idempotent Env Writer

- [x] Implement managed block replacement:
  - `# >>> superset worktree dev managed`
  - `# <<< superset worktree dev managed`
- [x] Remove all legacy `# ===== Local workspace overrides (setup.local.sh) =====` blocks before writing the managed block.
- [x] Preserve values outside managed/legacy blocks.
- [x] Add tests:
  - empty/no `.env` from `.env.local.example`;
  - existing managed block replaced;
  - multiple legacy blocks collapsed into one managed block;
  - user secrets outside the block preserved.

## Phase 3: Worktree Dev CLI

- [x] Add `scripts/dev-worktree.ts`.
- [x] Parse flags:
  - `--data shared|isolated` default `shared`;
  - `--slot auto` default `auto`;
  - `--base <port>` optional;
  - `--prepare-only`;
  - maybe `--no-install` for faster agent runs.
- [x] Use existing `~/.superset/port-allocations.json` lock/file semantics, either by:
  - porting the allocator to TypeScript; or
  - invoking a shell helper that only allocates and prints JSON.
- [x] Write `.env`, `Caddyfile`, `apps/electric-proxy/.dev.vars`, and `.superset/ports.json`.
- [x] In shared mode:
  - verify shared DB/neon-proxy/Electric/Redis/KV endpoints;
  - auto-start the shared stack when the primary worktree can be resolved safely;
  - fail clearly when shared data is requested but no trustworthy primary worktree is found;
  - do not run migrations/seed by default;
  - print clear command if shared stack is missing.
- [x] In isolated mode:
  - start Docker Compose with worktree-specific project;
  - run migrations/seed only for isolated stack.
- [x] If not `--prepare-only`, start the desktop dev graph.

## Phase 4: Package Scripts And Docs

- [x] Add root scripts:
  - `dev:worktree`
  - optionally `dev:prepare`
- [x] Update local dev docs:
  - new worktree quickstart;
  - shared vs isolated data mode;
  - troubleshooting port conflicts;
  - what data is and is not shared.
- [x] Update `apps/docs/content/docs/ports.mdx` to replace the current "Superset does not assign per-workspace port ranges" caveat for this repo's own dev flow.
- [x] Consider updating `.superset/setup.local.sh` comments to point to `bun run dev:worktree` as the preferred manual command.

## Phase 5: Validation

Focused validation:

```bash
bun test scripts/dev-worktree.test.ts
```

or equivalent test path after implementation.

CLI dry run validation:

```bash
bun run dev:worktree -- --prepare-only
bun run dev:worktree -- --prepare-only
```

Expected:

- same base reused for the same worktree;
- `.env` contains one managed block;
- no legacy duplicate local override blocks remain;
- generated URLs match the selected data mode.

Multi-worktree validation:

```bash
git worktree add /tmp/superset-worktree-dev-slot-test HEAD
cd /tmp/superset-worktree-dev-slot-test
bun run dev:worktree -- --prepare-only
```

Expected:

- different `SUPERSET_PORT_BASE` than the main worktree;
- no edits to the main worktree `.env`;
- generated files are local to `/tmp/superset-worktree-dev-slot-test`.

Broad checks before commit:

```bash
bun run lint
```

Run `bun run typecheck` if implementation touches TypeScript compiled by workspace packages rather than standalone scripts/tests only.

Completed validation:

- [x] `bun test scripts/dev-worktree.test.ts`
- [x] `bun run dev:worktree -- --prepare-only --no-install` twice in the primary checkout
- [x] Temporary linked worktree prepare-only run with isolated `HOME`, confirming primary base `3000`, linked base `3020`, and shared data ports from primary
- [x] `bun run lint`
- [x] `bun run typecheck`

Desktop Automation was not run because this change does not alter a desktop user flow, renderer route, IPC boundary, terminal transport, or host-service behavior. The risk is the local-dev bootstrap contract, which is covered by pure unit tests, real prepare-only CLI runs, service probes, and a temporary git worktree validation.

## Rollback Plan

- Remove root `dev:worktree` and optional `dev:prepare` scripts.
- Remove new `scripts/dev-worktree*` files.
- Revert doc updates.
- Existing `.superset/setup.local.sh` remains available throughout, so rollback should not break current local setup.

## Follow-Up Candidates

- Add a cleanup command for stale `~/.superset/port-allocations.json` entries.
- Add UI affordance in Superset Desktop to show the allocated worktree slot.
- Add a Computer Use/Desktop Automation smoke once the command is implemented and real app startup is in scope.
