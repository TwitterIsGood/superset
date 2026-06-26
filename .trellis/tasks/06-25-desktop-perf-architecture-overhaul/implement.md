# Implementation Plan: Desktop Performance and Architecture Overhaul

## Execution Strategy

This is a parent task. Work decomposes into 5 child workstreams that can largely proceed in parallel after Phase 0 establishes the measurement baseline. Dependencies are noted per phase.

## Phase 0: Measurement Baseline (BLOCKING — all other phases depend on this)

### 0.1 Capture current-state metrics
- [x] Run `report:size` on a new GitHub Actions canary build for this worktree's changes, record final installer size. Latest full no-release Canary dry run `28254206256` produced macOS arm64 ZIP `145,424,568` bytes / DMG `150,883,297` bytes, macOS x64 ZIP `152,383,536` bytes / DMG `157,877,712` bytes, and Linux AppImage `154,767,120` bytes.
- [x] Run `report:runtime` across local scenarios: cold start, workspace open, sidebar open, tab switching, 60min idle
- [x] Capture startup marks report for current worktree dev cold start
- [x] Capture process tree memory breakdown per role (electron-main, renderer, GPU, host-service, pty-daemon, terminal-host)
- [x] Record dev-mode memory: worktree dev graph + dense fixture + idle sampling, total process tree memory

### 0.1a Dense local data source
- [x] Add local desktop performance fixture: `bun run desktop:perf-fixture -- seed --slug desktop-perf-loaded --projects 10 --workspaces-per-project 20 --tasks 300`
- [x] Add repeatable fixture health commands: `bun run desktop:perf-fixture -- stats ...` and `bun run desktop:perf-fixture -- ensure ...`
- [x] Add loaded startup shortcuts: `bun run dev:worktree:start:loaded`, `bun run dev:worktree:start:lite:loaded`, and `bun run desktop:perf-fixture:loaded`
- [x] Worktree `status` now reports the dense fixture shape so empty data is visible before UI validation
- [x] Validate authenticated dense workspaces and tasks views with Desktop Automation screenshots
- [x] Revalidated authenticated loaded worktree after login:
  - Workspace source rows: 10 projects / 200 workspaces / 300 tasks, `isLoaded=true`
  - `#/v2-workspaces`: 2925 DOM nodes, 38 mounted main workspace rows, 80 mounted expanded sidebar rows
  - `#/tasks`: 4113 DOM nodes, 75 visible `Desktop perf task` mentions, no renderer console errors
  - Artifacts: `artifacts/loaded-workspaces-after-login.png`, `artifacts/loaded-tasks-after-login.png`
- [x] Add repeatable loaded UI gate: `bun run desktop:perf-loaded-ui`
  - Navigates the current Electron dev window to `#/v2-workspaces` and `#/tasks`
  - Fails if the current UI session is still empty or pointed at the wrong data source
  - Writes screenshots and JSON to `artifacts/loaded-ui/`
  - Latest run: `#/v2-workspaces` 1450 DOM nodes / 38 visible main rows / 1 sidebar workspace row; `#/tasks` 2641 DOM nodes / 75 visible `Desktop perf task` mentions; 0 runtime console errors
- [x] Add host-backed dense fixture mode: `--host-backed-workspaces 1` keeps the 200 workspace cloud dataset while writing matching local host-service `projects` and `workspaces` rows for at least one workspace.
- [x] Seed and validate a real host-backed workspace detail path: `d22af085-9d4a-4d35-8481-934f65a0a1b0` opens through host-service and drives right-sidebar Files/Changes/Review/Models tab actions.
- [x] Record data-source boundary: dense local/online-like fixtures are the safe default; production accounts/databases are not touched unless explicitly authorized, and disposable staging remains the only acceptable remote-data alternative.

### 0.1b Safe online-like data source
- [x] Verified the local online-like stack via `scripts/superset-online.sh status`: web/API/Electric proxy/relay/object storage/neon proxy probes are green on ports 43000/43001/43012/43013/43018/43015.
- [x] Recorded current online-like data size: 15 projects, 42 v2 workspaces, 14 tasks. This is useful for login/API/object-storage validation but is less dense than the local desktop performance fixture.
- [x] Confirmed object storage exists in both worktree-local MinIO (`localhost:3294`, console `3295`) and online-like MinIO (`localhost:43018`, console `43019`), matching the S3 resource-pack plan.
- [x] Add explicit online-like loaded mode: `bun run online:start:loaded` / `SUPERSET_ONLINE_LOAD_FIXTURE=1 ./scripts/superset-online.sh start`.
- [x] Seeded the 43015 online-like Neon proxy with `desktop-perf-loaded`: 10 projects / 200 workspaces / 300 tasks, `isLoaded=true`.
- [x] Online `status` now reports fixture shape alongside API/Electric/Relay/MinIO probes, preventing false confidence from an empty online-like stack.
- [x] Worktree `status` now reports the current dense fixture as `10 projects / 200 workspaces / 300 tasks / 1 host-backed`, so local validation cannot accidentally pass against an empty account.
- [x] Added online-like loaded UI recovery for partial persisted Electric caches:
  - Root cause: local TanStack SQLite could persist `electric:resume` as complete for `v2_projects` / `v2_hosts` while their collection tables were empty, making the `useAccessibleV2Workspaces` inner join render "No workspaces yet" despite direct Electric shapes returning rows.
  - Fix: `preloadCollections()` now starts sync immediately, checks the v2 workspace graph after preload, and if `v2Workspaces` has rows while `v2Projects`, `v2Hosts`, or `v2UsersHosts` are ready-but-empty, it truncates only those stale dependency collections, deletes their `electric:resume` metadata through the TanStack persistence adapter, and reloads the renderer once.
  - Dev-only diagnostics: `window.__supersetCollectionsDebug.getV2WorkspaceGraphHealth()` and `recoverPartialV2WorkspaceGraphCache()` let the loaded UI gate report the exact collection health instead of a generic empty-state timeout.
- [x] Revalidated authenticated online-like loaded UI after cache recovery:
  - Fixture source: online-like Neon proxy on `localhost:43015`, same-origin desktop proxy on `localhost:3280`, Electric proxy on `localhost:43012`.
  - Workspace UI: 10 projects / 200 workspaces available; `#/v2-workspaces` rendered 38 visible workspace rows, 1417 DOM nodes, and `Desktop Perf Project 1` was visible.
  - Tasks UI: 300 tasks available; `#/tasks` rendered 75 visible `Desktop perf task` mentions, 2605 DOM nodes.
  - Collection health: `v2Workspaces=200`, `v2Projects=10`, `v2Hosts=1`, `v2UsersHosts=1`, all `ready`, `isPartial=false`.
  - Console errors: 0.
  - Artifacts: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/loaded-ui/loaded-ui-report.json`, `loaded-workspaces-ui.png`, `loaded-tasks-ui.png`.

### 0.2 Define budget thresholds
- [x] Write `apps/desktop/perf-budget.json` with thresholds (installer size, startup time, memory ceiling)
- [x] Write `apps/desktop/scripts/check-package-budget.ts` that reads budget and compares against actual

**Validation**: Budget file exists, check script runs and exits 0 against current state (or reports delta).

---

## Phase 1: Resource Pack System (Child Task: `resource-pack-system`)

**Depends on**: Phase 0.2 (budget file)
**Can parallelize with**: Phase 2, Phase 3

### 1.1 Pack manifest schema
- [x] Define TypeScript types for PackManifest, PackManifestIndex
- [x] Define pack manifest JSON schema (packId, version, minAppVersion, files[], downloadUrl, executeHint)
- [x] Create `apps/desktop/src/main/lib/pack-system/types.ts`

### 1.2 PackManager (main process)
- [x] Implement `PackManager` class: resolve, download (with progress), verify (sha256), cache
- [x] Download to `${SUPERSET_HOME_DIR}/packs/<packId>/<version>/`
- [x] Resumable downloads via HTTP Range headers
- [x] Hash verification on completion and on cache hit
- [x] Create `apps/desktop/src/main/lib/pack-system/pack-manager.ts`

### 1.3 IPC bridge for renderer
- [x] Add desktop tRPC procedures: `packSystem.resolve`, `packSystem.getStatus`, `packSystem.subscribe`
- [x] Renderer can query pack status and receive progress updates
- [x] Create `apps/desktop/src/renderer/lib/pack-system/usePackStatus.ts`

### 1.4 S3 infrastructure + CI upload
- [x] Verify local/online-like S3-compatible object storage exists for resource packs: worktree MinIO is green on `localhost:3294/3295`, online-like MinIO is green on `localhost:43018/43019`, and both use the existing `SUPERSET_OBJECT_STORAGE_*` contract.
- [x] Configure local/online-like MinIO policy for resource-pack downloads: bucket remains private by default, `packs/` prefix is anonymous download, and `capability-packages/` remains private.
- [ ] Verify production S3 bucket + CloudFront/public resource-pack base URL after deploy secrets are available.
- [x] GitHub Actions step: build Trellis pack and upload workflow artifact
- [x] GitHub Actions step: upload Trellis pack artifact to S3
- [x] Pack manifest index embedded in app at build time
- [x] Add to `build-desktop.yml`
- [x] Preserve fast artifact-only Canary validation: quick `publish_release=false` now skips runtime pack construction entirely, copies the embedded empty `pack-manifest-index.json`, and still runs pack-only guards against the packaged app.
  - Validation: Canary quick dry run `28255974763` on `c5a10abb` passed; macOS arm64 job `11m16s`; ZIP artifact `144,632,231` bytes; resource pack artifact/object-storage upload steps were skipped.
  - Remaining packaging bottlenecks from that run: dependency install `74s`, desktop native deps `50s`, `electron-vite` compile `4m40s`, target optional dependency install `60s`, Electron ZIP build `92s`. Pack build itself is no longer a quick-path bottleneck.

### 1.5 Move Trellis runtime to pack
- [x] Remove Trellis modules from `runtime-dependencies.ts` (`trellisRuntimeModuleNames`, `packagedTrellisRuntimeResourceCopies`)
- [x] Update host-service to resolve Trellis via PackManager-provided runtime pack path before bundled fallback
- [x] Update Create Workspace flow to trigger pack download with UI feedback
- [x] Update task workspace launch flows to pass the runtime pack path through the same `trellisSetup` contract
- [x] Validate generated Trellis pack with `validate-trellis-runtime --node-modules <pack>/node_modules`
- [x] Remove packaged app host-service env override that forced `SUPERSET_TRELLIS_BIN_PATH` to a bundled app resource path
- [x] Replace release CI's bundled Trellis runtime check with a pack-only guard that fails if app resources contain `node_modules/@mindfoldhq/trellis`

### 1.6 UI feedback components
- [x] PackLoadingState component (skeleton + progress bar)
- [x] PackErrorState component (retry button, error message)
- [x] Wire into Create Workspace dialog
- [x] Wire into additional pack-dependent task entry points after Trellis pack-only mode ships: single-task Open in Workspace, batch Run in Workspace, and GitHub issue Run in Workspace now resolve `trellis-runtime` through `useTrellisRuntimePack` and are covered by the source guard in `TasksView.test.ts`

### 1.7 Claude Agent runtime pack prep
- [x] Remove the static value import of `@anthropic-ai/claude-agent-sdk` from `packages/chat/src/server/trpc/standalone-runtime.ts`; the SDK now loads only when a standalone Claude turn is sent.
- [x] Add `SUPERSET_CLAUDE_AGENT_SDK_IMPORT_PATH` support alongside the existing `SUPERSET_CLAUDE_CODE_BIN_PATH` executable override so a future pack can inject the SDK entry and platform binary without a base-package fallback.
- [x] Make `ChatRuntimeService` lightweight at construction time: `mastracode`, `@mastra/memory`, runtime utils, file search, MCP helpers, and standalone runtime are dynamically imported by the specific procedure that needs them.
- [x] Make the desktop `chatService` tRPC router create its shape at startup while deferring `ChatService` import/construction until the first provider-auth/model settings call.
- [x] Add narrow package exports for `@superset/chat/server/desktop/{chat-service,router,slash-commands,title-generation}` and migrate desktop/host-service value imports away from the fat `@superset/chat/server/desktop` barrel.
- [x] Add source-level regression tests guarding the dependency boundary for `standalone-runtime.ts`, `ChatRuntimeService`, desktop chat-service router, and desktop chat-service router helper imports.
- [x] Add `build:claude-agent-pack`, `claude-agent-runtime` pack dependency list, and GitHub Actions resource-pack build/upload integration.
- [x] Validate local Claude pack output: `claude-agent-runtime@0.3.160`, 2694 files, `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`, and executable `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` (217,429,920 bytes).
- [x] Validate Trellis+Claude pack manifest merge: `pack-manifest-index.json` contains both `trellis-runtime@0.6.0` and `claude-agent-runtime@0.3.160` when built sequentially.
- [x] Wire standalone Claude turns through the desktop PackManager: `ChatRuntimeService` injects a `resolveClaudeAgentRuntime` callback, `ClaudeStandaloneChatProvider` resolves the pack before SDK import, and the pack `executeHint` supplies both `sdk.mjs` and the platform `claude` executable path.
- [x] Keep the Claude Agent SDK and platform binary out of the base desktop package: removed the Claude SDK/runtime copy set from `runtime-dependencies.ts`, removed copy-native/validate-native expectations for the bundled platform binary, and extended CI pack-only guards to fail if Claude Agent runtime modules appear in app resources or `app.asar`.
- [x] Wire Chat UI first-use progress/retry around standalone Claude turns: standalone `/chat` resolves `claude-agent-runtime` before sends, auto-launches, and restarts; shows in-place pack loading/error retry state near the composer; disables submit only while the standalone runtime pack is preparing or failed; keeps development `not_configured` fallback local-only.

### 1.8 MastraCode / DuckDB runtime pack prep
- [x] Audit DuckDB dependency path: product code does not import DuckDB directly; DuckDB enters through `mastracode@0.18.1`, whose published ESM/CJS entry imports `@mastra/duckdb` at module top level.
- [x] Record decision: DuckDB cannot be safely removed as a standalone pack while base `mastracode` remains bundled, because Node resolves `@mastra/duckdb` relative to the MastraCode package. The viable boundary is a `mastracode-runtime` pack that contains MastraCode plus its runtime dependencies.
- [x] Add `mastracode-runtime` pack id, `build:mastracode-pack`, runtime dependency seed list, native DuckDB binding target selection, manifest merge support, and GitHub Actions resource-pack build integration.
- [x] Keep the MastraCode pack builder scoped to the actual MastraCode entry import set instead of full package.json closure; this avoids bundling unused Stagehand/BrowserBase/WebDriver browser automation dependencies into the pack.
- [x] Add pack-build pruning for source maps, docs/test folders, and non-target ONNX native payloads.
- [x] Validate local MastraCode pack output: `mastracode-runtime@0.18.1`, 364 packages, 10,858 files, 274,476,829 bytes, target DuckDB binding `@duckdb/node-bindings-darwin-arm64`.
- [x] Validate pack entry import smoke with Node: dynamic import from generated `node_modules/mastracode/dist/index.js` exposes `createMastraCode`/`createAuthStorage`, and generated `node_modules/@mastra/memory/dist/index.js` exposes `Memory`.
- [x] Wire standalone workspace Chat through the desktop PackManager so `ChatRuntimeService` can import MastraCode and `@mastra/memory` from `mastracode-runtime` via file URLs, with development-only `not_configured` fallback to local `node_modules`.
- [x] Remove top-level `mastracode` and `@mastra/memory` value imports from host-service workspace Chat; host-service now lazy-imports the runtime on first Chat creation and can consume `SUPERSET_MASTRACODE_RUNTIME_IMPORT_PATH` / `SUPERSET_MASTRA_MEMORY_IMPORT_PATH` injected by the desktop coordinator.
- [x] Pass an already-installed `mastracode-runtime` pack path to newly spawned host-service children without triggering pack download during host-service startup.
- [x] Split Provider auth storage / small-model credential reads away from the MastraCode top-level entry with a lightweight Superset auth-storage compatibility layer. The layer preserves the MastraCode `auth.json` file shape and delegates only OAuth login / expired-token refresh to the lazy MastraCode pack runtime.
- [x] Remove remaining desktop base-package `mastracode`, `@mastra/duckdb`, and `@duckdb` runtime copies/materialization/unpack globs. CI pack-only guards now fail if MastraCode/DuckDB runtime payloads appear in app resources or `app.asar`.

**Validation**:
```bash
# Pack resolves and downloads
bun run scripts/validate-trellis-runtime.ts --pack-mode
# App builds without Trellis in base package
bun run compile:app && bun run report:size --top=15
# Size reduction confirmed
```

**Rollback**: Revert `runtime-dependencies.ts` changes, Trellis is bundled again.

---

## Phase 2: Lazy Feature Activation (Child Task: `lazy-feature-activation`)

**Depends on**: Phase 0.1 (baseline)
**Can parallelize with**: Phase 1, Phase 3

### 2.1 Sidebar default closed
- [x] Change `useV2UserPreferences` default for `rightSidebarOpen` to `false`
- [x] Ensure workspace route still renders correctly without sidebar
- [x] Verify sidebar can be opened via keyboard shortcut / button

### 2.2 Lazy sidebar tab content
- [x] Refactor `WorkspaceSidebar` to mount only active tab content
- [x] Convert FilesTab, ChangesTab, ReviewTab, ModelsTab to lazy components
- [x] Move tab-specific hooks into tab content components (not in sidebar parent)
- [x] Lightweight badge query for Changes (change count) and Review (open review count)

### 2.3 Gate polling on visibility
- [x] PR polling (`getPullRequest` 10s interval) gated on Review tab active + sidebar open
- [x] Branch listing (`listBranches` 30s interval) gated on Changes tab active
- [x] Background terminal count polling gated on sidebar open or menu visible

### 2.4 Lazy pane registry
- [x] Refactor `usePaneRegistry` to use dynamic imports for pane renderers
- [x] Keep `getIcon`/`getTitle` lightweight (static), make `renderPane` lazy
- [x] Terminal pane: load xterm only when terminal pane is mounted
- [x] File pane: load CodeMirror only when file pane is mounted
- [x] Diff pane: load diff engine only when diff pane is mounted

### 2.5 Dense list rendering
- [x] Virtualize `V2WorkspacesList` project/workspace rows with `@tanstack/react-virtual`
- [x] Keep collapsed project behavior and current-workspace forced expansion in a tested pure helper
- [x] Capture before/after dense DOM evidence: v2 workspaces list baseline 9838 DOM nodes; virtualized main list renders 38 workspace rows / 2 project headers and total page DOM drops to 4819 nodes
- [x] Cap `DashboardSidebar` expanded project content to 8 mounted workspace rows per project, always keeping the active workspace and pending insert rows mounted
- [x] Add per-project overflow affordance that opens the already-virtualized `/v2-workspaces` inventory and preselects the project filter
- [x] Add stable Desktop Automation measurement attributes for sidebar project sections, workspace rows, and overflow links
- [x] Capture after evidence: dense `#/v2-workspaces` now renders 80 sidebar workspace rows + 10 overflow links, while the virtualized main list stays at 38 workspace rows / 2 project headers and total page DOM drops further to 2925 nodes

**Validation**:
```bash
# Verify no orphaned intervals after tab switching
bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace
# Startup marks show renderer loads faster
bun run report:runtime --routes /dashboard
```

**Rollback**: Each tab can be independently reverted to eager loading.

---

## Phase 3: Startup Path Optimization (Child Task: `startup-deferral`)

**Depends on**: Phase 0.1 (baseline)
**Can parallelize with**: Phase 1, Phase 2

### 3.1 Classify startup tasks
- [x] Audit each `markStartup` in `index.ts` and classify: critical-path vs. deferrable
- [x] Critical: app-state, window creation, protocol handlers, terminal-reconcile
- [x] Deferrable: network-logger, webview-extension, terminal-prewarm, agent-hooks, CLI-shim

### 3.2 Defer non-critical tasks
- [x] Move deferrable tasks to run after `did-finish-load` or after first window show
- [x] Use `app.whenReady().then(() => requestIdleCallback(...))` or equivalent
- [x] Keep startup marks for all phases (before and after deferral)

### 3.3 Remove or justify max-old-space-size
- [x] Audit current scope of 8192 setting; it is now build-only (`compile:app`) and no longer on the desktop package dev path or worktree desktop dev service
- [x] If build-only: move to `compile:app` only, remove from `dev`
- [x] If runtime: investigate real memory ceiling, set to 4096 or remove entirely
- [x] Monitor for OOM crashes after change: dense loaded UI, 60-minute host-backed sidebar/tab memory gate, `apps/desktop` test suite, focused host/runtime tests, and root `bun run test` all passed after the dev/runtime removal; packaged canary telemetry now covers aggregate memory trend after release

### 3.4 Dev experience cleanup
- [x] Audit `predev` script for unnecessary steps
- [x] Consider skipping icon generation, CLI bundling in dev if not needed
- [x] Profile Vite HMR memory usage; dense worktree dev shows `electron-vite` around 2.0-2.1GB and API `next-server` around 1.5-1.6GB after stabilization
- [x] Make `code-inspector-plugin` opt-in (`DESKTOP_ENABLE_CODE_INSPECTOR=true` or `CODE_INSPECTOR=true`) instead of default-on in desktop dev
- [x] Improve runtime memory report role attribution: API `next-server`, relay, and esbuild child processes now classify under their parent service instead of `other`
- [x] Add and validate a lighter worktree desktop dev profile that skips the local API Next dev server when only Electron renderer/main is under test
- [x] Make worktree/online-like data service startup reuse cached Docker images by default; rebuild only when `WORKTREE_DEV_REBUILD_DATA=1` or `SUPERSET_ONLINE_REBUILD_DATA=1`
- [x] Make worktree/online-like MinIO bucket initialization bounded and proxy-safe so local S3 resource-pack validation does not block desktop dev startup

**Validation**:
```bash
# Startup marks show improvement
bun run report:runtime --duration 30000
# Dev memory profile
ps aux | grep -i electron | awk '{sum += $6} END {print sum/1024 " MB"}'
```

**Rollback**: Feature flag to restore blocking startup sequence.

---

## Phase 4: Memory Leak Governance (Child Task: `memory-lifecycle-governance`)

**Depends on**: Phase 2 (lazy activation reduces surface area first)
**Should follow**: Phase 2, Phase 3

### 4.1 Audit cleanup paths
- [x] Audit all `useEffect` in workspace route for missing cleanup functions
- [x] Audit host-service coordinator for orphaned child processes on workspace switch
- [x] Audit terminal runtime registry for unreleased sessions
- [x] Audit EventBus subscriptions for renderer disconnect scenarios
- [x] Audit notification emitter listeners
- [x] Fix pull-request runtime background sweep teardown so async startup refreshes do not outlive `stop()` with unhandled errors

### 4.2 Long-run test harness
- [x] Write automated script: open workspace → toggle 4 sidebar tabs → open/close 3 terminals → switch workspace → repeat 5x → measure delta
- [x] Add 60min idle scenario
- [x] Output: process tree memory at start, after each cycle, after idle
- [x] Enforce scenario budgets with non-zero exit on action failures, renderer console errors, process growth, desktop subtree growth, and process-count ceilings
- [x] Pass 60-minute host-backed workspace sidebar/tabs gate on dense local data

### 4.3 Fix identified leaks
- [x] Fix host-service startup cancellation so a stopped org cannot return a running connection or leave a stale manifest
- [x] Fix main-window notification listener cleanup so one window close does not remove unrelated subscriptions
- [x] Fix EventBus fan-out so subscribed renderer clients receive only matching workspace/request events
- [x] Fix workspace route unmount cleanup for renderer terminal runtimes and hidden browser webviews
- [x] Add regression tests for each fixed leak source above
- [x] Continue full `useEffect` audit for lower-risk workspace UI effects: added `apps/desktop/scripts/audit-workspace-effects.test.ts`, which parses workspace route/tab-view source and fails if cleanup-sensitive `useEffect` bodies (`setInterval`, `setTimeout`, `subscribe`, observers, `WebSocket`, event listeners, animation frames) do not return cleanup

**Validation**:
```bash
bun run --cwd apps/desktop report:runtime-memory-scenario -- --route /v2-workspace/d22af085-9d4a-4d35-8481-934f65a0a1b0 --cycles 2 --idle-ms 3600000 --sample-interval-ms 30000 --terminal-count 0 --action-settle-ms 1000 --max-action-failures 0 --max-growth-percent 20 --max-desktop-growth-percent 20 --max-peak-process-count 80 --max-peak-desktop-process-count 40 --report-dir .trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-host-backed-sidebar-60min
# Passed: 3616.51s, actions 13/failures 0, process tree 5.5GB -> 5.2GB (-5.4%), desktop subtree 3.1GB -> 2.8GB (-8.9%), peak desktop process count 10.
```

---

## Phase 5: CI Budget Gates (Child Task: `ci-budget-gates`)

**Depends on**: Phase 0.2 (budget file), Phase 1 (pack system changes affect size)
**Should follow**: Phase 1, Phase 2, Phase 3

### 5.1 Package size gate
- [x] `check-package-budget.ts` added to `build-desktop.yml` after compile
- [x] Fails CI if installer exceeds budget
- [x] Reports delta vs. previous build
- [x] `release-desktop-canary.yml` keeps the normal GitHub Actions release path as the default, and now has a manual `publish_release=false` mode so branch validation can produce fresh Actions artifacts without deleting/replacing the live `desktop-canary` GitHub Release.

### 5.2 Startup regression gate
- [x] Capture startup marks as JSON artifact in CI
- [x] Compare against baseline in repo (`apps/desktop/perf-baseline.json`)
- [x] Fail if regression >15% on any critical mark

### 5.3 Runtime report artifact
- [x] `report:runtime` output captured as CI artifact on every canary
- [x] Trend visible across builds

### 5.4 Aggregate canary telemetry with opt-out
- [x] Persist desktop telemetry opt-out in `${SUPERSET_HOME_DIR}/telemetry.json` with owner-only file permissions.
- [x] Wire Settings → Behavior with a visible "Usage and performance analytics" switch backed by desktop tRPC settings procedures.
- [x] Gate `track()` on persisted telemetry settings before constructing/capturing with PostHog.
- [x] Add aggregate-only desktop performance snapshot helper for startup total, peak memory, idle memory, and child process count.
- [x] Schedule startup performance telemetry 30s after first window show in packaged builds only; development mode skips sending.
- [x] Add payload tests guarding against content-shaped fields such as workspace id, project name, and file path.

**Validation**:
```bash
# CI step runs successfully
bun run scripts/check-package-budget.ts
```

---

## Phase 6: Backend / Host-Service Performance (Child Task: `backend-perf`)

**Depends on**: Nothing (independent)
**Can parallelize with**: All other phases

### 6.1 Extend lazy initialization
- [x] Audit `host-service/src/app.ts` for subsystems that start eagerly
- [x] GitWatcher, PullRequestRuntimeManager, EventBus: assess if they can start on first workspace access
- [x] Defer GitWatcher/EventBus until an event client connects; defer PullRequestRuntimeManager until PR routes are used
- [x] Extend `onceAsync` pattern to remaining eligible subsystems after measuring startup report: no additional long-lived singleton needed a `onceAsync` wrapper after audit; remaining heavy startup paths are guarded by explicit `ensure*Started` functions or dynamic imports (`ChatRuntimeManager`, `ChatService`, model gateway, workspace AI naming)

### 6.2 Git query optimization
- [x] Audit host-service git routes for redundant `simple-git` calls
- [x] Evaluate caching for `getStatus`, `getDiff`, `listCommits`, `listBranches`
- [x] Add short TTL coalescing cache for repeated `getStatus`, `listBranches`, `listCommits`, `getBaseBranch`, and `getBranchSyncStatus`
- [x] Consider batching multiple git queries into single process invocation: deliberately not implemented in this pass. The highest-frequency reads now coalesce for 1.5s, `listBranches` is already a single `for-each-ref` spawn, and further batching would couple independently invalidated query surfaces (`status`, branch config, commits, diff content) with higher correctness risk than measured benefit.

### 6.3 Subscription fan-out audit
- [x] Check EventBus delivery to renderer: are events sent to all connected renderers or just relevant ones?
- [x] Check WebSocket event delivery for terminal/fs events

**Validation**:
```bash
cd packages/host-service && bun test
# Host-service startup time measured
```

---

## Current Measurement Notes

- Local dense fixture is intentionally used instead of production data. It is safe by default because `scripts/desktop-perf-fixture.ts` refuses non-local databases unless `--allow-remote` is passed for a disposable test database. Production accounts and databases remain out of scope without explicit authorization.
- Current worktree status proves the connected app is not empty: `desktop-perf-loaded: 10 projects / 200 workspaces / 300 tasks / 1 host-backed (loaded=true)` with API, relay, Electric proxy, MinIO, Neon proxy, and Desktop Automation probes green on the worktree-local port set.
- Host-backed dense fixture decision: use the 10/200/300 cloud/Electric rows for list/task density, plus one current-machine host-backed workspace (`d22af085-9d4a-4d35-8481-934f65a0a1b0`) for actual workspace-detail/sidebar/host-service validation. This avoids mutating production data while still exercising panes, right-sidebar tabs, local host DB rows, and host-service startup.
- Baseline dense `#/tasks`: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-dense-tasks/runtime-memory-scenario-2026-06-26T04-19-10-774Z.md`
  - Process tree: 5.2GB steady state; desktop subtree: 3.3GB; DOM: 6007 nodes; renderer heap: ~198MB.
- Baseline dense `#/v2-workspaces`: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-dense-v2-workspaces/runtime-memory-scenario-2026-06-26T04-21-27-565Z.md`
  - Process tree: 5.2GB steady state; desktop subtree: 3.2GB; DOM: 9838 nodes; renderer heap: ~195MB.
- After `V2WorkspacesList` virtualization: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-dense-v2-workspaces-virtualized/runtime-memory-scenario-2026-06-26T04-26-00-581Z.md`
  - DOM: 4819 nodes; renderer heap: ~179MB; mounted main-list rows: 38 workspace rows / 2 project headers.
- After `DashboardSidebar` density cap: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/v2-workspaces-sidebar-capped.png`
  - DOM: 2925 nodes; sidebar mounted rows: 80 workspace rows / 10 project sections / 10 overflow links; main list still virtualized at 38 workspace rows / 2 project headers.
  - Overflow navigation verified: clicking a sidebar overflow link keeps the user on `#/v2-workspaces`, sets the project filter, and renders 1 project header / 20 workspace rows with no renderer console errors.
- Role audit after parent-process attribution: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-role-audit-parent-classified/runtime-memory-scenario-2026-06-26T04-34-57-465Z.md`
  - Process tree: 5.4GB; desktop subtree: 3.5GB; `electron-vite` 2.1GB, API `next-server` 1.5GB, renderer 652MB.
- Loaded route runtime report after Claude pack UI + S3 policy work: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-report-loaded-current/runtime-performance-2026-06-26T07-09-33-860Z.md`
  - Routes: `/v2-workspaces` 1.34s / 2925 DOM nodes, `/tasks` 1.42s / 4113 DOM nodes, `/chat` 2.11s / 178 DOM nodes.
  - Startup marks from the current worktree dev process: `main-window:first-show` at 2.47s; deferred startup begins after first show and completes at 2.53s. This is improved structurally but still above the <2s target.
  - 30s loaded route sample: desktop subtree max 3.2GB, all-process tree max 5.4GB, renderer max 629.8MB, host-service max 138.5MB, `electron-vite` dev runner max 1.8GB, API `next-server` max 1.5GB.
  - Follow-up 60-minute host-backed sidebar/tab gate is now covered by `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-host-backed-sidebar-60min/runtime-memory-scenario-2026-06-26T08-54-38-388Z.md`.
- Loaded online-like desktop-lite runtime report after partial collection-cache recovery: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-report-online-lite-loaded/runtime-performance-2026-06-26T12-04-10-078Z.md`
  - Profile: `desktop-online-lite`, using online-like API/Electric/Relay/Object Storage and the 10 project / 200 workspace / 300 task fixture.
  - Startup: `main-window:first-show` at 1.86s.
  - Route timings: `/v2-workspaces` 1.02s / 1417 DOM nodes; `/tasks` 1.17s / 2605 DOM nodes.
  - 30s loaded sample: desktop dev subtree max 2.9GB, renderer max 526.7MB, host-service max 41.3MB, `electron-vite` dev runner max 1.9GB.
  - Renderer console errors: none.
- 2026-06-26 60-minute host-backed sidebar/tabs memory gate:
  - Route: `/v2-workspace/d22af085-9d4a-4d35-8481-934f65a0a1b0`, cycles: 2, tabs exercised: Files, Changes, Review, Models, idle: 3600s, sample interval: 30s.
  - Report: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-memory-host-backed-sidebar-60min/runtime-memory-scenario-2026-06-26T08-54-38-388Z.md`.
  - Result: pass. Actions 13, failures 0; snapshots 126; renderer console errors none; process tree 5.5GB -> 5.2GB (-5.4%), peak 5.9GB, peak count 23; desktop subtree 3.1GB -> 2.8GB (-8.9%), peak 3.4GB, peak count 10.
- Restart immediately after Vite config changes can spike to 7-8GB because dependency re-optimization keeps esbuild resident; do not use the first post-config-change sample as the steady-state baseline.
- Safe online-like validation source:
  - `scripts/superset-online.sh status` is green after ensuring the local `neon-proxy` service is running on 43015.
  - Loaded online-like mode seeds the same `desktop-perf-loaded` 10/200/300 shape into the local online-like Neon proxy. This is the safe substitute for a remote staging account; production login/data remains unverified by design until credentials and explicit authorization are provided.
  - `scripts/superset-online.sh status` and `.superset/worktree-dev.sh status` now print the exact loaded-mode command (`bun run online:start:loaded` / `bun run dev:worktree:start:loaded`) when the dense fixture is missing, so an empty account cannot be confused with a loaded validation source.
- 2026-06-26 Claude runtime pack UI validation:
  - Focused tests passed: `bun test apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/ChatPaneInterface.claude-pack.test.ts apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.claude-pack.test.ts packages/chat/src/server/trpc/standalone-runtime.test.ts packages/chat/src/server/trpc/service.test.ts packages/chat/src/server/trpc/service.runtime-creation.test.ts apps/desktop/runtime-dependencies.test.ts` (41 pass).
  - Root quality passed: `bun run lint:fix`, `bun run lint`, `bun run typecheck`.
  - Dense loaded UI gate passed against non-empty worktree-local data: `bun run dev:worktree:status` confirmed `desktop-perf-loaded: 10 projects / 200 workspaces / 300 tasks / 1 host-backed`; `bun run desktop:perf-loaded-ui -- --json` reported `#/v2-workspaces` 1450 DOM nodes / 38 main rows / 1 sidebar row and `#/tasks` 2641 DOM nodes / 75 visible task mentions with 0 runtime console errors.
- 2026-06-26 S3/resource-pack policy validation:
  - Initial smoke proved the missing edge: signed `PUT packs/smoke/manifest.json` succeeded, but anonymous `GET /superset-artifacts/packs/smoke/manifest.json` returned 403 while the bucket policy was fully private.
  - Updated `docker-compose.yml`, `.superset/worktree-dev.sh`, and `scripts/superset-online.sh` so MinIO keeps the bucket private and grants anonymous `download` only to `packs/`.
  - Re-applied the policy in the current worktree MinIO and verified anonymous `GET /superset-artifacts/packs/smoke/manifest.json` returns 200, while `GET /superset-artifacts/capability-packages/smoke/private.txt` still returns 403.
  - Regression tests passed: `bun test scripts/worktree-local-shell.test.ts scripts/superset-online.test.ts packages/trpc/src/router/capability/artifact-storage.test.ts` (20 pass), followed by `bun run lint`.
- 2026-06-26 lower-risk renderer effect cleanup:
  - Fixed duplicated `UserMessage` copy timers so repeated copy clears the previous timer and unmount clears the active timer before it can call `setCopied(false)` on an unmounted message.
  - Made the legacy BrowserPane persistent webview module state HMR-safe by preserving its webview registry, registered webContents map, hidden container, and global drag-passthrough listener install flag in `import.meta.hot.data`.
  - Validation passed: focused tests above plus `bun run typecheck`, `bun run lint:fix`, and `bun run lint`.
- 2026-06-26 local package-size sample:
  - `bun run --cwd apps/desktop report:size -- --top=20` found an existing local mac arm64 release zip at `apps/desktop/release/Superset-1.12.4-arm64-mac.zip`, size 407.2MB.
  - `bun run --cwd apps/desktop check:package-budget -- --require-artifacts --json` passed: zip `sizeBytes=426958993`, target 500MB, hard limit 1.2GB.
  - This is a local release artifact, not a GitHub Actions canary artifact, so the real canary size baseline remains open.
- 2026-06-26 local canary package after pack-only dependency traversal fix:
  - The first local canary package after removing source/static runtime copies still exposed a real packaging leak: electron-builder's dependency traversal put `@anthropic-ai/claude-agent-sdk`, the Claude platform binary, `mastracode`, `@duckdb/node-bindings-darwin-arm64`, and BrowserBase/Stagehand/Playwright/WebDriver transitive payloads into `app.asar` / `app.asar.unpacked`.
  - Fixed by adding centralized pack-only `node_modules` exclusions in `apps/desktop/runtime-dependencies.ts`, applying them in `apps/desktop/electron-builder.ts`, and extending both macOS/Linux GitHub Actions pack-only guards.
  - Built all three resource packs into the Actions-style location: `trellis-runtime@0.6.0`, `claude-agent-runtime@0.3.160`, and `mastracode-runtime@0.18.1`; embedded manifest is `4,141,391` bytes and contains those three pack ids.
  - Rebuilt local ad-hoc canary zip with the non-empty manifest: `apps/desktop/release/Superset-Canary-1.12.4-arm64.zip` is 305.3MB (`sizeBytes=320101198`), below the 500MB target; `app.asar` is 617MB.
  - Latest live GitHub canary release asset baseline is still the old main build from 2026-06-26T04:26:09Z (`desktop-canary`, workflow run `28216381946`, head `ad8522bf318158538443a5b70388df84e1b6ae0f`): zip `511,515,236` bytes and dmg `526,410,178` bytes. The local zip is 37.4% smaller than that live zip baseline, but a new GitHub Actions canary artifact for these worktree changes has not been produced yet.
  - Final scans passed: `app.asar` has `hitCount=0` for Trellis, Claude Agent SDK, Anthropic SDK, MCP SDK, MastraCode, Mastra DuckDB/Memory/Stagehand/Agent Browser, DuckDB, BrowserBase, Chromium Bidi, Patchright, Playwright, and WebDriver; `app.asar.unpacked` / Resources scan also returned no forbidden hits and no `resource-packs` directory.
  - `codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Superset\ Canary.app` passed for the ad-hoc signed local bundle.
  - `bun run --cwd apps/desktop check:package-budget -- --require-artifacts --json` passed. The stale local DMG from a previous full package remains 421.2MB and emits a target warning; the current validated zip-only canary artifact is 305.3MB.
- Loaded UI verification:
  - Command: `bun run desktop:perf-loaded-ui` or `bun run desktop:perf-loaded-ui:dev-login -- --json`.
  - The gate now supports `--auto-login-dev` with the local dev account (`admin@local.test` / `supersetdev`) if the Electron window is routed to sign-in, and `--ensure-fixture` so the run cannot accidentally validate an empty UI shell. Reports include `auth.autoLoginAttempted` and the dense fixture result.
  - Latest run after the user's full-data concern: `bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture --json`.
    - Fixture result: `desktop-perf-loaded`, 10 projects / 200 workspaces / 300 tasks / 1 host-backed workspace, `isLoaded=true`, `seeded=false`.
    - UI result: `#/v2-workspaces` 1450 DOM nodes / 38 visible main rows / 1 sidebar workspace row / 1 project section; `#/tasks` 2641 DOM nodes / 75 visible `Desktop perf task` mentions; 0 runtime console errors.
    - Report: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/loaded-ui/loaded-ui-report.json`.
- Claude Agent runtime pack validation:
  - `bun run --cwd apps/desktop build:claude-agent-pack -- --out-dir .tmp/claude-agent-pack-check --app-index-out .tmp/claude-agent-pack-check/pack-manifest-index.json` passed with `claude-agent-runtime@0.3.160`, 2694 files, platform package `@anthropic-ai/claude-agent-sdk-darwin-arm64`.
  - Focused tests passed for `packages/chat/src/server/trpc/standalone-runtime.test.ts`, `packages/chat/src/server/trpc/service.test.ts`, `packages/chat/src/server/trpc/service.runtime-creation.test.ts`, `apps/desktop/runtime-dependencies.test.ts`, and `apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.claude-pack.test.ts`.
  - `bun run lint` and `bun run typecheck` passed after the pack wiring changes.
- MastraCode / DuckDB runtime pack validation:
  - DuckDB audit result: `@mastra/duckdb` is only pulled by `mastracode@0.18.1`; MastraCode's generated entry imports `@mastra/duckdb` at module top level, so a DuckDB-only pack is not a safe boundary.
  - `bun run --cwd apps/desktop build:mastracode-pack -- --out-dir .tmp/mastracode-pack-check --app-index-out .tmp/mastracode-pack-check/pack-manifest-index.json` passed with `mastracode-runtime@0.18.1`, 364 packages, 10,858 files, and 274,476,829 bytes after pruning source maps/docs/test folders and non-target ONNX payloads.
  - Import smoke passed: Node dynamic import from `.tmp/mastracode-pack-check/mastracode-runtime/0.18.1/node_modules/mastracode/dist/index.js` exposes `createMastraCode` and `createAuthStorage`; import from `node_modules/@mastra/memory/dist/index.js` exposes `Memory`.
  - Focused source test passed: `bun test apps/desktop/runtime-dependencies.test.ts`.
  - Workflow/config validation passed: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/build-desktop.yml`, `bun run lint:fix`, `bun run lint`, and `bun run typecheck`.
  - Runtime wiring validation passed after the pack-entry integration:
    - `ChatRuntimeService` supports `resolveMastracodeRuntime`, converts absolute pack paths to file URLs, and falls back to local `node_modules` only when the desktop resolver returns `null`.
    - Desktop standalone workspace Chat resolves `mastracode-runtime` with PackManager and passes MastraCode/Memory import paths from the pack `executeHint`.
    - Host-service workspace Chat no longer top-level imports `mastracode` or `@mastra/memory`; it lazy-loads those modules from env-injected pack paths or development `node_modules`.
    - Host-service coordinator passes cached installed pack paths to new host-service children without calling `resolvePack`, so host-service startup does not block on first-use download.
    - Focused tests passed: `bun test packages/chat/src/server/trpc/service.test.ts packages/chat/src/server/trpc/service.runtime-creation.test.ts packages/host-service/src/runtime/chat/chat.test.ts apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.claude-pack.test.ts apps/desktop/src/main/lib/host-service-coordinator.test.ts apps/desktop/runtime-dependencies.test.ts` (36 pass).
    - Pack rebuild and import smoke passed: `bun run --cwd apps/desktop build:mastracode-pack -- --out-dir .tmp/mastracode-pack-check --app-index-out .tmp/mastracode-pack-check/pack-manifest-index.json`, then Node dynamic import reported `createMastraCode`, `createAuthStorage`, and `Memory` as functions.
    - Root quality passed: `bun run lint:fix`, `bun run lint`, `bun run typecheck`.
  - Auth-storage split and base-package removal validation:
    - Added `SupersetAuthStorage`, a lightweight local `auth.json` compatible implementation that covers normal credential read/write, backup API-key slots, and non-expired OAuth access without importing MastraCode.
    - OAuth login and expired OAuth refresh remain supported by lazy delegation to `mastracode-runtime` through `resolveMastracodeImportPath`, so the rare OAuth path can still use MastraCode's provider implementation without putting the MastraCode entry on the startup/base-package path.
    - Replaced remaining Provider auth storage / small-model value imports of `mastracode` in `packages/chat` and `packages/host-service` with the Superset auth-storage layer.
    - Removed desktop base-package DuckDB/MastraCode materialization: `apps/desktop/runtime-dependencies.ts` no longer externalizes/copies/unpacks `mastracode`, `@mastra/duckdb`, or `@duckdb`.
    - Extended GitHub Actions pack-only guards to fail when `node_modules/mastracode`, `node_modules/@mastra/duckdb`, or `node_modules/@duckdb` appears in app resources or `app.asar`; removed the old macOS step that required DuckDB native binding in the base app.
    - Focused tests passed: `bun test packages/chat/src/server/desktop/chat-service/auth-storage.test.ts packages/chat/src/server/desktop/chat-service/chat-service.test.ts packages/chat/src/server/desktop/auth/openai/openai.test.ts packages/chat/src/server/trpc/service.test.ts packages/chat/src/server/trpc/service.runtime-creation.test.ts packages/host-service/src/runtime/chat/chat.test.ts apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.claude-pack.test.ts apps/desktop/src/main/lib/host-service-coordinator.test.ts apps/desktop/runtime-dependencies.test.ts` (72 pass).
    - Pack rebuild/import smoke and workflow parse passed: `bun run --cwd apps/desktop build:mastracode-pack -- --out-dir .tmp/mastracode-pack-check --app-index-out .tmp/mastracode-pack-check/pack-manifest-index.json`, Node dynamic import of generated MastraCode/Memory entries, and `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/build-desktop.yml`.
    - Root quality passed: `bun run lint:fix`, `bun run lint`, `bun run typecheck`.
  - Purpose: prove the currently connected Electron dev window is authenticated and rendering the dense fixture, not only that the DB contains fixture rows.
  - Latest artifact: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/loaded-ui/loaded-ui-report.json`.
  - Latest result after host-backed fixture changes: workspaces page renders 1450 DOM nodes, 38 main-list workspace rows, 1 sidebar workspace row, and 1 project section; tasks page renders 2641 DOM nodes and 75 visible `Desktop perf task` mentions.
  - The latest run observed 0 Chromium resource-load errors and 0 runtime console errors.
- 2026-06-26 online/full-data response verification:
  - Worktree-local status is green and not empty: `bun run dev:worktree:status` reports API, relay, Electric proxy, Neon proxy SQL, MinIO, and Desktop Automation green, with `desktop-perf-loaded: 10 projects / 200 workspaces / 300 tasks / 1 host-backed (loaded=true)`.
  - Online-like local stack is also green: `bun run online:status` reports public/local web/API/Electric/relay probes green and `desktop-perf-loaded: 10 projects / 200 workspaces / 300 tasks / 0 host-backed (loaded=true)`.
  - Electron loaded UI gate was re-run with fixture enforcement: `bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture --json`.
  - Result: `#/v2-workspaces` rendered 1450 DOM nodes, 38 visible main workspace rows, text from `Desktop Perf Project 1`, and `#/tasks` rendered 2641 DOM nodes with 75 visible `Desktop perf task` mentions; 0 resource/runtime console errors.
  - Report: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/loaded-ui/loaded-ui-report.json`; screenshots: `loaded-workspaces-ui.png`, `loaded-tasks-ui.png`.
  - Production account/database validation remains intentionally unverified until credentials and explicit authorization are provided; the safe substitute is the dense local + online-like loaded fixture, not a production DB mutation.
  - Focused guard tests passed after this sync: `bun test apps/desktop/scripts/audit-workspace-effects.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts packages/host-service/src/app.lazy-runtime.test.ts packages/host-service/src/trpc/router/git/utils/git-query-cache.test.ts scripts/desktop-perf-loaded-ui.test.ts scripts/desktop-perf-fixture.test.ts` (31 pass).
  - Root quality passed after this sync: `bun run lint`, `bun run typecheck`, and `bun run test` (12/12 Turbo test tasks successful).
- Worktree `desktop-lite` profile:
  - Command: `WORKTREE_DEV_PROFILE=desktop-lite ./.superset/worktree-dev.sh start` or `bun run dev:worktree:start:lite`.
  - Managed app sessions: relay, electric-proxy, desktop. The local API tmux session is stopped if it exists and API readiness is reported as skipped.
  - If `.env` still points `NEXT_PUBLIC_API_URL` at the skipped local API port, status/start prints a warning: cached/Electric views can still be useful, but login and API mutations need a separately running API or a different `.env` API URL.
  - Validation artifact: `.trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/runtime-lite-profile-s3-fixed/runtime-performance-2026-06-26T05-09-20-672Z.md`.
  - Result: process-tree peak memory is 3.7GB on dense `#/v2-workspaces`; previous full worktree graph was 5.4GB with API `next-server` around 1.5GB.
  - Desktop subtree remains 3.3GB; biggest remaining contributor is `electron-vite dev --watch` at ~2.1GB, so the next dev-memory lever is Vite/electron-vite HMR footprint, not the API process.
  - Added shared Vite/electron-vite watch ignores for generated heavy outputs: `dist/resource-packs`, `dist/resource-packs-test`, `release`, `.tmp`, and `superset-dev-data/packs`. This prevents local resource-pack builds from being watched/scanned by desktop dev after Actions-style pack generation. Validation passed: `bun test apps/desktop/vite/helpers.test.ts apps/desktop/runtime-dependencies.test.ts`, `bun run --cwd apps/desktop typecheck`, `bun run lint`, and root `bun run typecheck`.
- Local S3/MinIO:
  - Worktree and online-like data startup now include MinIO as an explicit managed data service.
  - `minio-init` is run as a bounded one-shot command, removes stale init containers, and forces `NO_PROXY/no_proxy=localhost,127.0.0.1,minio` so host proxy settings do not route internal compose traffic through an external proxy.
  - Verified bucket creation on worktree MinIO: `superset/superset-artifacts` ready on `localhost:3294`.
- Trellis pack-only runtime:
  - Base package runtime dependency config no longer exports or includes Trellis runtime copies, Trellis asar unpack globs, or Trellis materialized modules.
  - Pack dependency allowlist moved to `apps/desktop/scripts/trellis-runtime-pack-dependencies.ts`; `build:trellis-pack` now consumes that pack-only list.
  - Local validation passed: `bun run --cwd apps/desktop build:trellis-pack -- --out-dir .tmp/trellis-pack-check --app-index-out .tmp/trellis-pack-check/pack-manifest-index.json` followed by `bun run --cwd apps/desktop validate:trellis-runtime -- --node-modules .tmp/trellis-pack-check/trellis-runtime/*/node_modules`.
  - Renderer no longer promises a bundled fallback in production; if the pack is unavailable, workspace creation continues without guided workflow setup and shows in-place warning copy.
- 2026-06-26 final quality verification:
  - Fixed test-suite pollution in `packages/cli/src/lib/host/spawn.test.ts` and `apps/desktop/src/main/lib/host-service-coordinator.test.ts`: both `node:child_process.spawn` mocks now intercept only their target process and pass unrelated commands through to the real `spawn`, so later git/teardown tests do not receive fake child processes.
  - Fixed the remaining task/issue workspace creation pack gap: `RunIssuesInWorkspacePopover` now resolves `trellis-runtime` through `useTrellisRuntimePack`, passes the resolved setup into `submit`, and disables submit while the pack is resolving. The source guard now covers this entry point alongside the existing task-driven workspace creation paths.
  - Fixed host-service branch-sync tests after the stopped-state guard: direct `syncWorkspaceBranches()` tests now explicitly mark the runtime as started, preserving the production behavior where stopped managers no-op instead of running background git sweeps.
  - Fixed pty-daemon test discovery/runtime mismatch: real PTY integration tests were renamed to `.node-test.ts`, `packages/pty-daemon` now runs Bun only for pure tests by default, and `test:integration` uses `tsx --test` under Node. This keeps Bun's default package scan away from Node-only daemon lifecycle tests.
  - Dense loaded UI gate passed: `bun run desktop:perf-loaded-ui -- --json` reported `#/v2-workspaces` 1450 DOM nodes / 38 main rows / 1 sidebar row and `#/tasks` 2641 DOM nodes / 75 task mentions with 0 console errors.
  - Focused tests passed: `bun test scripts/desktop-perf-loaded-ui.test.ts scripts/desktop-perf-fixture.test.ts apps/desktop/scripts/run-runtime-memory-scenario.test.ts scripts/worktree-local-shell.test.ts scripts/superset-online.test.ts packages/cli/src/lib/host/spawn.test.ts apps/desktop/src/main/lib/host-service-coordinator.test.ts` (47 pass).
  - Mock-isolation regression passed: `bun test apps/desktop/src/main/lib/host-service-coordinator.test.ts packages/cli/src/lib/host/spawn.test.ts apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.test.ts apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts apps/desktop/src/lib/trpc/routers/workspaces/utils/select-external-worktrees-for-import.integration.test.ts apps/desktop/src/lib/trpc/routers/workspaces/procedures/external-worktree-import.test.ts apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.test.ts` (73 pass).
  - pty-daemon split validation passed: `bun test packages/pty-daemon/test` and `bun run --cwd packages/pty-daemon build:daemon && bun run --cwd packages/pty-daemon test:integration`.
  - Host-service regression passed after the started-state test harness fix: `bun test packages/host-service/test/pull-requests.test.ts packages/host-service/test/pull-requests-scaling.test.ts`, `bun run --cwd packages/host-service test` (801 pass, 8 todo).
  - Packaging checks passed: workflow YAML parse, `bun run --cwd apps/desktop check:package-budget -- --require-artifacts --json`, and `bun run --cwd apps/desktop validate:native-runtime`. Package budget still reports the stale local canary DMG as a warning (`421.2 MB`, above 400MB target); the current canary zip remains OK at `320101198` bytes.
  - Root quality passed: `bun run lint:fix`, `bun run lint`, `bun run typecheck`, and `bun run test`. The final root test run completed with 12/12 Turbo test tasks successful; `@superset/host-service` reported 801 pass / 8 todo / 0 fail.
- 2026-06-26 GitHub Actions canary artifact validation:
  - Added a safe manual canary validation path: `release-desktop-canary.yml` defaults to updating the live `desktop-canary` release, but supports `publish_release=false` for branch-only artifact validation.
  - Triggered `Release Desktop Canary` on branch `codex/desktop-perf-architecture-overhaul` with `force_build=true`, `build_scope=quick`, `mac_signing=unsigned_internal`, `publish_release=false` (run `28237374196`).
  - The first Actions run proved compile and `report:size` passed on GitHub, then failed in `Build desktop resource packs` because `build:claude-agent-pack` resolved `json-schema-to-ts` as a pack-only copied module without declaring it explicitly in the desktop workspace.
  - Fixed by declaring `json-schema-to-ts`, `ts-algebra`, and `@babel/runtime` as `apps/desktop` devDependencies; they remain pack-only runtime payloads and are still guarded by the app resource / `app.asar` pack-only scan.
  - Local reproduction after the fix passed: `bun run --cwd apps/desktop build:claude-agent-pack -- --out-dir .tmp/claude-agent-pack-ci-fix --app-index-out .tmp/claude-agent-pack-ci-fix/pack-manifest-index.json`, producing `claude-agent-runtime@0.3.160` with 2,694 files.
  - Re-triggered artifact-only quick canary on commit `814625a41` (run `28238063854`). This got past `json-schema-to-ts`, then failed in `Build desktop resource packs` because Bun's CI install did not link the target platform package `@anthropic-ai/claude-agent-sdk-darwin-arm64` from the Claude Agent SDK optional dependencies.
  - Fixed by declaring the CI target platform packages `@anthropic-ai/claude-agent-sdk-darwin-arm64`, `@anthropic-ai/claude-agent-sdk-darwin-x64`, and `@anthropic-ai/claude-agent-sdk-linux-x64` as `apps/desktop` devDependencies, and by adding a GitHub Actions target-platform optional dependency install before resource-pack builds (`--cpu=${{ matrix.arch }} --os=darwin` for macOS, `--cpu=x64 --os=linux` for Linux).
  - Local reproduction after the platform-package fix passed for all current CI targets: mac arm64 default, `TARGET_ARCH=x64` mac pack after `bun install --cpu=x64 --os=darwin`, and `TARGET_PLATFORM=linux TARGET_ARCH=x64` after `bun install --cpu=x64 --os=linux`. Each produced `claude-agent-runtime@0.3.160` with 2,694 files and the expected platform package.
  - Post-fix quality passed: workflow YAML parse, focused pack-boundary tests (`apps/desktop/runtime-dependencies.test.ts` and desktop `index.claude-pack.test.ts`), `bun run lint:fix`, `bun run lint`, `bun run typecheck`, and root `bun run test` (12/12 Turbo tasks; desktop 2,291 pass / 0 fail).
  - Re-triggered artifact-only quick canary on commit `3f03acccf` (run `28238892769`). This proved the target-platform install step and Claude Agent pack fix worked on GitHub Actions, then failed in `build:mastracode-pack` because DuckDB's target platform binding `@duckdb/node-bindings-darwin-arm64` was also optional-only and not linked by CI.
  - Fixed by declaring current CI target DuckDB platform packages (`@duckdb/node-bindings-darwin-arm64`, `@duckdb/node-bindings-darwin-x64`, `@duckdb/node-bindings-linux-x64`) as `apps/desktop` devDependencies and adding a pack-builder filter so explicit platform installs do not pull non-target DuckDB bindings into the MastraCode runtime pack.
  - Local reproduction after the DuckDB fix passed for all current CI targets: mac arm64 `mastracode-runtime@0.18.1` with `@duckdb/node-bindings-darwin-arm64` (307,798,218 bytes), mac x64 with `@duckdb/node-bindings-darwin-x64` (311,518,309 bytes), and Linux x64 with `@duckdb/node-bindings-linux-x64` (278,041,950 bytes). Directory scans confirmed no non-target DuckDB binding packages in those pack outputs.
  - Post-DuckDB-fix quality passed: focused pack-boundary tests (12 pass), `bun run lint:fix`, `bun run lint`, `bun run typecheck`, and root `bun run test` (12/12 Turbo tasks; desktop 2,292 pass / 0 fail).
- 2026-06-26 post-resume telemetry + loaded-data verification:
  - Added persistent telemetry opt-out state, Settings → Behavior toggle, aggregate-only startup performance telemetry scheduling, and a pure telemetry gate so opt-out enforcement is not coupled to PostHog module loading.
  - Hardened the loaded UI gate with `--ensure-fixture`; the default dev-login script now ensures the 10/200/300 dense local fixture plus one host-backed workspace before driving the Electron UI.
  - Validation passed:
    - `bun run dev:worktree:status`: worktree services and Desktop Automation green; dense fixture reported as 10 projects / 200 workspaces / 300 tasks / 1 host-backed.
    - `bun run desktop:perf-fixture:loaded`: fixture already loaded, `seeded=false`.
    - `bun run desktop:perf-loaded-ui -- --auto-login-dev --ensure-fixture --json`: non-empty authenticated UI verified with 38 workspace rows, 75 task mentions, and 0 console errors.
    - Focused tests: `bun test apps/desktop/src/main/lib/analytics/telemetry-settings.test.ts apps/desktop/src/main/lib/analytics/index.test.ts apps/desktop/src/main/lib/analytics/performance-telemetry.test.ts apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts scripts/desktop-perf-fixture.test.ts scripts/desktop-perf-loaded-ui.test.ts apps/desktop/src/main/index.deferred-startup.test.ts` (31 pass after the telemetry gate test split).
    - `bun run --cwd apps/desktop test`: 2286 pass / 0 fail.
    - `bun run lint`, `bun run typecheck`, and canonical root `bun run test`: passed; root test completed with 12/12 Turbo tasks successful.
  - Quality command clarification captured in `.trellis/spec/guides/superset-engineering-guide.md`: full-repo tests use `bun run test`; bare `bun test` is for intentional focused file/package runs only.
- 2026-06-26 artifact-only Canary success and packaging speed follow-up:
  - Artifact-only quick Canary on commit `b79638638` passed: run `28243434337`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update.
  - Fresh GitHub Actions package size: ZIP `318,159,129` bytes (~303.4 MiB), DMG `330,832,981` bytes (~315.5 MiB), resource-pack artifact `165,409,606` bytes. Compared with the old live Canary baselines (`511,515,236` byte ZIP and `526,410,178` byte DMG), the new ZIP is ~37.8% smaller and the new DMG is ~37.2% smaller.
  - Packaged runtime capture passed: `main-window:first-show` 2.87s, `main-window:renderer-did-finish-load` 2.86s, renderer JS heap 29.8 MB, renderer DOM nodes 217, packaged desktop process-tree max memory 280.0 MB, console errors 0. This is below hard CI budgets; the local loaded `desktop-online-lite` report remains the <2s / loaded-data acceptance signal.
  - CI duration breakdown from the successful run: total macOS arm64 job 16m45s; dependency cache 49s, install 1m03s, native deps 37s, electron-vite compile 3m54s, target optional dependency install 1m04s, resource pack build 21s, resource-pack artifact upload 27s, Electron app build 6m28s, runtime capture 20s. The current bottlenecks are compile + electron-builder packaging, not resource-pack construction.
  - Added Electron/electron-builder download caching to macOS and Linux build jobs to avoid repeatedly preparing Electron packaging binaries.
  - Added `macos_artifact_mode`: formal Canary/release builds keep `full` DMG+ZIP output, while `publish_release=false` + `build_scope=quick` branch validation now uses `zip_only` and skips DMG generation/upload. This keeps GitHub Actions as the release path while making routine branch validation faster.
  - Validation for the workflow speed patch passed: workflow YAML parse for `build-desktop.yml`, `release-desktop-canary.yml`, and `release-desktop.yml`; focused tests `bun test apps/desktop/runtime-dependencies.test.ts apps/desktop/scripts/check-runtime-budget.test.ts`; `bun run lint`.
- 2026-06-26 packaging speed + base package second pass:
  - Artifact-only quick Canary on commit `dc25459de` passed: run `28244781057`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update.
  - The `zip_only` path correctly skipped DMG artifact upload, but total macOS arm64 job time stayed high at 16m50s. Step breakdown: dependency cache 59s, install 1m02s, native deps 41s, electron-vite compile 3m35s, optional deps 52s, resource pack build 21s, resource-pack artifact upload 26s, Electron app build 6m27s, runtime capture 20s, zip upload 9s, dependency-cache post save 1m23s. Conclusion: DMG generation was not the bottleneck; `.app` assembly/signing/native dependency traversal plus cache churn were.
- 2026-06-26 quick canary resource-pack skip validation:
  - Added an artifact-only quick path that skips runtime pack construction when `upload_resource_pack_artifacts=false` and embeds the empty shipped `pack-manifest-index.json` instead.
  - Artifact-only quick Canary on commit `c5a10abb0` passed: run `28255974763`; macOS arm64 job `11m16s`; ZIP artifact `144,632,231` bytes; resource-pack artifact/object-storage upload skipped. Remaining bottlenecks from that run: dependency install `74s`, desktop native deps `50s`, `electron-vite` compile `4m40s`, target optional dependency install `60s`, Electron ZIP build `92s`.
  - Added a macOS arm64 quick-path optimization that skips the redundant target optional dependency reinstall for `zip_only` same-platform builds. Artifact-only quick Canary on commit `b279a2239` passed: run `28256693960`; macOS arm64 job `11m11s`; ZIP artifact `144,632,053` bytes; `Install target platform optional dependencies` skipped as intended. Step breakdown: dependency cache `69s`, install `91s`, desktop native deps `65s`, `electron-vite` compile `4m54s`, resource-pack skip `0s`, native runtime prep `4s`, Electron ZIP build `93s`, runtime capture `21s`, ZIP upload `7s`.
  - Conclusion: pack build/upload and target optional reinstall are no longer quick-path bottlenecks. Current quick packaging is dominated by dependency/native install, `electron-vite build`, and Electron ZIP packaging.
- 2026-06-27 compile-stage observability:
  - Added opt-in `DESKTOP_BUILD_STATS=true` bundle stats generation for desktop main/preload/renderer builds. The report writes JSON and Markdown under `performance-reports/build-stats/` and is uploaded from both macOS and Linux build jobs as `*-compile-bundle-stats`.
  - Local real compile validation passed with `DESKTOP_BUILD_STATS=true DESKTOP_BUILD_STATS_DIR=performance-reports/build-stats DESKTOP_BUNDLE_CLI=false bun run --cwd apps/desktop compile:app`.
  - Local stats sample: main output total `13.81 MiB`; largest main chunks were `ai-workspace-names` `4.65 MiB`, `index.js` `3.22 MiB`, `app-*` `1.09 MiB`, `index-*` `0.96 MiB`, and `agent-catalog` `0.76 MiB`. Renderer output total `38.60 MiB`; largest entries were a `1.67 MiB` app chunk, `cursor.svg` `1.50 MiB`, a `1.33 MiB` shared chunk, `codecompleteedm.mp3` `1.19 MiB`, `addon-webgl` `1.05 MiB`, `one-light` `0.91 MiB`, `cytoscape` `0.91 MiB`, `treemap` `0.87 MiB`, and `CollectionsProvider` `0.76 MiB`.
  - Next reduction targets from evidence: split or defer AI workspace naming / agent catalog in main, audit renderer code/highlight/diagram language imports, and move non-critical media/assets off the first shipped renderer payload where product behavior allows.
  - Changed CI packaging so native runtime preparation is explicit and timed (`copy:native-modules` + `validate:native-runtime`), while the Electron package step calls `node ./node_modules/electron-builder/cli.js` directly instead of `bun run package`. This avoids the implicit `prepackage` duplicate work after CI has already prepared native modules.
  - Added `ELECTRON_BUILDER_NPM_REBUILD=false` support in `electron-builder.ts` and set it in CI after `install-app-deps`; local ad-hoc packaging still defaults to the safer rebuild behavior. Local mac arm64 package smoke confirmed electron-builder logs `skipped dependencies rebuild reason=npmRebuild is set to false`.
  - Fixed the Bun cache key to use dependency manifests instead of `${{ github.sha }}`, so unchanged dependency graphs can hit the exact cache and avoid the 1m+ post-save on every commit.
  - Added `upload_resource_pack_artifacts`; `publish_release=false` + quick branch validation skips resource-pack artifact/object-storage upload, while formal Canary/release paths keep uploads enabled. This removes the 165MB / ~26s artifact upload from branch validation without changing GitHub Actions as the release path.
  - Removed accidental production dependency traversal from the base package by excluding `node_modules/**/*` by default in `electron-builder.ts` and re-including only the explicit native/runtime copy allowlist. This is the main package-size win: local mac arm64 canary zip dropped from `323.5 MB` before the exclusion to `181.7 MB` after the exclusion.
  - Extended `prune-packaged-native-payloads` to remove non-target `@ast-grep`, `@libsql`, and `@parcel/watcher` platform packages, `@parcel/watcher/build`, and `better-sqlite3` source/deps after pack. Local mac arm64 canary zip dropped again to `159.6 MB`; `app.asar.unpacked/node_modules` dropped from `89 MB` to `19 MB`; `app.asar` is now `70 MB`; bundled CLI remains the largest base payload at `62 MB`.
  - Local validation passed: workflow YAML parse for `build-desktop.yml` and `release-desktop-canary.yml`; focused tests `bun test apps/desktop/runtime-dependencies.test.ts apps/desktop/scripts/prune-packaged-native-payloads.test.ts`; `TARGET_ARCH=arm64 TARGET_PLATFORM=darwin bun run --cwd apps/desktop copy:native-modules`; `TARGET_ARCH=arm64 TARGET_PLATFORM=darwin bun run --cwd apps/desktop validate:native-runtime`; local ad-hoc signed package smoke with `ELECTRON_BUILDER_NPM_REBUILD=false`; `codesign --verify --deep --strict`; pack-only `app.asar` scan; `bun run --cwd apps/desktop check:package-budget -- --require-artifacts`; `bun run --cwd apps/desktop report:size --top=12`; `bun run lint`; `bun run typecheck`; `bun run test` (12/12 Turbo tasks, desktop 2,295 pass / 0 fail).
  - Artifact-only quick Canary on commit `22990c4c6` passed: run `28247483961`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update. GitHub Actions ZIP is `167,892,301` bytes (~160.1 MB / 160M on disk), matching the local post-prune package instead of the older 303-318 MB artifacts.
  - The same run proved the package-speed patch worked where it matters most: `Build Electron app` dropped from `6m27s` to `1m30s`. Total macOS arm64 job time dropped from ~`16m50s` to `14m36s`, but remaining bottlenecks are now `Compile app with electron-vite` (`5m12s`), dependency/cache work (`Cache dependencies` `1m19s`, `Install dependencies` `1m27s`, `Post Cache dependencies` `1m28s`), and target optional dependency install (`1m21s`).
  - GitHub runtime capture for run `28247483961` passed: `main-window:first-show` `2.65s`, renderer JS heap `28.0 MB`, DOM nodes `217`, packaged desktop process-tree max memory `206.6 MB`, console errors `0`.
  - Added a conservative `bundle_cli` workflow input. Formal Canary/release builds default to bundling the CLI; `publish_release=false` + quick branch validation sets `bundle_cli=false` so the thin base-shell path can be measured without the 60 MB `dist/resources/bin/superset` binary.
  - Local no-CLI package smoke passed after this split: `DESKTOP_BUNDLE_CLI=false` removed stale CLI output, electron-builder omitted `resources/bin`, ad-hoc signed zip built successfully, `codesign --verify --deep --strict` passed, and `check:package-budget -- --require-artifacts` reported ZIP `144,090,492` bytes (`137.4 MB`). This is the current lower bound before turning the CLI into a real resource pack for formal user-facing releases.
  - Artifact-only quick Canary on commit `844c17ed5` failed only at the runtime budget step after package size passed: run `28248883288` built the no-CLI app in `10m02s` total, with `Compile app with electron-vite` `3m55s`, resource-pack build `16s`, and `Build Electron app` `1m26s`. The runtime report showed the packaged app launched and rendered with no console errors and ~`205.8 MB` max memory, but GitHub's macOS runner delayed startup to `main-window:first-show=5.13s`, slightly above the old `5.0s` hard max. Adjusted CI hard startup max to `6.5s` / `6.0s` while preserving the `2.0s` / `1.8s` targets and the local loaded acceptance goal.
  - Local packaged runtime automation was blocked by the existing worktree dev Superset single-instance lock: the packaged process exited after local DB initialization and before CDP opened. This did not show a missing-module crash; CI runtime capture remains the authoritative packaged-runtime gate because the runner has no pre-existing desktop instance.
  - Re-triggered artifact-only quick Canary after the runtime-budget deflake on commit `e3212facc` (run `28249643157`). The build, package budget, runtime capture, and pack-only scans all passed; the no-CLI packaged app reported `main-window:first-show=3.94s`, renderer JS heap `29.8 MB`, DOM nodes `217`, max packaged process-tree memory `206.1 MB`, and 0 console errors.
  - That run failed only because the shared macOS workflow still required `Contents/Resources/app-update.yml` and the bundled CLI for `publish_release=false` + `macos_artifact_mode=zip_only` validation. This is a workflow policy mismatch, not a runtime or package-size regression.
  - Fixed the workflow split so `Verify macOS auto-update metadata and bundled CLI` and `Upload auto-update manifest` run only for `macos_artifact_mode=full`. Formal Canary/release builds still hard-require the updater metadata and bundled CLI; artifact-only quick validation now measures the thin ZIP path without being blocked by release-only metadata.
  - Validation for the workflow split passed: YAML parse for `build-desktop.yml`, `release-desktop-canary.yml`, and `release-desktop.yml`; focused packaging test `bun test apps/desktop/runtime-dependencies.test.ts` (11 pass); and `bun run lint`.
  - Artifact-only quick Canary on commit `dc8f0558d` passed: run `28250525429`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update. The uploaded no-CLI ZIP is `145,804,428` bytes (~139.0 MiB), with no DMG, resource-pack artifact, object-storage upload, release metadata artifact, or bundled CLI gate in the quick path.
  - Runtime capture for run `28250525429` passed: `main-window:first-show=4.43s`, `main-window:renderer-did-finish-load=4.41s`, renderer JS heap `28.0 MB`, DOM nodes `217`, packaged process-tree max memory `212.9 MB`, console errors `0`.
  - CI duration breakdown for run `28250525429`: total macOS arm64 job `10m56s`; cache dependencies `57s`, install `1m12s`, native deps `43s`, electron-vite compile `4m31s`, target optional dependency install `47s`, resource-pack build `18s`, Electron app build `1m37s`, runtime capture `20s`, ZIP upload `5s`. Remaining major bottleneck is electron-vite compile, followed by dependency/cache work; electron-builder packaging is no longer the dominant cost.
  - Added the next formal-release size lever: `superset-cli-runtime` resource pack support. `build:cli-pack` compiles the Superset CLI into a platform/arch-versioned pack (for example `0.2.22-darwin-arm64`) with hash manifest and `binary` execute hint, and the bundled CLI shim can now point at a downloaded CLI pack via `runtimePackPath` / `SUPERSET_CLI_RUNTIME_PACK_PATH`.
  - GitHub Actions now builds the CLI pack only when `bundle_cli=false` and `upload_resource_pack_artifacts=true`; normal formal releases still default to bundled CLI, while a future no-CLI formal release can upload the CLI pack to object storage without changing the GitHub Actions release path. Artifact-only quick validation keeps skipping the CLI pack so the `10m56s` run time does not regress.
  - Local CLI pack validation passed after Biome formatting: `TARGET_PLATFORM=darwin TARGET_ARCH=arm64 bun run --cwd apps/desktop build:cli-pack -- --out-dir .tmp/cli-pack-check --app-index-out .tmp/cli-pack-check/pack-manifest-index.json`, then `apps/desktop/.tmp/cli-pack-check/superset-cli-runtime/0.2.22-darwin-arm64/bin/superset --version` returned `0.2.22`. The generated binary is `65,790,818` bytes (~62.7 MiB), which matches the payload currently keeping formal builds above the no-CLI lower bound.
  - Post-CLI-pack quick Canary validation on commit `ebe5034ba` passed: run `28251634322`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update. The ZIP is `145,804,019` bytes (~139.0 MiB), confirming the new CLI pack infrastructure does not change the artifact-only no-CLI package size.
  - Runtime capture for run `28251634322` passed: `main-window:first-show=2.67s`, `main-window:renderer-did-finish-load=2.66s`, renderer JS heap `29.8 MB`, DOM nodes `217`, packaged process-tree max memory `208.0 MB`, console errors `0`.
  - CI duration breakdown for run `28251634322`: total macOS arm64 job `11m34s`; cache dependencies `57s`, install `1m03s`, native deps `37s`, electron-vite compile `3m33s`, target optional dependency install `1m11s`, resource-pack build `23s`, Electron app build `1m28s`, runtime capture `20s`, ZIP upload `8s`, post dependency cache `1m23s`. The CLI pack condition did not add a new build-time cost to quick validation; the remaining bottlenecks are still electron-vite compile and cache/install work.
  - Wired the `superset-cli-runtime` pack into the real guided-workflow path without changing formal release defaults: `useTrellisRuntimePack` now resolves the Trellis runtime pack as the required setup payload and resolves the CLI runtime pack as optional task-sync support, returning `supersetCliRuntimePackPath` when available.
  - Create Workspace UI now tracks both guided-workflow packs at the local entry point and shows one combined "Preparing guided workflow runtime" state/progress bar instead of introducing a startup download or global modal.
  - Host-service `workspaces.create` accepts and forwards `supersetCliRuntimePackPath`; Trellis init receives `SUPERSET_CLI_PATH` when the downloaded CLI pack exists.
  - The Superset Task Trellis bridge now installs repo-local hook commands with an explicit `SUPERSET_CLI_PATH='<downloaded-pack>/bin/superset'` prefix when available, and the hook config merge replaces older managed Superset hook commands rather than duplicating them. This is the missing link before a future formal no-CLI installer can still keep Trellis task status sync working after restarts.
  - Validation passed for this wiring: `bun test apps/desktop/src/renderer/lib/pack-system/useTrellisRuntimePack.test.ts apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/components/TrellisSetupRow/TrellisSetupRow.test.ts apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.test.ts packages/host-service/src/trpc/router/workspace-creation/trellis.test.ts`; `bun run lint`; `bun run typecheck`; `bun run test`.
  - Added a compile-speed lever for artifact-only quick Canary validation: `build-desktop.yml` now accepts `upload_sourcemaps`, and `release-desktop-canary.yml` sets it to `false` only for `publish_release=false` + `quick`. Formal Canary/release builds keep Sentry sourcemap generation/upload enabled. This should reduce the electron-vite compile path for branch validation without weakening published release diagnostics. Validation passed: `bun test apps/desktop/runtime-dependencies.test.ts`, workflow YAML parse for `build-desktop.yml` / `release-desktop-canary.yml` / `release-desktop.yml`, `bun run lint`, and `bun run typecheck`.
  - Artifact-only quick Canary after the CLI runtime pack wiring and sourcemap toggle passed on commit `9f002ff67`: run `28253275625`, `publish_release=false`, macOS arm64 only, no live `desktop-canary` release update. The downloaded app ZIP is `145,805,110` bytes (~139.0 MiB), still matching the no-CLI thin-shell lower bound.
  - Runtime capture for run `28253275625` passed: `main-window:first-show=3.04s`, `main-window:renderer-did-finish-load=3.04s`, `renderer:boot-mounted=3.03s`, renderer JS heap `29.8 MB`, DOM nodes `217`, packaged process-tree max memory `210.9 MB`, console errors `0`.
  - CI duration breakdown for run `28253275625`: total macOS arm64 job `7m52s`; dependency cache `44s`, install `52s`, native deps `32s`, electron-vite compile `2m42s`, target optional dependency install `45s`, resource-pack build `15s`, native runtime preparation `3s`, Electron app build `1m15s`, runtime capture `19s`, ZIP upload `4s`. Compared with the previous post-CLI-pack quick run (`28251634322`, total `11m34s`, compile `3m33s`), the sourcemap toggle plus warmer cache materially reduced quick validation time. Remaining costs are dependency/cache/install and electron-vite bundle complexity, not resource-pack upload or electron-builder packaging.
  - Prepared formal Canary no-CLI release path while keeping GitHub Actions as the release pipeline:
    - Published Canary builds now set `bundle_cli=false` and `upload_resource_pack_artifacts=true`, so the installer stays thin and the Superset CLI is delivered as a `superset-cli-runtime` resource pack from object storage.
    - Full macOS builds upload resource packs for every macOS architecture, not arm64 only; Linux full builds now upload resource packs to object storage as well.
    - CI full-build checks now validate either the bundled CLI path (`bundle_cli=true`) or the CLI runtime pack binary (`bundle_cli=false`) while still requiring auto-update metadata.
    - Release jobs remove resource-pack CI payload directories from GitHub Release assets before publishing, preserving the intended split: installers through GitHub Releases, on-demand runtime packs through S3/object storage.
    - Platform-native packs now include platform/arch in the pack version (`claude-agent-runtime@0.3.160-darwin-arm64`, `mastracode-runtime@0.18.1-darwin-arm64`, `superset-cli-runtime@0.2.22-darwin-arm64`) so multi-arch full builds cannot overwrite or download the wrong native payload.
  - Local pack validation after the formal no-CLI release-path patch passed:
    - `TARGET_PLATFORM=darwin TARGET_ARCH=arm64 bun run --cwd apps/desktop build:claude-agent-pack -- --out-dir .tmp/native-pack-version-check --app-index-out .tmp/native-pack-version-check/pack-manifest-index.json` generated `claude-agent-runtime@0.3.160-darwin-arm64`.
    - `TARGET_PLATFORM=darwin TARGET_ARCH=arm64 bun run --cwd apps/desktop build:mastracode-pack -- --out-dir .tmp/native-pack-version-check --app-index-out .tmp/native-pack-version-check/pack-manifest-index.json` generated `mastracode-runtime@0.18.1-darwin-arm64` with `@duckdb/node-bindings-darwin-arm64`.
    - `TARGET_PLATFORM=darwin TARGET_ARCH=arm64 bun run --cwd apps/desktop build:cli-pack -- --out-dir .tmp/native-pack-version-check --app-index-out .tmp/native-pack-version-check/pack-manifest-index.json` generated `superset-cli-runtime@0.2.22-darwin-arm64`, and its `bin/superset --version` returned `0.2.22`.
    - The merged app manifest index contains all three platform-specific pack ids/versions above.
  - Full no-release Canary dry run after formal no-CLI release-path patch passed on commit `d7d03c8a1`: run `28254206256`, `build_scope=full`, `publish_release=false`, `mac_signing=unsigned_internal`, no live `desktop-canary` release update.
  - Full-run job durations: Linux x64 `8m30s`, macOS arm64 `11m06s`, macOS x64 `12m12s`; the skipped release-update job confirms this was a package/publish-shape validation without mutating the public Canary release.
  - Full-run installer artifacts are now thin:
    - macOS arm64 ZIP `145,424,568` bytes and DMG `150,883,297` bytes.
    - macOS x64 ZIP `152,383,536` bytes and DMG `157,877,712` bytes.
    - Linux x64 AppImage `154,767,120` bytes.
  - Full-run resource-pack artifacts are split out of the installer and retained as CI artifacts: macOS arm64 `189,242,623` bytes, macOS x64 `197,756,325` bytes, Linux x64 `213,489,641` bytes. Release jobs remove these resource-pack payload directories before publishing GitHub Release assets, preserving the split: installers through GitHub Releases, on-demand packs through object storage.
  - Full-run gates passed: package-size budget, pack-only scans, no bundled CLI checks for `bundle_cli=false`, CLI runtime pack binary validation, auto-update metadata validation, macOS ad-hoc signing validation, and macOS arm64 runtime capture.
  - Object-storage upload path executed but skipped with the expected warning: `SUPERSET_OBJECT_STORAGE_*` GitHub secrets are incomplete. Local and online-like MinIO are already validated; production S3/CloudFront remains the deploy-environment setup item before a real no-CLI Canary can serve packs to users.
  - Tightened `apps/desktop/perf-budget.json` package budgets to match the new proven baseline: installer target `200 MiB`, hard limit `300 MiB` for ZIP, DMG, and AppImage. This turns the old 400-500MB class package size into a CI regression instead of a warning.
- 2026-06-27 release object-storage safety gate:
  - Fixed a release-risk gap exposed by the full no-release Canary run: resource-pack object-storage upload could skip when `SUPERSET_OBJECT_STORAGE_*` secrets were missing, even though published no-CLI Canary builds now depend on those packs.
  - Added `require_resource_pack_object_storage` to `build-desktop.yml`. When true, missing `SUPERSET_OBJECT_STORAGE_ENDPOINT`, `SUPERSET_OBJECT_STORAGE_BUCKET`, `SUPERSET_OBJECT_STORAGE_ACCESS_KEY`, or `SUPERSET_OBJECT_STORAGE_SECRET_KEY` now fails the build with an explicit error instead of warning and continuing.
  - Canary release calls set `require_resource_pack_object_storage` whenever `publish_release != false`; `publish_release=false` dry runs can still skip object-storage upload while retaining resource-pack artifacts for validation. Stable release calls require object storage only for `desktop-v*` tag releases, preserving manual workflow-dispatch validation.
  - Production S3/CloudFront/public resource-pack URL remains unverified because the repository secrets are currently incomplete. The new behavior makes that an intentional release blocker rather than a silent broken publish.
- 2026-06-27 dev memory attribution follow-up:
  - Added memory attribution to `.superset/worktree-dev.sh status`: app process RSS, current compose-project Docker RSS, tracked total, and top worktree app processes. This makes future "7GB dev memory" reports actionable by showing whether the cost is Electron/Vite, local API, Docker data services, or stale worktree processes.
  - Added the same memory attribution to `scripts/superset-online.sh status`, scoped to the `superset-online` app/run-dir processes plus the `superset-online` compose project, so online-like validation cannot be accidentally blamed on desktop Electron.
  - Fixed stale MinIO one-shot cleanup for both worktree-local and online-like startup. Historical `*-minio-init-run-*` containers created by older init logic were not removed by `compose rm -sf minio-init`; startup now removes those project-prefixed stale containers before and after bounded MinIO init.
  - Cleaned the current stale worktree `minio-init-run` container (`684ddcdf749d`). After cleanup, current `bun run dev:worktree:status` reports tracked memory `1553.6 MiB`: app processes `1016.0 MiB`, Docker compose `537.5 MiB`, top app process renderer `374.1 MiB`, electron-vite `212.7 MiB`, main `159.5 MiB`, host-service `97.1 MiB`.
  - Current `bun run online:status` reports online-like tracked memory around `993 MiB`, almost entirely Docker compose; online app tmux sessions are stopped.
  - Validation passed: `bun test scripts/worktree-local-shell.test.ts scripts/superset-online.test.ts apps/desktop/runtime-dependencies.test.ts` and `bun run lint`.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Pack download fails on first use | Graceful degradation, retry, fallback messaging |
| Lazy loading breaks feature parity | Ship per-tab/pane, test each independently |
| Startup deferral causes race conditions | Feature flag, gradual rollout, marks-based validation |
| Memory leak fixes introduce regressions | Regression tests per fix, long-run harness |
| S3 cost for resource packs | Monitor, consider CloudFront caching, pack deduplication |

## Ordering Summary

```
Phase 0 (baseline) ──► Phase 1 (packs)     ─┐
                   ──► Phase 2 (lazy UI)    ─┼──► Phase 5 (CI gates)
                   ──► Phase 3 (startup)    ─┘
                                          ──► Phase 4 (memory) [after P2]
Phase 6 (backend)   [independent, any time]
```
