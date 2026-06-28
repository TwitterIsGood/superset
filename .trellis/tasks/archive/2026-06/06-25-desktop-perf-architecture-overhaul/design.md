# Design: Desktop Performance and Architecture Overhaul

## Architecture Overview

The core shift: from a monolithic Electron app that ships everything, to a **thin shell architecture** with four distinct layers:

```
┌──────────────────────────────────────────────────────┐
│                    Electron Shell                     │
│  (main process, renderer, preload — minimal runtime)  │
├──────────────┬───────────────┬────────────────────────┤
│  Core Layer  │  Active Layer │   On-Demand Layer      │
│  (always on) │  (lazy mount) │   (download + cache)   │
│              │               │                        │
│  auth/route  │  terminal     │  Trellis runtime       │
│  workspace   │  file editor  │  DuckDB (if evaluated) │
│  shell UI    │  chat         │  Claude SDK extras     │
│  pack mgr    │  diff browser │  MCP server extras     │
│  download mgr│  git changes  │  large model assets    │
└──────────────┴───────────────┴────────────────────────┘
         │                              │
         ▼                              ▼
  host-service (per-org)          S3 + CloudFront
  pty-daemon (per-org)            (resource pack CDN)
```

## Layer Definitions

### Core Layer (always on)
Everything needed to boot the app, authenticate, show the dashboard, and list workspaces. This must be fast and small.

Includes: auth token handling, TanStack Router shell, dashboard layout, sidebar shell (headers only, no tab content), CollectionsProvider, pack manifest resolver, download manager, auto-updater, tray, basic notifications.

### Active Layer (lazy mount)
Features that are bundled but only initialized when the user interacts with them. Code is in the bundle but behind dynamic imports and conditional hooks.

Includes: workspace pane content (terminal, file editor, chat, diff, browser), sidebar tab content (Files, Changes, Review, Models), git operations, PR polling, model provider UI.

Activation triggers: user opens a workspace, clicks a sidebar tab, opens a pane type.

### On-Demand Layer (download + cache)
Heavy or infrequently-used modules that are NOT in the installer. Downloaded from S3 on first use, cached locally, verified by hash.

Initial candidates: Trellis runtime (44 npm modules currently whole-copied), potentially DuckDB native bindings, potentially Claude SDK platform-specific binaries for non-default architectures.

## Component Design

### 1. Resource Pack System

```
PackManifest (shipped with app)
  ├── packId: "trellis-runtime"
  ├── version: "1.2.0"
  ├── minAppVersion: "1.13.0"
  ├── files: [{ path, size, sha256 }]
  ├── downloadUrl: "https://cdn.superset.sh/packs/trellis-runtime/1.2.0/"
  └── executeHint: { runtime: "bun", entry: "bin/trellis.js" }

PackManager (main process)
  ├── resolvePack(packId) → cached | downloaded | missing
  ├── downloadPack(packId, onProgress) → Promise<PackPath>
  ├── verifyPack(packId) → boolean (sha256 check)
  └── getPackPath(packId) → string | null

PackState (renderer, via IPC)
  ├── status: "installed" | "downloading" | "missing" | "error"
  ├── progress: number (0-1)
  └── error: string | null
```

Bucket layout (existing `superset-artifacts` bucket, new prefix):
```
superset-artifacts/
  packs/
    trellis-runtime/
      manifest.json          # version index: { versions: ["1.2.0", "1.2.1"], latest: "1.2.1" }
      1.2.0/
        manifest.json        # file list: { files: [{ path, size, sha256 }], entry: "bin/trellis.js" }
        node_modules/@mindfoldhq/trellis/...
        node_modules/@mindfoldhq/trellis-core/...
        ...
```

Infrastructure: reuse existing `SUPERSET_OBJECT_STORAGE_*` env config + AWS SigV4 signing from `packages/trpc/src/router/capability/artifact-storage.ts`. Dev points at MinIO (`docker-compose.yml`, port 9000). Prod points at real S3. No new bucket or CDN needed initially; CloudFront can be layered later if latency warrants.

Pack versioning: independently semver-versioned. App embeds a `pack-compatibility.json` at build time declaring `{ "trellis-runtime": { "minVersion": "1.2.0", "maxVersion": "1.99.x" } }`. On first use, app fetches the pack's version index from S3, picks the highest compatible version, downloads, verifies hash, caches permanently at `${SUPERSET_HOME_DIR}/packs/trellis-runtime/1.2.0/`.

CI integration: GitHub Actions builds and uploads packs to S3 as a post-release step. Pack manifest index is generated at build time and embedded in the app bundle.

Feedback UI: Each feature that needs a pack shows a localized loading state at its entry point. For Trellis, the Create Workspace flow shows "Preparing guided workflow runtime..." with a progress bar in the dialog. For sidebar tabs, the tab content area shows a skeleton while pack-dependent code loads.

### 2. Lazy Pane Registry

Current: `usePaneRegistry` returns a static object with all pane implementations eagerly imported.

Proposed: Registry uses lazy component resolvers:

```typescript
type LazyPaneDefinition = {
  getIcon: (ctx) => ReactNode;        // lightweight, always available
  getTitle: (pane) => string;          // lightweight
  renderPane: (ctx) => ReactNode;      // dynamic import inside
  renderTitle?: (ctx) => ReactNode;    // dynamic import inside
  // ...
};
```

Each pane's heavy implementation (CodeMirror for FilePane, xterm for TerminalPane, monaco-like for DiffPane) is loaded via `React.lazy` + dynamic `import()` only when a pane of that type is actually rendered.

### 3. Lazy Sidebar Tabs

Current: `WorkspaceSidebar` calls all tab hooks unconditionally.

Proposed: Split into:
- **TabHeader** (always mounted): icon, label, badge from lightweight query
- **TabContent** (conditionally mounted): only active tab's full content + hooks

```typescript
// Tab definitions become lightweight metadata + lazy content
const tabs = [
  { id: "files", icon: LuFile, label: "Files", badge: undefined, Content: lazyFilesTab },
  { id: "changes", icon: LuGitCompareArrows, label: "Changes", badge: changesCount, Content: lazyChangesTab },
  { id: "review", icon: LuMessageSquare, label: "Review", badge: reviewCount, Content: lazyReviewTab },
  { id: "models", icon: BotIcon, label: "Models", Content: lazyModelsTab },
];
// Only activeTabDef.Content is rendered
```

Badge counts come from a single lightweight summary query, not per-tab full hooks.

### 4. Deferred Startup Sequence

Current sequence (blocking, before window show):
```
app.whenReady → protocols → app-state → tanstack-persistence →
network-logger → webview-extension → terminal-reconcile →
terminal-prewarm → agent-hooks → CLI-shim → window-setup
```

Proposed sequence:
```
app.whenReady → protocols → app-state → window-setup (show immediately)
  → tanstack-persistence (deferred, non-blocking)
  → terminal-reconcile (deferred)
  → network-logger (deferred)
  → webview-extension (deferred)
  → terminal-prewarm (deferred, only if terminal pane exists)
  → agent-hooks (deferred)
  → CLI-shim (deferred)
```

Window shows as soon as app-state is ready. Everything else runs in the background. Startup marks track each phase.

### 5. Memory Lifecycle Contracts

Every subsystem that holds resources must implement a `dispose()` pattern:

- Query subscriptions: `useEffect` cleanup or `AbortController`
- Polling intervals: cleared on unmount, gated on visibility
- WebSocket connections: closed on workspace switch / app quit
- Child processes: tracked in coordinator, killed on quit, audited for orphans
- Terminal sessions: released on pane close, daemon reconciles on restart
- Webviews: destroyed on browser pane close, not just hidden

Long-run test harness: automated script that opens a workspace, toggles sidebar tabs, opens/closes terminals, switches workspaces, then measures memory delta after 60min idle.

### 6. CI Budget Gates

Added to `build-desktop.yml` after compile step:

```yaml
- name: Enforce package size budget
  working-directory: apps/desktop
  run: |
    bun run scripts/check-package-budget.ts
    # Reads budget from config, compares against actual .app/.AppImage size
    # Fails CI if over budget
```

Startup regression detection: capture startup marks report as artifact, compare against baseline stored in repo.

## Data Flow

### Resource Pack Flow
```
User triggers feature needing pack
  → renderer asks main via IPC: "resolvePack(trellis-runtime)"
  → main checks PackManager: cached?
    → yes: verify hash, return path
    → no: start download, stream progress to renderer
      → S3 GET with range support for resume
      → verify sha256 on completion
      → unpack to packs dir
      → return path
  → renderer receives path, passes to host-service via env
  → host-service executes with resolved runtime
```

### Lazy Tab Data Flow
```
Sidebar mounts → tab headers render → lightweight badge query fires
  → user clicks tab → tab content mounts
    → tab-specific hooks fire (git queries, PR polling, etc.)
    → previous tab's content unmounts → hooks cleanup → intervals cleared
```

## Compatibility and Migration

### Packaging Migration
- Phase 1: Add pack system alongside existing bundled modules (no behavior change)
- Phase 2: Move Trellis runtime to pack-only, remove from `runtime-dependencies.ts`
- Phase 3: Evaluate and move additional modules (DuckDB, etc.) case-by-case

### Dev Experience Migration
- Startup deferral: gated behind a feature flag initially, measured, then made default
- Lazy tabs: can ship per-tab (Files first, then Changes, Review, Models)
- Memory budget: enforce in CI after baseline is established

### Rollback Considerations
- Pack system: if S3 is down, app falls back to showing "feature unavailable, retry" without crashing
- Lazy loading: each tab/pane can be independently reverted to eager if issues found
- Startup deferral: feature flag allows instant revert to blocking sequence

## Trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Resource packs via S3 | Dramatic size reduction, faster downloads | First-use latency, S3 dependency |
| Lazy sidebar tabs | Faster workspace open, lower memory | Slight delay on first tab click |
| Deferred startup | Faster cold start | Some features take a moment post-launch |
| Removing max-old-space-size | Forces real memory hygiene | May surface latent leaks sooner |
| Pack-based Trellis | Users who don't use guided workflows save ~50MB | Trellis users wait for first download |

## Resolved Design Questions

1. **Pack download process**: Main process owns PackManager (Node fs + fetch). Renderer queries status via IPC. No dedicated worker needed; downloads are I/O-bound, not CPU-bound.

2. **Pack preloading**: Not in initial scope. First-use download with progress feedback is sufficient. Preloading can be added later for power users if first-use latency is a complaint.

3. **Badge summary queries**: Lightweight badge counts (change count, open review count) are acceptable for hidden tabs. Full tab hooks (git log, diff, branch listing) are NOT acceptable for hidden tabs. Badge queries should be single-call, not polling, unless the tab was recently active.

4. **Pack versioning**: Independently semver-versioned, app declares compatible range. (Resolved in PRD.)

5. **Offline caching**: Permanently cached after first download, hash-verified on launch. Only re-download on version bump. (Resolved in PRD.)

6. **Canary telemetry**: Aggregate only (startup time, peak memory, idle memory, process count). Opt-out in settings. No per-feature granularity. (Resolved in PRD.)
