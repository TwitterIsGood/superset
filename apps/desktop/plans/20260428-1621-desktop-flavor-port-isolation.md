# Isolate desktop local service ports by build flavor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, Bun is the package manager, Electron desktop work lives under `apps/desktop`, renderer-to-main communication must use tRPC from `apps/desktop/src/lib/trpc`, and implementation plans for desktop work belong in `apps/desktop/plans/`.

## Purpose / Big Picture

After this change, a developer can run a local desktop dev build and an installed Canary desktop build at the same time, open Settings Sidebar > Devices in both, and use iOS simulator preview without the later-opened app failing because a local port is already occupied. The fix is to make each desktop build flavor receive its own local service ports at build or launch time, rather than asking the runtime code to infer whether the current process is dev, Canary, or stable by inspecting app names and paths.

The observable user behavior is that the first app to open no longer monopolizes the local ports needed by the notification server, the local model proxy daemon, and the iOS `idb_companion` bridge. A human can see this working by opening the packaged Canary app, starting the local desktop dev app, opening a workspace in each, selecting the Devices tab in the right sidebar, and starting an iOS simulator preview in both without seeing `EADDRINUSE`, `Port 10882 is already in use`, or a dead Devices panel in the second app.

## Assumptions

This work is scoped to `apps/desktop` and `packages/device-bridge`. It does not change the mobile app, web app, backend API, database schema, or renderer UI design. The affected desktop surfaces are local service configuration, Electron Vite build-time environment injection, the main process notification server, the model proxy daemon, and the iOS device bridge configuration.

The desired design is build-time or launch-time configuration injection. Runtime code should read explicit configuration such as `DESKTOP_MODEL_PROXY_PORT` and `DESKTOP_DEVICE_BRIDGE_GRPC_PORT`; it should not decide ports by checking `app.getName()`, `process.execPath`, `process.resourcesPath`, or whether a string contains `Canary`.

Stable and default dev builds should keep the existing ports unless explicitly overridden, so existing local settings continue to work. Canary should use fixed alternate ports. The initial port map is: stable/default dev notification server `51741`, model proxy `39127`, and device bridge gRPC `10882`; Canary notification server `51742`, model proxy `39128`, and device bridge gRPC `10883`.

If a configured port is occupied by an unrelated process, Superset should report the configured-port conflict rather than silently selecting a random free port. Fixed, injected ports make workspace settings, OAuth callback URLs, and local debugging deterministic.

## Open Questions

There are no product questions blocking this plan. The user has already chosen configuration injection at packaging or launch time instead of runtime flavor detection. If implementation discovers that electron-builder cannot provide environment variables to the compiled app by itself, the implementation should inject the same values during the Electron Vite compile step or via package scripts and record the exact mechanism in the Decision Log.

## Progress

- [x] (2026-04-28 16:21 local) Confirmed the user wants build or launch configuration injection, not runtime instance detection.
- [x] (2026-04-28 16:21 local) Inspected `apps/desktop/src/shared/env.shared.ts` and confirmed only `DESKTOP_VITE_PORT`, `DESKTOP_NOTIFICATIONS_PORT`, `ELECTRIC_PORT`, and `SUPERSET_WORKSPACE_NAME` are currently parsed in shared env.
- [x] (2026-04-28 16:21 local) Inspected `apps/desktop/src/main/windows/main.ts` and confirmed the notification server listens on `env.DESKTOP_NOTIFICATIONS_PORT` and the device bridge registration currently passes no custom gRPC port.
- [x] (2026-04-28 16:21 local) Inspected `packages/device-bridge/src/register.ts` and confirmed `DeviceBridgeOptions.grpcPort` exists but defaults to hardcoded `10882` when not supplied.
- [x] (2026-04-28 16:21 local) Inspected `apps/desktop/src/main/lib/model-proxy-daemon/types.ts` and `manager.ts` and confirmed the model proxy daemon currently uses hardcoded `MODEL_PROXY_PORT = 39127`.
- [x] (2026-04-28 16:21 local) Inspected `apps/desktop/electron.vite.config.ts`, `apps/desktop/package.json`, `apps/desktop/electron-builder.ts`, `apps/desktop/electron-builder.canary.ts`, and `.github/workflows/build-desktop.yml` to locate build and packaging injection points.
- [x] (2026-04-28 16:21 local) Created this ExecPlan under `apps/desktop/plans/`.
- [x] (2026-04-28 16:40 local) Implemented shared env support for `DESKTOP_MODEL_PROXY_PORT` and `DESKTOP_DEVICE_BRIDGE_GRPC_PORT` with stable/default dev defaults.
- [x] (2026-04-28 16:45 local) Wired the device bridge and model proxy manager/daemon/server to consume the injected ports; notification server already used `DESKTOP_NOTIFICATIONS_PORT`.
- [x] (2026-04-28 16:50 local) Added GitHub Actions build injection so Canary compiles with notification `51742`, model proxy `39128`, and device bridge gRPC `10883`, while stable compiles with current defaults.
- [x] (2026-04-28 17:05 local) Validated TypeScript and targeted model proxy tests. Full `bun test` was attempted but failed in existing `workspace-settings.test.ts` SQLite syntax failures unrelated to this port change; `lint:check-node-imports` is unavailable; manual dual-instance Devices validation was not performed in this non-interactive pass.
- [x] (2026-04-28 18:10 local) Addressed two blocking audit findings: removed compile-step `DESKTOP_*: ${{ env.DESKTOP_* }}` overrides from CI so `$GITHUB_ENV` values are inherited directly, and port-scoped model proxy daemon state plus adoption checks to the configured `DESKTOP_MODEL_PROXY_PORT`.
- [x] (2026-04-28 18:15 local) Re-ran `bun run typecheck` and targeted model proxy tests after audit fixes; both passed.

## Surprises & Discoveries

- Observation: The Devices panel itself does not start an HTTP or WebSocket server. Renderer code talks to main through Electron IPC, and main talks to device tools through subprocesses.
  Evidence: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/DevicesPanel.tsx` uses the device stream hook, while `packages/device-bridge/src/register.ts` registers Electron `ipcMain.handle` handlers and shells out to Android and iOS tooling.

- Observation: The iOS bridge already has the type surface needed for port injection.
  Evidence: `packages/device-bridge/src/register.ts` computes `const grpcPort = options.grpcPort ?? 10_882`, and `apps/desktop/src/main/windows/main.ts` currently calls `registerDeviceBridge(window.webContents, getIdbArtifacts())` without setting `grpcPort`.

- Observation: The notification server already reads an environment-controlled port, but only one default exists today.
  Evidence: `apps/desktop/src/shared/env.shared.ts` defines `DESKTOP_NOTIFICATIONS_PORT` with default `51741`, and `apps/desktop/src/main/windows/main.ts` calls `notificationsApp.listen(env.DESKTOP_NOTIFICATIONS_PORT, "127.0.0.1", ...)`.

- Observation: The local model proxy daemon still uses a hardcoded port constant.
  Evidence: `apps/desktop/src/main/lib/model-proxy-daemon/types.ts` exports `MODEL_PROXY_PORT = 39127`, and `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` builds the endpoint from `MODEL_PROXY_HOST` and `MODEL_PROXY_PORT`.

- Observation: Electron Vite already injects selected `process.env` values into the main and renderer bundles at compile time.
  Evidence: `apps/desktop/electron.vite.config.ts` has `define` entries for `process.env.DESKTOP_NOTIFICATIONS_PORT`, `process.env.DESKTOP_VITE_PORT`, `process.env.ELECTRIC_PORT`, and `process.env.SUPERSET_WORKSPACE_NAME` in both the main and renderer configs.

- Observation: The root `.env` load in `apps/desktop/electron.vite.config.ts` uses `override: true`, so CI-provided flavor port values must be restored after dotenv loads to guarantee build-time injection wins over repository-local defaults.
  Evidence: `electron.vite.config.ts` now snapshots the three desktop local service port env vars before `config(...)`, restores defined values after dotenv, then validates env and feeds Vite `define` from the restored values.

- Observation: `apps/desktop/package.json` in this checkout still has no `lint:check-node-imports` script.
  Evidence: the package scripts include `typecheck` and `test`, but no `lint:check-node-imports`; prior plans in this repo recorded the same script absence.

- Observation: Full desktop test suite currently fails in `src/lib/trpc/routers/model-proxy/workspace-settings.test.ts` with SQLite syntax errors around a generated `from` query, while the targeted model proxy daemon token/service tests pass.
  Evidence: `cd apps/desktop && bun test` reports 8 failures in `getProjectWorkspaceRoots`/`saveProjectModelSettings`; `cd apps/desktop && bun test src/lib/trpc/routers/model-proxy/service.test.ts` passes 4 tests.

- Observation: Writing flavor ports to `$GITHUB_ENV` and then setting `DESKTOP_*: ${{ env.DESKTOP_* }}` inside the compile step can erase those values because expression-time `env` may not include prior `$GITHUB_ENV` writes.
  Evidence: `.github/workflows/build-desktop.yml` had separate `Configure desktop local service ports` steps followed by compile-step `env` entries for `DESKTOP_NOTIFICATIONS_PORT`, `DESKTOP_MODEL_PROXY_PORT`, and `DESKTOP_DEVICE_BRIDGE_GRPC_PORT`; those compile-step entries have now been removed so the runner process inherits `$GITHUB_ENV` directly.

- Observation: Even after env-backed model proxy ports, stable/default dev and Canary could share daemon manifest, token, lock, and log files under one `SUPERSET_HOME_DIR/model-proxy` directory.
  Evidence: `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts` previously used `join(SUPERSET_HOME_DIR, "model-proxy")` for all daemon state. It now adds a `port-<DESKTOP_MODEL_PROXY_PORT>` child directory under `model-proxy`.

- Observation: Daemon adoption must reject stale manifests from another flavor even if a process is alive and reachable.
  Evidence: `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` now requires the manifest endpoint to equal `http://127.0.0.1:${env.DESKTOP_MODEL_PROXY_PORT}` and requires `/health` to report `port === env.DESKTOP_MODEL_PROXY_PORT` before returning a running status.

## Decision Log

- Decision: Use explicit build or launch configuration for build-flavor ports instead of runtime flavor detection.
  Rationale: The user pointed out that the desktop app already has multiple build shapes, and packaging or launch scripts can inject the right values directly. This is less brittle than checking app names, executable paths, or resource paths at runtime.
  Date/Author: 2026-04-28 / user and planning agent.

- Decision: Keep stable/default dev ports unchanged and assign Canary fixed alternate ports.
  Rationale: Stable/default dev compatibility matters because local workspace files and existing tooling may already reference `127.0.0.1:39127` for the model proxy. Canary needs side-by-side behavior, so it receives the next fixed ports: notification `51742`, model proxy `39128`, and iOS gRPC `10883`.
  Date/Author: 2026-04-28 / planning agent.

- Decision: Do not use dynamic `findFreePort()` for these three services in this fix.
  Rationale: Dynamic ports avoid bind conflicts but make model proxy endpoints, OAuth callbacks, logs, and reproduction harder to reason about. The problem is not that ports are fixed; the problem is that every build flavor currently receives the same fixed ports.
  Date/Author: 2026-04-28 / planning agent.

- Decision: Treat `packages/device-bridge` as a reusable package and keep its default gRPC port unchanged.
  Rationale: The package already supports `DeviceBridgeOptions.grpcPort`, so desktop can pass a configured value without changing the package default or affecting other consumers.
  Date/Author: 2026-04-28 / planning agent.

- Decision: Inject flavor-specific ports in `.github/workflows/build-desktop.yml` immediately before `bun run compile:app`, and preserve those values across the desktop Vite config's dotenv load.
  Rationale: Vite replaces `process.env.*` during compile, so setting explicit env values at the compile step is the narrowest build-time mechanism. Preserving the pre-dotenv values keeps CI/channel injection authoritative without runtime flavor detection.
  Date/Author: 2026-04-28 / implementation agent.

- Decision: Let compile steps inherit flavor ports through `$GITHUB_ENV` instead of re-declaring `DESKTOP_*` through GitHub expression `env` context.
  Rationale: `$GITHUB_ENV` reliably affects later runner processes, while `${{ env.DESKTOP_* }}` in a later step can evaluate before those file writes are reflected and can override the inherited process environment with empty strings.
  Date/Author: 2026-04-28 / audit-fix agent.

- Decision: Scope model proxy daemon runtime files by configured model proxy port and require both manifest endpoint and health port to match before adoption.
  Rationale: Stable/default dev and Canary may share `SUPERSET_HOME_DIR`; using a per-port daemon state directory and strict adoption checks prevents one flavor from reusing the other's manifest, token, lock, log, or live daemon.
  Date/Author: 2026-04-28 / audit-fix agent.

## Outcomes & Retrospective

Implemented the configuration plumbing for build-flavor port isolation. Stable/default dev defaults remain notification `51741`, model proxy `39127`, and device bridge gRPC `10882`; the shared Canary build workflow now compiles with notification `51742`, model proxy `39128`, and device bridge gRPC `10883`. The model proxy manager and daemon now derive endpoints and health/status ports from `env.DESKTOP_MODEL_PROXY_PORT`, and the desktop main window passes `env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT` into the existing device bridge option surface.

Audit follow-up fixed two blocking issues. The desktop CI compile steps no longer re-declare the three desktop port env vars through `${{ env.DESKTOP_* }}`, so the values written to `$GITHUB_ENV` are inherited directly by `bun run compile:app`. Model proxy daemon state is now port-scoped under `SUPERSET_HOME_DIR/model-proxy/port-<DESKTOP_MODEL_PROXY_PORT>`, and adoption now rejects manifests whose endpoint does not match the configured endpoint or whose health response reports a different port.

Validation after the audit follow-up: `cd apps/desktop && bun run typecheck` passes, and `cd apps/desktop && bun test src/lib/trpc/routers/model-proxy/service.test.ts` passes. Full `bun test` was not re-run during the audit follow-up because the previous full run failed in existing workspace-settings SQLite query tests unrelated to the port plumbing, `bun run lint:check-node-imports` is unavailable in this checkout, and manual dual-instance Devices validation was not performed in this non-interactive pass.

## Context and Orientation

This Superset monorepo uses Bun and Turborepo. The affected app is `apps/desktop`, an Electron desktop app. Electron has a main process, which can use Node.js modules and start local services, and a renderer process, which displays the UI. Electron IPC means interprocess communication between renderer and main; in this app, renderer-to-main app APIs should use tRPC from `apps/desktop/src/lib/trpc`, but the existing device bridge package also exposes device actions through Electron preload APIs.

The user-facing feature is the Devices tab in the right sidebar of the workspace UI. It appears in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx` and renders `DevicesPanel` from `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/DevicesPanel.tsx`. The Devices panel itself is not the source of the port conflict; it exercises main-process device bridge code, which then starts or connects to local helper processes.

The notification server is an Express HTTP server used for agent lifecycle hooks, health checks, and OAuth callback fallback. It is defined in `apps/desktop/src/main/lib/notifications/server.ts` and started in `apps/desktop/src/main/windows/main.ts` with `notificationsApp.listen(env.DESKTOP_NOTIFICATIONS_PORT, "127.0.0.1", ...)`. The default `DESKTOP_NOTIFICATIONS_PORT` is currently `51741` in `apps/desktop/src/shared/env.shared.ts`.

The local model proxy daemon is a separate Node-compatible process that serves an Anthropic-compatible local API for model routing. It is managed by `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`, started from `apps/desktop/src/main/index.ts`, and compiled as the `model-proxy` Electron Vite main entrypoint in `apps/desktop/electron.vite.config.ts`. Its host and port are currently exported from `apps/desktop/src/main/lib/model-proxy-daemon/types.ts`, where `MODEL_PROXY_PORT` is hardcoded to `39127`.

The iOS device bridge uses Meta's `idb_companion`, a local helper process that listens on a gRPC port. gRPC is an HTTP/2-based remote procedure call protocol; here it is just a local machine protocol between Superset and the iOS simulator helper. The reusable device bridge package is in `packages/device-bridge`. `packages/device-bridge/src/register.ts` accepts `DeviceBridgeOptions.grpcPort`, but defaults to `10882` if desktop does not pass a value.

The build system compiles the desktop app with Electron Vite. `apps/desktop/electron.vite.config.ts` uses Vite `define` values to replace selected `process.env.*` expressions at compile time. Packaging uses electron-builder through `apps/desktop/electron-builder.ts` for stable and `apps/desktop/electron-builder.canary.ts` for Canary. CI invokes those configs through `.github/workflows/build-desktop.yml`; Canary passes `electron-builder.canary.ts` from `.github/workflows/release-desktop-canary.yml`.

## Plan of Work

First, extend the shared desktop environment schema in `apps/desktop/src/shared/env.shared.ts`. Add `DESKTOP_MODEL_PROXY_PORT` with default `39127` and `DESKTOP_DEVICE_BRIDGE_GRPC_PORT` with default `10882`. Keep the existing `DESKTOP_NOTIFICATIONS_PORT` default as `51741`. Parse the new values from `process.env` in the exported `env` object. This makes all three conflict-prone local service ports available through one typed configuration path.

Next, update `apps/desktop/electron.vite.config.ts` so the new environment variables are injected anywhere desktop code may need them. In the main `define` block, add `process.env.DESKTOP_MODEL_PROXY_PORT` and `process.env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT` using the existing `defineEnv` helper. Add matching renderer `define` entries only if renderer code imports `shared/env.shared.ts`; because that file is marked safe for shared code, mirroring the existing pattern prevents build-time surprises. Do not add runtime checks for Canary names.

Then update the notification server startup only if needed for clarity. `apps/desktop/src/main/windows/main.ts` already uses `env.DESKTOP_NOTIFICATIONS_PORT`, so the functional change for notifications is mostly build injection. If implementation touches this block, keep the behavior minimal: listen on the configured port and allow a real `EADDRINUSE` to surface in logs when an explicitly configured port is occupied.

Next, pass the configured iOS gRPC port into the device bridge. In `apps/desktop/src/main/windows/main.ts`, change the call from `registerDeviceBridge(window.webContents, getIdbArtifacts())` to pass an object that preserves `protoPath`, `companionPath`, and `companionFrameworkPath` from `getIdbArtifacts()` and adds `grpcPort: env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT`. This uses the existing `DeviceBridgeOptions.grpcPort` hook and leaves `packages/device-bridge` defaults unchanged.

Next, remove the hardcoded model proxy port from the daemon manager path. In `apps/desktop/src/main/lib/model-proxy-daemon/types.ts`, either replace `MODEL_PROXY_PORT` with a function that reads `env.DESKTOP_MODEL_PROXY_PORT`, or remove the port constant and export only `MODEL_PROXY_HOST`, `MODEL_PROXY_PROTOCOL_VERSION`, and `MODEL_PROXY_WORKSPACE_TOKEN`. In `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`, build the endpoint with `env.DESKTOP_MODEL_PROXY_PORT`. Ensure `spawnDaemon()` passes `DESKTOP_MODEL_PROXY_PORT: String(env.DESKTOP_MODEL_PROXY_PORT)` in the child environment so the daemon process and manager agree on the configured port even after compilation.

Then update the model proxy daemon HTTP server entrypoint and server code so it listens on the configured port. Search for every import or use of `MODEL_PROXY_PORT` under `apps/desktop/src/main/model-proxy` and `apps/desktop/src/main/lib/model-proxy-daemon`. Replace each use with the typed env value or a small shared helper. The health response should continue reporting the actual configured port. The manifest endpoint should become `http://127.0.0.1:${env.DESKTOP_MODEL_PROXY_PORT}` for the current flavor.

Next, add package or CI build injection for Canary. Prefer the narrowest mechanism that makes the compiled Canary app carry alternate port values without runtime flavor detection. In `.github/workflows/build-desktop.yml`, add optional workflow inputs for desktop local service ports, or derive env values from the existing `channel` input in the compile steps. Canary should compile with `DESKTOP_NOTIFICATIONS_PORT=51742`, `DESKTOP_MODEL_PROXY_PORT=39128`, and `DESKTOP_DEVICE_BRIDGE_GRPC_PORT=10883`; stable should compile with the current defaults. Local package scripts may also add an explicit Canary compile/package script if maintainers build Canary locally. If only CI builds Canary, the CI compile-step injection is sufficient for release artifacts.

Finally, update or add tests around the configuration plumbing where tests already exist. If there are model proxy daemon tests, assert that the manager and daemon use the configured port rather than the old hardcoded constant. If there are no focused tests for env parsing, add a small test only if the existing test setup can safely reset process environment and module imports. Avoid broad refactors and avoid changing Devices UI behavior.

## Milestones

### Milestone 1: Typed port configuration exists

This milestone makes the three local service ports first-class typed configuration values. At completion, `env.DESKTOP_MODEL_PROXY_PORT` and `env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT` exist with stable defaults, and Electron Vite injects them the same way it already injects `DESKTOP_NOTIFICATIONS_PORT`.

Scope: edit `apps/desktop/src/shared/env.shared.ts` and `apps/desktop/electron.vite.config.ts`.

Acceptance:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript completes without errors about missing env fields.

Verify before proceeding: code can import the new env properties from `shared/env.shared` in main process files without type errors.

### Milestone 2: Main services consume configured ports

This milestone removes the hardcoded conflict behavior from the services that affect dual-instance Devices usage. At completion, the notification server uses the existing configured notification port, the iOS device bridge receives `env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT`, and the model proxy manager and daemon use `env.DESKTOP_MODEL_PROXY_PORT`.

Scope: edit `apps/desktop/src/main/windows/main.ts`, `apps/desktop/src/main/lib/model-proxy-daemon/types.ts`, `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`, and any `apps/desktop/src/main/model-proxy/*` file that imports `MODEL_PROXY_PORT`.

Acceptance:

    cd apps/desktop
    bun run typecheck
    bun test
    # Expected: TypeScript succeeds and existing desktop tests pass.

Verify before proceeding: a repository search for `MODEL_PROXY_PORT` should show no stale hardcoded `39127` call path, or only a default definition that is explicitly fed by env.

### Milestone 3: Canary build injects alternate ports

This milestone makes release artifacts deterministic by flavor. At completion, stable/default dev builds keep current defaults and Canary builds compile with the alternate port map.

Scope: edit `.github/workflows/build-desktop.yml` and, if needed for local developer parity, `apps/desktop/package.json` scripts or a small desktop build helper script. Do not add runtime code that checks product name, app ID, executable path, or resources path to infer the flavor.

Acceptance:

    cd apps/desktop
    DESKTOP_NOTIFICATIONS_PORT=51742 DESKTOP_MODEL_PROXY_PORT=39128 DESKTOP_DEVICE_BRIDGE_GRPC_PORT=10883 bun run compile:app
    # Expected: electron-vite builds the main, preload, and renderer bundles without errors.

Verify before proceeding: inspect the CI workflow compile step and confirm Canary passes alternate port env vars before `bun run compile:app`, while stable compiles with defaults or explicit stable values.

### Milestone 4: Dual-instance behavior is manually validated

This milestone proves the bug is fixed from the user's point of view. At completion, a packaged Canary app and a local dev app can both use Settings Sidebar > Devices and iOS simulator preview at the same time.

Scope: run one packaged Canary artifact or locally packaged Canary-equivalent build, then run the dev app. Because this repo has an Apple Silicon/Rosetta native module concern, use the known arm64 desktop startup flow for local dev rather than a generic `bun dev` if running on Apple Silicon.

Acceptance:

    cd apps/desktop
    bun run typecheck
    bun test
    bun run lint:check-node-imports
    # Expected: no type errors, tests pass, and no renderer Node.js import violations.

Manual acceptance:

    1. Start or open the Canary desktop app built with notification 51742, model proxy 39128, and iOS gRPC 10883.
    2. Start the local dev desktop app with the default or explicitly configured dev ports.
    3. In both apps, open a workspace and click the Devices tab in the right sidebar.
    4. Select an iOS simulator in each app and start preview.
    5. Observe that the second-opened app does not fail with EADDRINUSE or `Port 10882 is already in use`.

## Concrete Steps

Work from the repository root unless a command specifies `apps/desktop`.

1. Add the new env fields in `apps/desktop/src/shared/env.shared.ts`:

    - `DESKTOP_MODEL_PROXY_PORT: z.coerce.number().default(39127)`
    - `DESKTOP_DEVICE_BRIDGE_GRPC_PORT: z.coerce.number().default(10882)`

    Include them in the object passed to `envSchema.parse`.

2. Add matching `define` entries in `apps/desktop/electron.vite.config.ts` main and renderer sections:

        "process.env.DESKTOP_MODEL_PROXY_PORT": defineEnv(process.env.DESKTOP_MODEL_PROXY_PORT),
        "process.env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT": defineEnv(process.env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT),

3. In `apps/desktop/src/main/windows/main.ts`, update `registerDeviceBridge` so its options include `grpcPort: env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT` while keeping the artifact paths returned by `getIdbArtifacts()`.

4. In `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`, import `env` from `shared/env.shared`, compute endpoints with `env.DESKTOP_MODEL_PROXY_PORT`, and pass `DESKTOP_MODEL_PROXY_PORT` to the spawned daemon process environment.

5. In model proxy daemon server files under `apps/desktop/src/main/model-proxy`, replace any hardcoded `MODEL_PROXY_PORT` usage with the same env-backed port. Keep `MODEL_PROXY_HOST` as `127.0.0.1` unless a test or existing file proves it is also configurable.

6. Update `.github/workflows/build-desktop.yml` so the compile step receives flavor-specific ports. One acceptable shape is to add a shell step before compile that writes values to `$GITHUB_ENV` based on `inputs.channel`, then let the existing `Compile app with electron-vite` env block pass those values. Another acceptable shape is to set each env value with a GitHub expression that chooses Canary ports when `inputs.channel == 'canary'` and stable defaults otherwise. The important invariant is that `bun run compile:app` sees the correct values before Vite replaces `process.env.*`.

7. Run validation:

        cd apps/desktop
        bun run typecheck
        bun test
        bun run lint:check-node-imports

    Expected result: all commands complete successfully. If `lint:check-node-imports` does not exist in `apps/desktop/package.json`, run the closest existing desktop lint command or root `bun run lint` and record the deviation in `Surprises & Discoveries`.

8. Manually validate dual-instance Devices behavior using the steps in Milestone 4.

## Validation and Acceptance

The main acceptance criterion is behavioral: a packaged Canary build and a local dev build can both use Settings Sidebar > Devices for iOS simulator preview without the later-opened app becoming unusable due to a port conflict.

Code validation must include:

    cd apps/desktop
    bun run typecheck
    bun test

If implementation touches renderer or preload boundaries, also run:

    cd apps/desktop
    bun run lint:check-node-imports

If that script is unavailable, run root lint from the repository root:

    bun run lint

Manual validation must include checking the logs of both apps for the configured notification ports and model proxy ports. Expected examples are:

    [notifications] Listening on http://127.0.0.1:51741
    [notifications] Listening on http://127.0.0.1:51742

The model proxy status in Settings > Models should show the stable/default dev app on port `39127` and the Canary app on port `39128` when both are running. The Devices panel should be able to start iOS simulator preview in both apps without an `idb_companion` gRPC conflict on `10882`.

## Idempotence and Recovery

The code changes are idempotent: rerunning compile, typecheck, tests, and packaging should not create persistent local state beyond normal build outputs. The port map is deterministic, so repeated Canary builds should keep using the Canary ports.

If a configured port is occupied by a non-Superset process, do not add broad process killing or a silent random fallback as part of this plan. Report the conflict in logs and let the operator either stop the conflicting process or choose explicit override ports. Killing unknown port holders is unsafe because those processes may belong to other developer tools.

If Canary injection fails in CI because Vite does not receive the intended env values, recover by moving the injection closer to `bun run compile:app`, not by adding runtime flavor checks. For example, set `DESKTOP_MODEL_PROXY_PORT=39128` directly in the `Compile app with electron-vite` step for `inputs.channel == 'canary'`.

If local dev and Canary still conflict after implementation, inspect the actual compiled value by adding temporary logging around the three configured ports in main startup, then remove that logging before completion unless the logs are already part of normal service startup.

## Artifacts and Notes

Important current code locations:

    apps/desktop/src/shared/env.shared.ts
    # Current shared env defaults include DESKTOP_NOTIFICATIONS_PORT=51741 but not model proxy or device bridge gRPC ports.

    apps/desktop/src/main/windows/main.ts
    # Starts notificationsApp on env.DESKTOP_NOTIFICATIONS_PORT and registers the device bridge without grpcPort.

    packages/device-bridge/src/register.ts
    # Uses options.grpcPort ?? 10_882 for idb_companion.

    apps/desktop/src/main/lib/model-proxy-daemon/types.ts
    # Currently exports MODEL_PROXY_PORT = 39127.

    apps/desktop/electron.vite.config.ts
    # Compile-time injection point for process.env.* values used by main and renderer bundles.

    .github/workflows/build-desktop.yml
    # CI compile step for stable and Canary release artifacts.

The expected final port map is:

    stable/default dev:
      DESKTOP_NOTIFICATIONS_PORT=51741
      DESKTOP_MODEL_PROXY_PORT=39127
      DESKTOP_DEVICE_BRIDGE_GRPC_PORT=10882

    canary:
      DESKTOP_NOTIFICATIONS_PORT=51742
      DESKTOP_MODEL_PROXY_PORT=39128
      DESKTOP_DEVICE_BRIDGE_GRPC_PORT=10883

## Interfaces and Dependencies

`apps/desktop/src/shared/env.shared.ts` must expose these numeric fields on `env`:

    env.DESKTOP_NOTIFICATIONS_PORT: number
    env.DESKTOP_MODEL_PROXY_PORT: number
    env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT: number

`apps/desktop/src/main/windows/main.ts` must call `registerDeviceBridge` with a `DeviceBridgeOptions` object equivalent to:

    registerDeviceBridge(window.webContents, {
      ...getIdbArtifacts(),
      grpcPort: env.DESKTOP_DEVICE_BRIDGE_GRPC_PORT,
    });

The model proxy daemon manager must construct its endpoint from the configured port:

    http://127.0.0.1:${env.DESKTOP_MODEL_PROXY_PORT}

The daemon child process must receive the same value in its environment so the manager and daemon never disagree about the port.

The implementation should not introduce new third-party dependencies. It should use existing Zod env parsing, Electron Vite `define` injection, electron-builder configs, and GitHub Actions workflow inputs.

## Revision Notes

- 2026-04-28 16:21 local: Initial plan created after investigating the Devices port conflict and confirming the desired design is build or launch configuration injection instead of runtime flavor detection.
