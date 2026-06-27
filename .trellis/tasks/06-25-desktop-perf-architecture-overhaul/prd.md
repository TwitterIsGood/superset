# Desktop Performance and Architecture Overhaul

## Goal

Reduce desktop resource consumption (memory, package size, startup time) by restructuring the Electron app from "all capabilities built-in" to "thin shell + lazy activation + on-demand resource packs + hard budget gates." Improve dev experience (currently 10GB Force Quit-style memory pressure), canary build/download speed, startup, and every high-frequency interaction without abandoning Electron.

The performance target is now explicitly multi-layered:
- **Runtime app memory**: the Electron app, renderer, main process, host-service, terminal, webviews, and loose helper processes for the current worktree.
- **Development graph memory**: the current worktree app plus local/online-like services needed for desktop development, with per-worktree incremental cost low enough to run multiple worktrees.
- **Whole development pressure**: Superset worktrees plus container runtime and Codex/automation tooling, reported separately so "10GB in Force Quit" cannot be dismissed as a single-process measurement issue.
- **Package/download size**: Canary user-facing artifacts must keep shrinking toward a 100 MB target for macOS ZIP and the packaged `.app` payload wherever technically possible.
- **Canary build speed**: GitHub Actions remains the required release path, but quick canary validation must complete in <=5 minutes with a 3-minute target; published quick canaries must complete in <=8 minutes with a 5-minute target while still uploading/verifying resource packs; full canaries are tracked separately and must not hide quick-path regressions.
- **Interaction performance**: startup is not enough; route switches, tab switches, sidebar opening, task tables, file/changes/review panels, chat, terminal, and data-loaded states must remain responsive, non-janky, and non-blank under loaded fixtures.

## Problem Statement

User feedback across canary and dev:
- Desktop dev consumes ~10GB memory
- Local desktop development can still show 6-7GB+ process pressure when the whole worktree service graph, Docker/OrbStack, and automation tooling are counted; optimizing only the Electron child tree is insufficient for multi-worktree development.
- Canary builds are slow, downloads are slow, startup is slow
- First sidebar/panel open is slow (previously "optimized" by delaying sidebar mount, but underlying cost was deferred not eliminated)
- Canary has severe memory leaks under long sessions
- Package is ~500MB+ where comparable tools are much smaller
- Current optimized macOS arm64 Canary ZIP is `97.7 MB`, now below the 100 MB target after pruning unused macOS Electron locale payloads, removing the packaged SwiftShader fallback dylib, and keeping first-party/runtime packs out of the base installer. The remaining floor is still dominated by Electron Framework rather than Trellis/runtime packs.

Root causes identified through codebase inspection:
1. **Thick package**: Trellis runtime, DuckDB, Claude SDK, MCP SDK, and many native modules are all whole-module-copied into every build regardless of usage frequency
2. **Eager startup path**: main process runs app-state, TanStack persistence, network logger, webview extension, terminal reconcile/prewarm, agent hooks, CLI shim before/around window creation
3. **Fake lazy loading**: sidebar tabs and pane registry statically import all implementations; hooks (git queries, PR polling) execute regardless of active tab
4. **Missing budget gates**: no CI-enforced limits on package size, startup time, memory, or child process count
5. **Unclear lifecycle boundaries**: host-service, pty-daemon, terminal-host, webviews, query subscriptions, intervals all have complex cleanup paths prone to leaks
6. **Dev graph attribution gap**: previous reports separated the current Electron app from Docker/Codex/OrbStack, but the user's pain is total local development pressure when multiple worktrees run at once. Budget reports must show current-worktree, visible Superset, and whole developer-tooling totals.
7. **Interaction budget gap**: earlier acceptance centered on startup and first sidebar opening. The revised target covers every frequent product interaction under loaded data, including route/tab switching, filter/menu opening, scrolling, terminal/chat/file panes, and async loading states.

## Confirmed Facts (from codebase)

- Initial audit found `dev` and `compile:app` scripts setting `NODE_OPTIONS=--max-old-space-size=8192`; current implementation keeps it build-only for `compile:app` and removes it from desktop dev/worktree dev runtime paths.
- Canary config inherits base config fully; canary-specific overrides are only naming/branding ([electron-builder.canary.ts](apps/desktop/electron-builder.canary.ts))
- Initial audit found `runtime-dependencies.ts` whole-module-copying heavy native/agent runtimes including @ast-grep, MastraCode/DuckDB, Claude Agent SDK, and Trellis. Current implementation keeps only the base native runtime set (`better-sqlite3`, `node-pty`, `native-keymap`, `@parcel/watcher`, `libsql`, `@superset/macos-process-metrics`, and support modules) in the app package; Trellis, Claude Agent, MastraCode/DuckDB, Superset CLI, and @ast-grep are delivered through resource packs or build-only dependencies.
- `usePaneRegistry` statically imports BrowserPane, ChatPane, CommentPane, DiffPane, FilePane, TerminalPane and all their sub-components ([usePaneRegistry.tsx:47-59](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx))
- `WorkspaceSidebar` unconditionally calls `useChangesTab`, `useReviewTab`, `usePRFlowState`, and creates `FilesTab` + `ModelsTab` elements regardless of active tab ([WorkspaceSidebar.tsx:126-182](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/WorkspaceSidebar.tsx))
- Changes tab fires git.getBaseBranch, useChangeset, workspace.get, git.listCommits, git.listBranches on mount ([useChangesTab.tsx:47-117](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useChangesTab/useChangesTab.tsx))
- Review tab polls PR every 10s, threads every 30s ([useReviewTab.tsx:34-52](apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/hooks/useReviewTab/useReviewTab.tsx))
- host-service is spawned per-organization as ELECTRON_RUN_AS_NODE child ([host-service-coordinator.ts:378](apps/desktop/src/main/lib/host-service-coordinator.ts))
- host-service app.ts already uses `onceAsync` for chat runtime and chat service (good pattern to extend)
- Startup marks exist ([startup-performance.ts](apps/desktop/src/main/lib/startup-performance.ts)) and report scripts exist ([report-package-size.ts](apps/desktop/scripts/report-package-size.ts), [report-runtime-performance.ts](apps/desktop/scripts/report-runtime-performance.ts))
- CI already runs `report:size --top=15` after compile but does not enforce thresholds
- Canary releases via GitHub Actions to `desktop-canary` tag, not S3
- Electron's official performance checklist calls out the same classes of issues this task is attacking: carelessly included modules, loading/running code too soon, blocking the main/renderer process, unnecessary network requests, and failure to bundle code. This supports continuing with a thin Electron shell rather than assuming Electron itself is the root cause.

## Requirements

### R1: Package Size Reduction
- Canary/stable base package must exclude Trellis runtime and other infrequently-used heavy modules
- Trellis runtime becomes an on-demand resource pack: S3-hosted, version-pinned, hash-verified, downloaded on first use
- DuckDB, Claude SDK, MCP SDK evaluated case-by-case: must-stay-bundled vs. on-demand vs. user-environment-provided
- Target: base installer reduced by at least 30% from current size
- New package target: macOS arm64 Canary ZIP under 100 MB; `.app` payload should be treated as the preferred optimization target when possible, but ZIP/download size remains the user-facing release gate.
- CI hard limits may stay above the current artifact while optimization is in progress, but budget target lines must stay at 100 MB so regressions are visible.

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
- `--max-old-space-size=8192` removed or justified per-process; memory optimization must be source-level first, not just caps.
- Current-worktree desktop dev memory target: <=1.5 GiB steady state with loaded fixture, <=2 GiB hard guard.
- Visible Superset development graph target: <=3 GiB for the default `desktop-online-lite` loaded profile.
- Per-additional-worktree incremental target: <=1.5 GiB steady state; multi-worktree development must not require duplicating heavyweight API/web/Electric stacks unless explicitly requested.

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
- Local development memory reports must include current worktree, visible Superset-related, container runtime, Codex/automation, and developer-tooling totals, with separate budgets for current-worktree hard failure and whole-dev-pressure visibility.
- Loaded interaction gates must cover `/v2-workspaces`, `/tasks`, workspace detail, right sidebar Files/Changes/Review/Models, chat, terminal, and common popovers/menus. Passing startup alone is not acceptable.

### R8: Interaction Performance And UX Stability
- Opening/switching routes and tabs must not blank the page, shift layout unexpectedly, or mount hidden heavy hooks.
- Default visible surfaces should render lightweight shells first, then load expensive content in-place with skeleton/progress feedback.
- Controls that trigger on-demand packs or lazy chunks must give local feedback at the exact entry point and remain retryable.
- Scrolling dense tables/lists must stay virtualized and avoid per-row subscriptions unless the row interaction requires them.
- Data-loaded fixtures are mandatory for validation; empty-account screenshots do not prove performance.

### R7: Backend / Host-Service Performance
- host-service startup stays lazy (extend `onceAsync` pattern to more subsystems)
- Git operations (status, diff, log, branches) evaluated for batching/caching to reduce per-query overhead
- EventBus/GitWatcher assessed for unnecessary fan-out to inactive renderer subscriptions
- Relay connection overhead measured and optimized

## Acceptance Criteria

### Baseline Achieved

- [x] Base canary installer is at least 30% smaller than current (measured via `report:size`) — full no-release GitHub Actions Canary run `28254206256` produced macOS arm64 ZIP `145,424,568` bytes / DMG `150,883,297` bytes, macOS x64 ZIP `152,383,536` bytes / DMG `157,877,712` bytes, and Linux x64 AppImage `154,767,120` bytes. This is roughly a 70% reduction from the old live Canary ZIP `511,515,236` bytes and DMG `526,410,178` bytes.
- [x] Trellis runtime is NOT in the base package; downloads on first guided-workflow use with progress feedback.
- [x] Dev mode total process tree RSS stays under 4GB in steady state (idle workspace open) — achieved for the loaded `desktop-online-lite` profile at 2.9GB max desktop dev subtree while rendering the 10 project / 200 workspace / 300 task fixture. The full local all-services graph remains higher because it intentionally includes API/web/Electric service processes.
- [x] Cold start to first window visible <2s on Apple Silicon (measured via startup marks) — loaded `desktop-online-lite` report shows `main-window:first-show` at 1.86s.
- [x] Right sidebar defaults closed; opening it mounts only the active tab's content and hooks.
- [x] Switching sidebar tabs does not leave orphaned intervals/subscriptions (verified by process audit).
- [x] 60-minute idle memory growth <20% above steady state.
- [x] CI fails on package size regression beyond threshold.
- [x] CI/runtime budget gates fail desktop memory regressions before they can return to the reported 7-10GB class: desktop process tree hard limit is 4 GiB, all tracked process hard limit is 6 GiB, with lower targets for follow-up pressure.
- [x] Canary build does not include on-demand resource packs in the installer, based on local package scans and CI pack-only guards. Published no-CLI builds now require object-storage upload, `SUPERSET_RESOURCE_PACK_BASE_URL`, and public pack download verification; production S3/CloudFront secrets are still the external deployment item before a live release can serve packs to users.

### Revised Acceptance Targets

- [x] macOS arm64 Canary ZIP <=100 MB target, <=150 MB hard guard while the 100 MB work is in progress. Current evidence: `97.7 MB` local no-CLI arm64 Canary ZIP, package budget target `100.0 MB` passes.
- [x] Packaged `.app` payload has an explicit report line and optimization backlog; remaining Electron Framework floor is documented separately from first-party app payload. Current evidence: `.app` output directory `239M`, `app.asar` `31M`, `app.asar.unpacked` `6.7M`, Electron Framework binary remains the largest payload.
- [x] Current worktree app + loose helpers <=1.5 GiB target and <=2 GiB hard guard after loaded `/v2-workspaces` + `/tasks` interaction pass. Current evidence after loaded UI plus workspace/sidebar/task interactions: `1.48 GiB` current worktree app+helpers; after the fuller chat/terminal/file pane interaction pass the current worktree is `1.55 GiB`, still under the `2 GiB` hard guard and slightly above the aspirational `1.5 GiB` target.
- [x] Visible Superset-related development graph <=3 GiB target for the default loaded `desktop-online-lite` profile. Current evidence after loaded UI plus workspace/sidebar/task interactions: `2.44 GiB` visible Superset-related.
- [x] Dev memory reporting always prints current worktree, visible Superset-related, container runtime, Codex/automation, and whole developer-tooling totals; no final memory claim may cite only one layer. `dev:worktree:memory` now also supports `--baseline-report` for multi-worktree delta reporting.
- [x] Canary build budget is enforced and reported by path: artifact-only quick <=5 min hard / <=3 min target, published quick <=8 min hard / <=5 min target, full <=15 min hard / <=10 min target, with compile/package/install/upload phases shown separately. Current implementation adds `check:canary-build-duration`, reads GitHub Actions job/step timings from the current run, and fails the lane when total or critical phase budgets are exceeded. Published quick now also moves resource-pack object-storage upload into a parallel job and exposes `vars.DESKTOP_CANARY_MACOS_RUNNER` so CI can use an enabled faster macOS runner without code changes. Latest pre-split evidence still shows ordinary GitHub macOS runner compile/package as the blocker (`electron-vite` `6m57s`, Electron ZIP `2m11s` on run `28257685166`).
- [x] Multi-worktree scalability report records the incremental memory cost of starting a second loaded desktop worktree. Current evidence: temporary second worktree `/Users/bichengyu/.codex/worktrees/perf2/superset` ran `desktop-online-lite` against the shared online-like 430xx services, skipped its local Docker data stack, passed the full loaded UI gate with 18 interactions and 0 console errors, and reported second-worktree app memory `948.7 MiB`, visible Superset-related memory `2.89 GiB`, and developer-tooling incl. Codex `6.50 GiB` from `perf2-status-after-loaded-2026-06-27.txt`. The cross-worktree memory artifact `after-second-worktree-loaded-2026-06-27.json` records whole developer pressure separately; classification is conservative because shared Electron binaries can make the main-worktree view include both worktrees.
- [x] Loaded interaction gate covers route switches, right-sidebar tab switches, task table filter/menu opening, chat first send path, terminal pane attach, file pane open, and changes/review panels with console errors at 0. Current coverage includes `/v2-workspaces`, local host-backed workspace detail open, v2 right sidebar open, Files/Changes/Review/Models tab switches, workspace Chat open + first send, Terminal pane attach, file pane open from Files, `/tasks` project/status/assignee menus, table/board view switches, Tasks/PRs/Issues switches, and 0 console errors.
- [x] Source-level guards prevent hidden default-path imports/subscriptions from returning to loaded routes and tables. Current guards include sidebar lazy-tab hook checks, pane-registry lazy renderer checks, authenticated-layout subscription gating, route-shell lazy checks, and a default-route guard that keeps `/v2-workspaces` and `/tasks` from statically importing workspace pane/sidebar runtimes.
- [x] Canary telemetry and local reports identify memory growth/leaks by process role and lifecycle action, not only by aggregate total. `run-runtime-memory-scenario` now emits `lifecycleRoleDeltas` in JSON and a Markdown "Role Memory Deltas By Lifecycle Step" table computed between snapshots, while preserving raw per-snapshot process rows for deeper leak triage.

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
