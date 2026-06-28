# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after source edits.
- Run `bun run lint` and focused tests before pushing.
- Run `bun run typecheck` for shared type, router, schema, or package export changes.
- Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.
- When backend/main-process changes affect desktop startup, auth persistence, host-service coordination, terminal/runtime processes, or route availability, include the relevant Desktop Automation CLI acceptance path from `.trellis/spec/guides/desktop-acceptance-tdd.md` or document why it is not required.

## Review Checklist

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.
- Desktop Automation CLI acceptance assertions should be deterministic first and visual second: logs, route state, IPC/service readiness, files, visible roles/labels, and `wait-for` checks are gates; screenshots/reports are evidence for human or model visual inspection.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`

## Desktop Packaging And Canary Signing

### 1. Scope / Trigger

- Trigger: changes to Electron packaging, Desktop Canary GitHub Actions,
  macOS signing/notarization, package-size optimization, bundled CLI packaging,
  or native runtime validation.
- Goal: avoid producing a macOS artifact that builds successfully but fails for
  downloaded Apple Silicon users with a Gatekeeper "damaged app/package" style
  error.

### 2. Signatures

- Reusable workflow:
  `.github/workflows/build-desktop.yml`
  - `build_macos: boolean`
  - `macos_arches_json: string` JSON array, for example `["arm64"]`
  - `build_linux: boolean`
  - `mac_signing: "auto" | "required" | "unsigned_internal"`
- Canary workflow:
  `.github/workflows/release-desktop-canary.yml`
  - `build_scope: "quick" | "full"`
  - `mac_signing: "auto" | "required" | "unsigned_internal"`
- Desktop package scripts:
  - `bun run --cwd apps/desktop report:size --top=<n>`
  - `bun run --cwd apps/desktop report:runtime -- --duration=<ms> --interval=<ms> --top=<n>`
  - `bun run --cwd apps/desktop ensure:cli`
  - `bun run --cwd apps/desktop validate:native-runtime`

### 3. Contracts

- `mac_signing=auto`: sign and notarize when all macOS signing secrets are
  present; otherwise build an ad-hoc signed internal artifact without
  notarization.
- `mac_signing=required`: fail the macOS build if any signing/notarization
  secret is missing.
- `mac_signing=unsigned_internal`: always skip Developer ID
  signing/notarization, even if secrets are configured, but still ad-hoc sign
  the `.app` bundle with `identity: "-"` so Apple Silicon can launch it after
  quarantine removal.
- Required signing secrets for normal tester-ready macOS downloads:
  `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`,
  `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID`.
- Non-notarized macOS artifacts are internal-only. Release notes must say they
  are ad-hoc signed, not Developer ID notarized, and include the
  quarantine-removal workaround:
  `xattr -dr com.apple.quarantine /Applications/Superset\ Canary.app`.
- Native runtime validation must not require production sourcemaps. Sourcemap
  scans are extra evidence; JS output scans and native package presence checks
  remain mandatory when sourcemaps are disabled for package-size reasons.

### 4. Validation & Error Matrix

- `mac_signing=required` + missing secret -> fail before packaging upload with
  a clear GitHub Actions error listing required secrets.
- `mac_signing=auto` + missing secrets -> warning plus ad-hoc signed internal
  release notes; do not describe the artifact as normal tester-installable.
- `mac_signing=unsigned_internal` + secrets present -> warning plus ad-hoc
  signed package without notarization; this mode must not accidentally use
  Developer ID credentials.
- `mac_signing=unsigned_internal` + `codesign --verify --deep --strict` fails
  with `code has no resources but signature indicates they must be present` ->
  build is invalid; ensure the workflow exports `AD_HOC_MAC_CODE_SIGNING=true`,
  not `SKIP_MAC_CODE_SIGNING=true`.
- No `dist/main/index.js.map` -> native validation warns and skips sourcemap
  origin checks, then still scans `dist/main/**/*.js`.
- Missing native binding in packaged app -> fail the packaging workflow before
  artifact upload.

### 5. Good/Base/Bad Cases

- Good: quick canary builds macOS arm64 only, reports package size, verifies
  native bindings, and either Developer ID signs/notarizes or ad-hoc signs the
  internal bundle and labels it as non-notarized.
- Base: no signing secrets exist, but the app bundle passes
  `codesign --verify --deep --strict`, and the release body clearly states
  ad-hoc/internal status with quarantine instructions.
- Bad: CI uploads a macOS artifact whose `.app` fails
  `codesign --verify --deep --strict`, even if the release notes say it is for
  internal testing.
- Bad: package-size optimization disables sourcemaps and breaks
  `validate:native-runtime` even though JS output checks could still run.

### 6. Tests Required

- Parse changed workflow YAML:
  `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "ok #{f}" }' .github/workflows/build-desktop.yml .github/workflows/release-desktop-canary.yml .github/actions/merge-mac-manifests/action.yml`
- Run desktop package validation:
  `bun run --cwd apps/desktop validate:native-runtime`.
- For macOS packaging changes, run at least one local ad-hoc signed arm64
  package build:
  `AD_HOC_MAC_CODE_SIGNING=true CSC_IDENTITY_AUTO_DISCOVERY=false TARGET_ARCH=arm64 bun run --cwd apps/desktop package -- --publish never --config electron-builder.canary.ts --arm64`.
- Verify the packaged app signature:
  `codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Superset\ Canary.app`.
- Run size reporting after compile/package:
  `bun run --cwd apps/desktop report:size --top=12`.
- For desktop runtime performance work, run the runtime baseline reporter
  against the real running app and save the markdown/json artifacts:
  `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12`.
  Use `--route=<hash-route>` to measure SPA route transitions through the
  in-app TanStack Router; do not use reload-based navigation as a route-open
  performance proxy unless the task explicitly measures cold route loads.
- Runtime budget gates must declare required route coverage in
  `apps/desktop/perf-budget.json` and the reporter invocation must pass the
  matching `--route=<hash-route>` values. A runtime report with no route
  measurements is not enough evidence for Canary performance, even when startup
  and process memory are under budget.
- Runtime memory hard limits must reject the development regressions this task
  was created to prevent: desktop process-tree memory above 4 GiB or all tracked
  process memory above 6 GiB is a failure, not a warning. Targets should stay
  lower and track the desired VSCode-class steady state.
- Run repo quality gates before commit:
  `bun run lint`, `bun run --cwd apps/desktop typecheck`, and
  `bun run typecheck` when package/workflow scripts or shared types changed.

### 7. Wrong vs Correct

#### Wrong

```yaml
run: |
  if [[ -n "${MAC_CERTIFICATE:-}" ]]; then
    echo "signed"
  else
    echo "building unsigned"
  fi
```

#### Correct

```yaml
run: |
  if [[ "$MAC_SIGNING_MODE" == "unsigned_internal" ]]; then
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    export AD_HOC_MAC_CODE_SIGNING=true
  elif [[ -n "${MAC_CERTIFICATE:-}" && -n "${MAC_CERTIFICATE_PASSWORD:-}" && -n "${MAC_APPLE_ID:-}" && -n "${MAC_APPLE_ID_PASSWORD:-}" && -n "${MAC_APPLE_TEAM_ID:-}" ]]; then
    export CSC_LINK="$MAC_CERTIFICATE"
    export CSC_KEY_PASSWORD="$MAC_CERTIFICATE_PASSWORD"
  elif [[ "$MAC_SIGNING_MODE" == "required" ]]; then
    exit 1
  else
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    export AD_HOC_MAC_CODE_SIGNING=true
  fi
```

## Desktop Runtime Startup Performance

### 1. Scope / Trigger

- Trigger: changes to Electron main startup, workspace runtime registry,
  terminal runtime setup, host-service coordination, or authenticated desktop
  providers that start local child processes.
- Goal: keep desktop startup and idle state from paying for services the user
  has not opened yet.

### 2. Contracts

- Startup warmups may precompute cheap in-process data, but must not spawn or
  connect long-lived terminal daemons unless explicitly requested.
- Workspace runtime construction and capability reads must remain lightweight.
  Registering terminal lifecycle listeners such as `terminalExit` must not
  instantiate daemon backends by itself.
- Host-service should start for the active organization on demand. Do not
  prestart one host-service process for every synced organization unless a task
  explicitly adds a measured background-sync requirement and budget.
- Desktop host-service entrypoints should import host-service runtime modules
  through narrow package subpaths, not the root `@superset/host-service`
  barrel. Use subpaths such as `@superset/host-service/app`,
  `@superset/host-service/providers/auth`, and
  `@superset/host-service/safety` so unrelated exports do not become part of
  process startup.
- Keep Chat/Mastra/model-gateway/AI helper paths out of idle host-service
  startup. Use lazy accessors or dynamic imports for:
  `ChatRuntimeManager`, `ChatService`, model gateway handlers, AI task draft
  gateway calls, AI branch naming, and AI workspace naming/rename.
- Preserve existing terminal event behavior when making runtime backends lazy:
  listeners registered before backend initialization must receive forwarded
  backend events after the first real terminal operation.

### 3. Tests Required

- Unit regression for terminal prewarm default behavior: no daemon connection by
  default, explicit daemon prewarm still connects.
- Unit regression for workspace runtime laziness: construction, capability
  reads, and listener registration do not create the daemon backend; first real
  terminal operation does.
- Unit regression for host-service startup selection: only the active
  organization is selected, including before organization collection data is
  ready.
- Runtime report after meaningful startup/runtime optimization:
  `bun run --cwd apps/desktop report:runtime -- --duration=10000 --interval=1000 --top=12`.
- Source-level regression when changing desktop host-service startup imports:
  assert `apps/desktop/src/main/host-service/index.ts` does not import the root
  `@superset/host-service` barrel for runtime startup.
- Source-level regression when changing host-service composition: assert
  `packages/host-service/src/app.ts` has no static value imports for
  `ChatService`, `ChatRuntimeManager`, or model gateway handlers.

## Desktop Worktree Dev Memory

### 1. Scope / Trigger

- Trigger: changing `.superset/worktree-dev.sh`, `dev:worktree:*` scripts, or
  desktop dev server flags.
- Goal: keep normal Desktop development close to the packaged runtime shape
  instead of paying for every local backend and Docker data service.

### 2. Signatures

- Default profile: `WORKTREE_DEV_PROFILE=desktop-online-lite`.
- Full local profile: `WORKTREE_DEV_PROFILE=full`.
- Desktop main/preload watch escape hatch:
  `SUPERSET_DESKTOP_DEV_MAIN_WATCH=1`.
- Desktop dev runner heap escape hatch:
  `SUPERSET_DESKTOP_DEV_NODE_OPTIONS=<node options>`.

### 3. Contracts

- `bun run dev:worktree:start` must start the low-memory Desktop-only profile
  by default, connect to the online-like API/Electric/Relay services, and stop
  any stale worktree-local Docker data services from a previous full run.
- Full local API/Electric/Docker startup must be explicit through
  `bun run dev:worktree:start:full` or `WORKTREE_DEV_PROFILE=full`.
- The default Desktop dev command should not use `electron-vite dev --watch`.
  Renderer HMR remains available; main/preload watch is opt-in because it keeps
  the Vite/Rollup dev graph resident and can push the app into multi-GB memory.
- Runtime reports must write local artifacts under `.tmp/` by default, not
  `apps/desktop/performance-reports/`, so lint does not scan transient JSON.

### 4. Validation & Error Matrix

- Default profile starts local Docker -> fail; this regresses the low-memory
  development path.
- `SUPERSET_DESKTOP_DEV_MAIN_WATCH=1` missing for main/preload hot-reload work
  -> developer must restart Desktop after main/preload edits.
- `--max-old-space-size=1024` for electron-vite cold start -> expected OOM in
  the current app; keep the default at `1536` unless the renderer graph is
  reduced enough to prove a lower cap.

### 5. Good/Base/Bad Cases

- Good: `dev:worktree:start` reports `profile: desktop-online-lite`, no local
  compose project, Desktop app processes around 1GB, and external online-like
  probes pass.
- Base: `dev:worktree:start:full` intentionally starts local API, relay,
  Electric proxy, and Docker services for backend integration work.
- Bad: a normal Desktop UI task starts API Next dev, Wrangler/workerd, local
  Postgres/Electric/MinIO, and `electron-vite --watch`, causing macOS Force
  Quit to attribute roughly 10GB to the app.

### 6. Tests Required

- `scripts/worktree-local-shell.test.ts` must assert the default profile,
  explicit full scripts, Docker cleanup when local data is skipped, heap cap,
  and main/preload watch escape hatch.
- Run `bun run dev:worktree:start` and confirm status shows
  `profile: desktop-online-lite`.
- Run `bun run --cwd apps/desktop report:runtime -- --duration=10000
  --interval=1000 --top=12` and confirm process totals are under the current
  Desktop dev budget.

### 7. Wrong vs Correct

#### Wrong

```bash
bun run dev:worktree:start
# Starts full local API/Electric/Docker and electron-vite --watch by default.
```

#### Correct

```bash
bun run dev:worktree:start
# Starts Desktop-only online-lite by default.

bun run dev:worktree:start:full
# Explicitly starts the full local backend stack.
```

## Desktop Resource Pack Public MinIO Smoke

### 1. Scope / Trigger

- Trigger: validating Desktop resource-pack upload/download behavior before a
  durable production S3/CDN endpoint is available.
- Goal: allow a short online-like smoke using local Docker MinIO through a
  public router mapping without changing GitHub Release installer delivery.

### 2. Signatures

- Docker compose env:
  - `LOCAL_S3_BIND_HOST`: host bind address for MinIO API, default
    `127.0.0.1`.
  - `LOCAL_S3_CONSOLE_BIND_HOST`: host bind address for MinIO console, default
    `127.0.0.1`.
- Online stack env:
  - `SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC=1`: sets
    `LOCAL_S3_BIND_HOST=0.0.0.0` unless explicitly overridden.
- Resource-pack release env:
  - `SUPERSET_OBJECT_STORAGE_ENDPOINT=http://localhost:43018`
  - `SUPERSET_RESOURCE_PACK_BASE_URL=http://<public-domain>:<public-port>/superset-artifacts/packs`

### 3. Contracts

- GitHub Releases remain the installer distribution channel. S3-compatible
  object storage is only for hidden/on-demand runtime packs.
- Local MinIO validates S3-compatible uploads with signed credentials and
  unsigned public downloads from the `packs/` prefix.
- Direct MinIO public URLs must include bucket plus prefix:
  `/superset-artifacts/packs`.
- Multiple runtime-pack build scripts may run sequentially in one release job.
  Each script must merge its pack into the existing `pack-manifest-index.json`
  instead of overwriting the app index; otherwise the packaged app can only
  discover the last built pack.
- The MinIO console port must remain bound to localhost unless a task
  explicitly changes admin access policy.

### 4. Validation & Error Matrix

- `SUPERSET_RESOURCE_PACK_BASE_URL` host is `localhost`, `127.0.0.1`, or `::1`
  without `--allow-local-base-url` -> release readiness fails.
- Router maps to a port that is still bound to `127.0.0.1` -> public download
  verification fails before release.
- Public URL omits `/superset-artifacts/packs` when exposing MinIO directly ->
  remote manifest fetch returns `404`.
- Console port is public -> reject the setup; only the API/download port should
  be exposed for this smoke.

### 5. Good/Base/Bad Cases

- Good: `SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC=1` makes MinIO API listen
  on `0.0.0.0:43018`, router maps a public 6XXXX port to `43018`, and
  `verify:resource-pack-downloads` succeeds against the public base URL.
- Base: default online stack keeps MinIO on `127.0.0.1:43018`, suitable for
  local upload/download tests only.
- Bad: treating local MinIO as production storage without a durable public URL,
  repository secrets, and release workflow verification.

### 6. Tests Required

- Source regression: `scripts/superset-online.test.ts` must assert MinIO stays
  local by default and only the API port is public with the explicit online
  flag.
- Source regression: `apps/desktop/scripts/resource-pack-index.test.ts` must
  prove new pack manifests are merged into the default and embedded app indexes
  without dropping existing packs.
- Compose regression: `docker compose config` should show `host_ip:
  127.0.0.1` by default and `host_ip: 0.0.0.0` for the MinIO API when
  `LOCAL_S3_BIND_HOST=0.0.0.0`.
- Release smoke: run `check:resource-pack-release-readiness`,
  `upload:resource-packs`, and `verify:resource-pack-downloads` with the public
  base URL.

### 7. Wrong vs Correct

#### Wrong

```bash
export SUPERSET_RESOURCE_PACK_BASE_URL=http://bj1.v.lhb.ink:6XXXX/packs
```

#### Correct

```bash
export SUPERSET_RESOURCE_PACK_BASE_URL=http://bj1.v.lhb.ink:6XXXX/superset-artifacts/packs
```
