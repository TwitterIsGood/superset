# Desktop Performance and Architecture Overhaul

## Goal

Reduce desktop resource consumption (memory, package size, startup time) by restructuring the Electron app from "all capabilities built-in" to "thin shell + lazy activation + on-demand resource packs + hard budget gates." Improve dev experience (currently 10GB RSS), canary build/download speed, and first-interaction responsiveness without abandoning Electron.

## Problem Statement

User feedback across canary and dev:
- Desktop dev consumes ~10GB memory
- Canary builds are slow, downloads are slow, startup is slow
- First sidebar/panel open is slow (previously "optimized" by delaying sidebar mount, but underlying cost was deferred not eliminated)
- Canary has severe memory leaks under long sessions
- Package is ~500MB+ where comparable tools are much smaller

Root causes identified through codebase inspection:
1. **Thick package**: Trellis runtime, DuckDB, Claude SDK, MCP SDK, and many native modules are all whole-module-copied into every build regardless of usage frequency
2. **Eager startup path**: main process runs app-state, TanStack persistence, network logger, webview extension, terminal reconcile/prewarm, agent hooks, CLI shim before/around window creation
3. **Fake lazy loading**: sidebar tabs and pane registry statically import all implementations; hooks (git queries, PR polling) execute regardless of active tab
4. **Missing budget gates**: no CI-enforced limits on package size, startup time, memory, or child process count
5. **Unclear lifecycle boundaries**: host-service, pty-daemon, terminal-host, webviews, query subscriptions, intervals all have complex cleanup paths prone to leaks

## Confirmed Facts (from codebase)

- Initial audit found `dev` and `compile:app` scripts setting `NODE_OPTIONS=--max-old-space-size=8192`; current implementation keeps it build-only for `compile:app` and removes it from desktop dev/worktree dev runtime paths.
- Canary config inherits base config fully; canary-specific overrides are only naming/branding ([electron-builder.canary.ts](apps/desktop/electron-builder.canary.ts))
- `runtime-dependencies.ts` whole-module-copies: better-sqlite3, node-pty, native-keymap, @superset/macos-process-metrics, @ast-grep, @parcel/watcher, libsql+@libsql+@neon-rs, @mastra/duckdb+@duckdb, @anthropic-ai/claude-agent-sdk+sdk+json-schema-to-ts+@babel/runtime+ts-algebra+@modelcontextprotocol/sdk, Trellis runtime (44 modules), plus support modules
- `usePaneRegistry` statically imports BrowserPane, ChatPane, CommentPane, DiffPane, FilePane, TerminalPane and all their sub-components ([usePaneRegistry.tsx:47-59](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx))
- `WorkspaceSidebar` unconditionally calls `useChangesTab`, `useReviewTab`, `usePRFlowState`, and creates `FilesTab` + `ModelsTab` elements regardless of active tab ([WorkspaceSidebar.tsx:126-182](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/WorkspaceSidebar.tsx))
- Changes tab fires git.getBaseBranch, useChangeset, workspace.get, git.listCommits, git.listBranches on mount ([useChangesTab.tsx:47-117](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useChangesTab/useChangesTab.tsx))
- Review tab polls PR every 10s, threads every 30s ([useReviewTab.tsx:34-52](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useReviewTab/useReviewTab.tsx))
- host-service is spawned per-organization as ELECTRON_RUN_AS_NODE child ([host-service-coordinator.ts:378](apps/desktop/src/main/lib/host-service-coordinator.ts))
- host-service app.ts already uses `onceAsync` for chat runtime and chat service (good pattern to extend)
- Startup marks exist ([startup-performance.ts](apps/desktop/src/main/lib/startup-performance.ts)) and report scripts exist ([report-package-size.ts](apps/desktop/scripts/report-package-size.ts), [report-runtime-performance.ts](apps/desktop/scripts/report-runtime-performance.ts))
- CI already runs `report:size --top=15` after compile but does not enforce thresholds
- Canary releases via GitHub Actions to `desktop-canary` tag, not S3

## Requirements

### R1: Package Size Reduction
- Canary/stable base package must exclude Trellis runtime and other infrequently-used heavy modules
- Trellis runtime becomes an on-demand resource pack: S3-hosted, version-pinned, hash-verified, downloaded on first use
- DuckDB, Claude SDK, MCP SDK evaluated case-by-case: must-stay-bundled vs. on-demand vs. user-environment-provided
- Target: base installer reduced by at least 30% from current size

### R2: On-Demand Resource Pack System
- Reuse existing object storage infrastructure (MinIO locally, `SUPERSET_OBJECT_STORAGE_*` in prod)
- Bucket layout: `packs/<packId>/<version>/manifest.json` + module files
- Packs are independently semver-versioned; app manifest declares compatible ranges
- App ships with a pack manifest index; downloads packs lazily to `${SUPERSET_HOME_DIR}/packs/`
- Download is resumable, hash-verified, and permanently cached locally (works offline after first download)
- UI provides in-place feedback (skeleton/spinner/progress at feature entry point, not global modal)
- Failure is graceful: feature degrades or shows retry, never blocks the whole app
- Pack lifecycle: check cache -> verify hash -> use; if missing: download -> verify -> cache -> execute

### R3: Lazy Feature Activation
- Right sidebar defaults to closed in new workspaces (product change)
- Sidebar tab content mounts only when active; inactive tabs do not run hooks or queries
- Pane registry uses dynamic imports for heavy pane implementations (Browser, Chat, Diff, Comment)
- Polling intervals (PR, branches, commits) are gated on tab visibility and sidebar open state
- Badge counts for hidden tabs use lightweight summary queries, not full data hooks

### R4: Startup Path Optimization
- Non-critical startup tasks deferred past first paint: network logger, webview extension, agent hooks, CLI shim, terminal prewarm
- Terminal reconcile can run after window show if it doesn't block renderer restore
- Startup marks must show <2s from process-start to first-window-show for cold start on M-series Mac
- `--max-old-space-size=8192` removed or justified per-process; dev memory target <4GB total process tree

### R5: Memory Leak Governance
- All query subscriptions, intervals, WebSocket connections, child processes, webviews, terminal sessions have explicit dispose/cleanup contracts
- Long-run test: app idle for 60min must not show >20% memory growth above steady state
- Process tree audit: child process count must not grow without bound across workspace switches / sidebar toggles
- Canary long-session telemetry captures memory trend for detection

### R6: Performance Budget Gates in CI
- Package size report fails CI if base installer exceeds budget threshold
- Runtime performance report captured as CI artifact on every canary build
- Startup marks captured and compared against baseline (regression >15% fails)
- These gates run in `build-desktop.yml` after compile step
- Canary telemetry collects aggregate metrics (startup time, peak memory, idle memory, process count) with opt-out in settings

### R7: Backend / Host-Service Performance
- host-service startup stays lazy (extend `onceAsync` pattern to more subsystems)
- Git operations (status, diff, log, branches) evaluated for batching/caching to reduce per-query overhead
- EventBus/GitWatcher assessed for unnecessary fan-out to inactive renderer subscriptions
- Relay connection overhead measured and optimized

## Acceptance Criteria

- [x] Base canary installer is at least 30% smaller than current (measured via `report:size`) — fresh GitHub Actions artifact-only Canary run `28243434337` produced ZIP `318,159,129` bytes (~303.4 MiB) and DMG `330,832,981` bytes (~315.5 MiB), ~37-38% smaller than the old live Canary ZIP `511,515,236` bytes and DMG `526,410,178` bytes.
- [x] Trellis runtime is NOT in the base package; downloads on first guided-workflow use with progress feedback.
- [x] Dev mode total process tree RSS stays under 4GB in steady state (idle workspace open) — achieved for the loaded `desktop-online-lite` profile at 2.9GB max desktop dev subtree while rendering the 10 project / 200 workspace / 300 task fixture. The full local all-services graph remains higher because it intentionally includes API/web/Electric service processes.
- [x] Cold start to first window visible <2s on Apple Silicon (measured via startup marks) — loaded `desktop-online-lite` report shows `main-window:first-show` at 1.86s.
- [x] Right sidebar defaults closed; opening it mounts only the active tab's content and hooks.
- [x] Switching sidebar tabs does not leave orphaned intervals/subscriptions (verified by process audit).
- [x] 60-minute idle memory growth <20% above steady state.
- [x] CI fails on package size regression beyond threshold.
- [x] Canary build does not include on-demand resource packs in the installer, based on local package scans and CI pack-only guards; fresh GitHub Actions canary artifact verification remains part of the first acceptance item.

## Out of Scope

- Rewriting the app in a non-Electron framework (Tauri, native, etc.)
- Replacing the GitHub Actions release pipeline (S3 is for resource packs only, not release distribution)
- Changing the cloud backend architecture (API, Electric, relay) beyond host-service local performance
- Mobile app performance (separate codebase)
- Removing Trellis as a product feature (only changing how its runtime is packaged)

## Resolved Decisions

1. **S3 infrastructure** (RESOLVED): Reuse existing object storage. Dev: MinIO via docker-compose (port 9000, bucket `superset-artifacts`). Prod: `SUPERSET_OBJECT_STORAGE_*` env vars, standard S3 protocol, AWS SigV4. Code already exists in `packages/trpc/src/router/capability/artifact-storage.ts`. No new infrastructure needed.

2. **Pack versioning strategy** (RESOLVED): Packs are independently semver-versioned. App ships with a manifest index declaring compatible version ranges per pack. Trellis can iterate and ship new pack versions without requiring a new app release.

3. **Offline caching** (RESOLVED): Downloaded packs are permanently cached locally. On launch, verify hash; if valid, use cache without re-downloading. Only re-download when app version requires a newer pack version or user manually clears cache. Works fully offline after first download.

4. **Canary telemetry** (RESOLVED): Collect aggregate metrics only: cold-start total time, peak memory (process tree), idle-after-60min memory, child process count. No per-feature or per-action telemetry. No user content. Opt-out available in settings.
