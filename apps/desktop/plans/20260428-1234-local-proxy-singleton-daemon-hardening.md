# Make LocalProxy a durable single-port singleton daemon

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. This is desktop app work, so the plan lives in `apps/desktop/plans/`. The desktop app is an Electron app: the main process can use Node.js APIs and spawn processes, while the renderer process is the browser-like React UI. Renderer-to-main communication must use tRPC from `apps/desktop/src/lib/trpc`.

## Purpose / Big Picture

After this change, Superset's Settings > Models > Local proxy will expose one stable local model endpoint that remains consistent across stable builds, canary builds, development builds, multiple app windows, and app restarts. Claude Code workspace settings can keep pointing at the same local URL, and the daemon behind that URL should remain alive independently of any one desktop app process.

The user-visible behavior is that Settings > Models should show `http://127.0.0.1:39127` as running whenever a healthy Superset LocalProxy daemon exists on that fixed port. If the daemon is not available, the UI should say why: missing daemon script, stale manifest, token mismatch, protocol mismatch, occupied by another service, or daemon alive but failing health checks. The app must not solve this by assigning a different port per workspace or per app flavor; the fixed port is part of the product contract because existing `.claude/settings.local.json` files point Claude Code at that URL.

The implementation should be direct. Superset has not launched with this feature yet, so do not preserve awkward compatibility layers, fallback ports, or historical behavior just to avoid changing code. Remove incorrect assumptions instead of wrapping them.

## Assumptions

This work is scoped to `apps/desktop`. It touches the desktop main process, the model-proxy daemon entrypoint, daemon manager files, shared model-proxy status types, the existing Settings > Models renderer status display, and tests around those areas. It should not change the web, marketing, API, admin, docs, mobile apps, or database packages.

The LocalProxy endpoint must remain fixed at `http://127.0.0.1:39127`. Do not introduce workspace-specific, canary-specific, development-specific, or window-specific model proxy ports. A fixed port is necessary because Claude Code workspace settings live inside user project directories and may be created by one version of Superset but used while another version of Superset is running.

The model proxy daemon is intended to be a global singleton for the current OS user. A singleton means there should be only one authoritative daemon for the fixed LocalProxy endpoint at a time. The daemon should outlive app windows and normal Electron main-process churn. It should only be stopped for an explicit Superset LocalProxy restart or when replacing a known Superset-owned daemon with a newer compatible daemon.

The daemon already exists in the current working tree as `apps/desktop/src/main/model-proxy/index.ts` and `apps/desktop/src/main/model-proxy/server.ts`, with lifecycle logic in `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` and manifest helpers in `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts`. This plan hardens that implementation rather than returning to the older in-process proxy.

## Open Questions

There are no product questions blocking implementation. The user has explicitly decided that LocalProxy must keep one stable port and one persistent daemon across app versions, windows, and workspaces.

Technical unknowns remain and must be resolved during implementation:

1. The current manifest directory is derived from `SUPERSET_HOME_DIR`, which can include `SUPERSET_WORKSPACE_NAME`. Confirm whether this makes daemon state workspace-scoped in development. If it does, move daemon control state to an intentionally global per-user directory for model proxy only. This affects the Plan of Work, Idempotence and Recovery, and Validation sections. Decision Log placeholder: "Choose global daemon state path."
2. The current health endpoint requires the manifest control token. Confirm whether a Superset daemon can be identified safely when the manifest is missing or has the wrong control token. This affects daemon discovery, diagnostics, and security. Decision Log placeholder: "Choose unauthenticated identity probe shape."
3. Confirm whether the daemon can remain compatible across active development builds when protocol versions differ. This affects whether the manager should adopt, reject with a clear error, or explicitly restart a known Superset daemon. Decision Log placeholder: "Choose protocol mismatch behavior."

## Progress

- [x] (2026-04-28 12:34Z) Reviewed root and desktop AGENTS instructions, including Bun usage, tRPC for desktop interprocess calls, and plan placement under `apps/desktop/plans/`.
- [x] (2026-04-28 12:34Z) Traced the current LocalProxy flow from Settings > Models through tRPC, `ModelProxyDaemonManager`, manifest storage, daemon entrypoint, and daemon HTTP server.
- [x] (2026-04-28 12:34Z) Captured the product constraint that LocalProxy must not use independent ports for dev, canary, workspaces, or windows.
- [x] (2026-04-28 12:34Z) Created this ExecPlan for single-port singleton daemon hardening.
- [x] (2026-04-28 12:34Z) Confirmed `SUPERSET_HOME_DIR` is workspace-sensitive through `SUPERSET_WORKSPACE_NAME` and moved daemon control state to a global per-user `~/.superset/daemons/model-proxy/port-39127` path for manifest, token, log, and lock.
- [x] (2026-04-28 12:34Z) Added active fixed-port discovery through unauthenticated `/.well-known/superset-model-proxy` identity probing before spawning or restarting.
- [x] (2026-04-28 12:34Z) Replaced vague unavailable status with typed `ModelProxyStatusCode` diagnostics surfaced through tRPC and Settings > Models.
- [x] (2026-04-28 12:34Z) Hardened start, status, restart, and workspace-settings save flows so they keep the fixed endpoint, avoid duplicate daemon spawns, and never kill unrelated port holders.
- [x] (2026-04-28 12:34Z) Added targeted tests for global manifest path, daemon discovery, healthy adoption, token mismatch, unrelated port occupation, missing daemon script, protected health, public identity, and restart safety.
- [x] (2026-04-28 12:34Z) Ran targeted tests and desktop typecheck successfully. Root lint and manual desktop validation were not run to avoid broad unrelated workspace churn; see Outcomes for exact commands.
- [x] (2026-04-28 16:40Z) Addressed first audit findings: removed `DESKTOP_MODEL_PROXY_PORT` from LocalProxy env/config inputs, added the fixed `MODEL_PROXY_PORT = 39127` constant, and routed endpoint, manifest, server, status, tests, and UI text through fixed constants.
- [x] (2026-04-28 16:40Z) Reworked manifest discovery so liveness/health and fixed-port truth win before protocol compatibility: stale old-protocol or PID-reused manifests are cleaned up when the port is free, while occupied ports report the actual holder.
- [x] (2026-04-28 16:40Z) Hardened spawn and control ownership: spawn lock creation now uses exclusive `wx`, daemon control-token creation uses exclusive `wx` with EEXIST reread, and restart only kills a daemon proven by manifest plus authenticated health.
- [x] (2026-04-28 16:40Z) Removed provider/model counts from daemon `/health` so status polling no longer decrypts provider secrets via health checks.
- [x] (2026-04-28 16:40Z) Added targeted audit-regression tests and reran daemon/router tests plus desktop typecheck successfully; see Outcomes for exact commands.
- [x] (2026-04-28 17:20Z) Addressed remaining medium audit finding: stale spawn-lock recovery now hard-links the observed stale lock to a unique stale path, verifies the canonical and stale paths still reference the same inode before unlinking the canonical lock, then retries exclusive creation with fresh owner metadata.
- [x] (2026-04-28 17:20Z) Added a regression test that simulates another process recreating the canonical spawn lock during stale recovery and verifies the fresh lock is not removed.

## Surprises & Discoveries

- Observation: The current Settings > Models fallback text is not provider-proxy related. It is displayed when `proxyStatus?.baseUrl` is null.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` renders `{proxyStatus?.baseUrl ?? "Proxy URL unavailable"}` in the Local proxy section.

- Observation: The manager currently trusts the manifest as the main source of truth. Without a readable, valid manifest, `status()` returns stopped and does not actively identify what is already bound to the fixed port.
  Evidence: `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` reads `readModelProxyManifest()` in `status()`, returns `emptyStatus()` when none exists, and only fetches `/health` through the manifest endpoint and control token.

- Observation: The daemon state path is currently derived from `SUPERSET_HOME_DIR` plus `model-proxy/port-${DESKTOP_MODEL_PROXY_PORT}`.
  Evidence: `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts` builds `MODEL_PROXY_DIR` from `SUPERSET_HOME_DIR`, `model-proxy`, and the configured port.

- Observation: Canary changes Electron `userData` only in non-development builds. That does not by itself define LocalProxy daemon ownership, because LocalProxy uses `SUPERSET_HOME_DIR`, not Electron `userData`.
  Evidence: `apps/desktop/src/main/index.ts` calls `app.setPath("userData", ...)` for canary, while `apps/desktop/src/main/lib/app-environment.ts` defines `SUPERSET_HOME_DIR` from an environment variable or the shared directory name.

- Observation: `SUPERSET_HOME_DIR` is workspace-sensitive in development because `SUPERSET_WORKSPACE_NAME` defaults to `superset` but can produce `.superset-<workspace>` through `getWorkspaceName()`.
  Evidence: `apps/desktop/src/shared/constants.ts` builds `SUPERSET_DIR_NAME` from `getWorkspaceName()`, and `apps/desktop/src/main/lib/app-environment.ts` derives `SUPERSET_HOME_DIR` from that name when the env override is absent.

- Observation: Real server tests cannot bind the singleton port reliably in the current developer environment because a live process may already own `127.0.0.1:39127`.
  Evidence: the first `server.test.ts` implementation that called `server.start()` failed with `EADDRINUSE`; the final server tests invoke the request handler directly with mocked request/response objects to validate identity and health routing without touching the fixed product port.

- Observation: A manifest can be syntactically valid but operationally stale even when its PID is alive or protocol is old.
  Evidence: the first audit found old-protocol manifests and PID-reused manifests could block recovery; the manager now probes authenticated health and then the fixed-port identity before returning protocol mismatch or health unavailable.

- Observation: `/health` was doing more than liveness by calling provider storage, which decrypts secrets for proxy routing.
  Evidence: `ModelProxyDaemonServer.status()` previously called `listProvidersForProxy()` and `health()` forwarded those counts. `/health` now returns only process, port, and protocol liveness fields.

- Observation: A stale-lock recovery path that reads a lock and then unlinks the canonical path can remove another process's newly recreated lock.
  Evidence: the remaining medium audit finding identified the `exists/read/unlink` sequence in `ModelProxyDaemonManager.acquireSpawnLock`; the regression test now simulates canonical lock replacement between stale-lock capture and cleanup.

## Decision Log

- Decision: Keep one fixed LocalProxy port, currently `39127`, across stable, canary, development builds, workspaces, and windows.
  Rationale: Claude Code workspace settings are written into user project directories and must keep working regardless of which Superset app process is currently running. Splitting ports would create broken settings and self-hosting confusion when Superset develops Superset.
  Date/Author: 2026-04-28 / user and planning agent.

- Decision: Treat LocalProxy as a per-user singleton daemon rather than an app-window-owned service.
  Rationale: The desired behavior is that the proxy endpoint survives app churn and remains consistent across multiple app processes. A window-scoped or app-flavor-scoped service cannot provide that guarantee.
  Date/Author: 2026-04-28 / user and planning agent.

- Decision: Do not preserve fallback ports, compatibility shims, or legacy in-process proxy paths.
  Rationale: The software has not launched with this feature yet, and the user explicitly asked to optimize without code or history baggage. A direct implementation is safer than multiple ambiguous ownership modes.
  Date/Author: 2026-04-28 / user and planning agent.

- Decision: The daemon should not kill unknown port holders.
  Rationale: A process listening on the fixed port may be the existing correct daemon or another local service. The manager should identify and report, not destroy, unless it can prove the PID belongs to a Superset daemon it owns and the user requested restart.
  Date/Author: 2026-04-28 / user and planning agent.

- Decision: Store daemon control state in `~/.superset/daemons/model-proxy/port-39127`, independent of `SUPERSET_HOME_DIR`.
  Rationale: `SUPERSET_HOME_DIR` may vary by workspace or app process, while LocalProxy ownership must be a singleton for the current OS user. Provider storage remains untouched.
  Date/Author: 2026-04-28 / implementation agent.

- Decision: Use `GET /.well-known/superset-model-proxy` as the unauthenticated identity probe.
  Rationale: The endpoint returns only non-secret identity fields (`service`, `protocolVersion`, `pid`, `startedAt`, `port`) so managers can distinguish Superset daemons from unrelated local services without exposing control tokens, workspace tokens, providers, or model data.
  Date/Author: 2026-04-28 / implementation agent.

- Decision: Treat protocol mismatch as a typed diagnostic and do not adopt the daemon automatically.
  Rationale: Cross-version health/control compatibility is not guaranteed. The app reports `protocol_mismatch`; explicit restart may replace only an identity-confirmed Superset daemon, never an unrelated listener.
  Date/Author: 2026-04-28 / implementation agent.

- Decision: Keep LocalProxy's port out of shared environment configuration and build-time env injection.
  Rationale: The product contract is exactly `http://127.0.0.1:39127`; allowing `DESKTOP_MODEL_PROXY_PORT` to configure LocalProxy reintroduces alternate ports and breaks workspace settings stability.
  Date/Author: 2026-04-28 / audit-fix agent.

- Decision: Cleanup stale manifests before returning protocol mismatch when the fixed port is free.
  Rationale: Protocol compatibility only matters for a live daemon. If health is unavailable and the port is free, the manifest is stale state and should not block spawning a replacement.
  Date/Author: 2026-04-28 / audit-fix agent.

- Decision: Require authenticated ownership proof before restart kills a PID.
  Rationale: The public identity endpoint is intentionally unauthenticated and can be mimicked. Restart now requires a valid manifest plus successful control-token `/health` with a matching PID before terminating a process.
  Date/Author: 2026-04-28 / audit-fix agent.

- Decision: Make `/health` liveness-only rather than provider-summary-bearing.
  Rationale: Settings polling should not decrypt provider secrets. Provider/model counts can be obtained through existing provider/model tRPC queries if the UI needs exact counts.
  Date/Author: 2026-04-28 / audit-fix agent.

- Decision: Steal stale spawn locks only after pinning the observed lock inode with a unique hard-link path.
  Rationale: POSIX hard-link plus inode verification ensures stale recovery only unlinks the same lock it observed; if another process recreates the canonical lock during recovery, the inode/link-count check fails and the fresh lock remains untouched.
  Date/Author: 2026-04-28 / audit-fix agent.

## Outcomes & Retrospective

Implemented the singleton hardening. The daemon control files now live under a per-user global path, the daemon exposes a non-secret identity endpoint, the manager actively probes the fixed port before spawn/restart, and Settings > Models now shows typed diagnostics instead of `Proxy URL unavailable`. Workspace settings save still writes only the fixed `http://127.0.0.1:39127` endpoint and fails with the diagnostic code/detail if no usable daemon URL exists.

First-audit fixes are also complete. LocalProxy no longer accepts `DESKTOP_MODEL_PROXY_PORT` as configuration and instead uses the shared fixed `MODEL_PROXY_PORT`. Manifest handling now validates daemon health/port liveness before protocol mismatch, cleans up stale old-protocol and PID-reused manifests when the port is free, and reports the real fixed-port holder when occupied. Spawn locking and control-token creation use exclusive file creation. Restart no longer trusts unauthenticated public identity alone; it only kills a PID corroborated by manifest plus authenticated health. Daemon `/health` no longer includes provider/model counts and therefore no longer decrypts provider secrets during status polling.

Remaining medium audit fix is complete. Spawn lock creation still starts with exclusive `openSync("wx")`, but stale recovery no longer does a separate read/unlink of the canonical path. New locks write JSON metadata with a unique owner id and timestamp. For stale locks, the manager creates a unique hard link to the observed lock, verifies the canonical path and stale path still point at the observed inode and link count, unlinks only that canonical lock, then retries exclusive creation. If another process recreates the canonical lock during recovery, verification fails and the fresh lock is preserved.

Validation completed:

- `bun test /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/model-proxy/server.test.ts` — passed after audit fixes, 17 tests, 39 assertions.
- `bun test /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts` — passed, 12 tests, 32 assertions.
- `bun run --cwd /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop typecheck` — passed after generating icons/routes and running `tsc --noEmit`.
- `bun test /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop/src/main/model-proxy/server.test.ts && bun run --cwd /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop typecheck` — passed after the remaining medium audit fix, 18 tests, 41 assertions, then generated icons/routes and ran `tsc --noEmit`.

Root `bun run lint` was not run because the branch already contains many unrelated parallel modifications and the user asked not to reformat or touch unrelated files. Manual desktop validation was not run in this agent session. The main remaining gap is end-to-end confirmation in the Electron UI with a real daemon process, including a second app process adopting the same singleton.

## Context and Orientation

This repository is a Bun and Turborepo monorepo. Use Bun commands, not npm, yarn, or pnpm. The affected app is `apps/desktop`, the Electron desktop application. Electron has a main process, which can use Node.js modules and spawn child processes, and a renderer process, which is the browser-like React UI. In this project, renderer-to-main calls use tRPC routers under `apps/desktop/src/lib/trpc`; tRPC is a type-safe request layer where renderer code calls procedures such as `electronTrpc.modelProxy.status.useQuery()` instead of using untyped Electron IPC channels.

LocalProxy is Superset Desktop's local Anthropic-compatible model API. Anthropic-compatible means Claude Code can talk to it using Anthropic-style endpoints and headers. The local proxy exposes `GET /v1/models` and `POST /v1/messages` on a local address. Workspaces are configured by writing `.claude/settings.local.json` with `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and default model environment variables. Claude Code reads that local settings file when a workspace terminal session starts.

The renderer UI for Settings > Models lives in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It queries `electronTrpc.modelProxy.status` every five seconds and renders a Running or Stopped badge plus the proxy base URL or the fallback text `Proxy URL unavailable`.

The tRPC router lives in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. It exposes three grouped procedure sets. `modelProviders` manages provider records and model fetching. `modelProxy` exposes `status` and `restart`. `workspaceModelSettings` reads and writes per-workspace model settings and calls `modelProxyDaemonManager.ensureRunning()` before writing Claude Code environment variables.

Provider storage lives in `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`. It reads provider records from the local desktop database, redacts secrets for renderer-facing lists, and decrypts secrets for proxy routing. Provider request logic lives in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`, including upstream fetch behavior and optional upstream HTTP or HTTPS proxy support through `undici`'s `ProxyAgent`.

The daemon manager lives in `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`. It currently reads a manifest, health-checks the daemon through `/health` using the manifest control token, spawns `dist/main/model-proxy.js` when needed, and reports `ModelProxyStatus`. The manifest helpers live in `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts`. The daemon entrypoint is `apps/desktop/src/main/model-proxy/index.ts`; it starts `ModelProxyDaemonServer` from `apps/desktop/src/main/model-proxy/server.ts`, writes the manifest, and handles shutdown signals.

Shared model-proxy status types live in `apps/desktop/src/shared/model-proxy.ts`. `ModelProxyStatus` currently includes `running`, `baseUrl`, `port`, `tokenConfigured`, `enabledProviderCount`, `aggregatedModelCount`, and optional `lastError`. This plan may add typed diagnostic fields to make Settings > Models more precise.

Build configuration is in `apps/desktop/electron.vite.config.ts`. The daemon entrypoint must remain included in the Electron Vite main Rollup inputs as `model-proxy`, so development and packaged builds emit `dist/main/model-proxy.js`.

## Plan of Work

First, make daemon ownership state intentionally global for the current OS user. Inspect `apps/desktop/src/shared/constants.ts`, `apps/desktop/src/shared/env.shared.ts`, `apps/desktop/src/main/lib/app-environment.ts`, and `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts`. If `SUPERSET_HOME_DIR` can become workspace-specific, stop using it as the source of model-proxy singleton identity. Add a model-proxy-specific global home helper in `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts` or a nearby file. The goal is for stable, canary, development, and multiple windows to all read the same manifest, control token, spawn lock, and daemon log for the fixed port. Preserve private directory and file modes. Do not move provider storage unless necessary; this change is about daemon control state, not user provider data.

Next, introduce explicit daemon identity discovery. Add a new unauthenticated endpoint to `apps/desktop/src/main/model-proxy/server.ts`, for example `GET /.well-known/superset-model-proxy` or `GET /identity`, that returns only non-sensitive identity fields: `service: "superset-model-proxy"`, `protocolVersion`, `pid`, `startedAt`, and `port`. It must not return the control token, workspace token, provider names, provider secrets, or model list. Keep `GET /health` control-token protected because it reports operational details used by the manager. The identity endpoint exists so a manager with a missing or stale manifest can distinguish "a Superset model proxy is already on this port" from "some unrelated local service owns this port".

Then, expand shared status typing in `apps/desktop/src/shared/model-proxy.ts`. Add a narrow status reason field such as `state` or `diagnosticCode`. Keep it serializable and renderer-safe. Suggested states are `running`, `stopped`, `starting`, `script_missing`, `port_occupied_by_superset`, `port_occupied_by_other`, `manifest_token_mismatch`, `protocol_mismatch`, `health_unavailable`, and `spawn_timeout`. Keep `lastError` for human-readable detail, but do not make the UI parse English strings. Update any tests and UI references for the new type.

After that, rewrite `ModelProxyDaemonManager` around a clear state machine. `status()` should first try to adopt through the manifest. If the manifest exists and `/health` succeeds with the control token and expected protocol, return running. If the manifest exists but the PID is dead, remove that manifest and continue discovery. If the manifest exists but health returns unauthorized or malformed, probe the fixed port identity endpoint and report token mismatch or incompatible Superset daemon instead of returning a vague stopped status.

When no usable manifest exists, the manager should probe the fixed port before spawning. If nothing is listening, it may acquire the spawn lock and spawn the daemon. If a Superset identity endpoint responds, it should report that a Superset daemon is present but not adoptable until it can establish or recover control-token trust. If an unrelated HTTP service responds, or TCP connects but no Superset identity endpoint exists, report `port_occupied_by_other`. It must not kill the port holder. If probing fails with connection refused, treat the port as free. If probing times out, report a clear timeout message and avoid rapid respawn loops.

Implement control-token recovery only if it is safe and simple. The preferred direct approach is that the daemon's control token lives in the global daemon state directory and the daemon reads that file on startup. If the file exists and the daemon identity endpoint says a Superset daemon is running but `/health` rejects the current token, the manager should report `manifest_token_mismatch`; it should not guess or rotate tokens behind a live daemon. Because the software has not launched, old bad local daemon state may be replaced by an explicit restart path, but replacement must only target a known Superset daemon, not an unknown service.

Make restart strict and intentional. `modelProxyDaemonManager.restart()` may terminate only a PID from a valid manifest or a PID returned by the Superset identity endpoint on the fixed port, and only after confirming the identity says `service: "superset-model-proxy"`. It must not terminate unrelated port holders. After stopping a known daemon, restart should remove stale manifest and lock files, spawn a fresh daemon, wait for health, and return a typed status. If stop times out, report a clear error rather than spawning a duplicate.

Update Settings > Models UI in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. Keep the existing layout but replace the vague URL fallback with a concise diagnostic. When `baseUrl` is null, show a state-specific message such as `Local proxy is not running`, `Port 39127 is used by another local service`, `A Superset proxy is running but this app cannot authenticate to it`, or `Daemon script is missing; rebuild the desktop app`. Continue showing `lastError` in the existing destructive text area for details. The UI should still poll status every five seconds and keep the Restart proxy button.

Update tRPC router behavior in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. `modelProxy.status` should return the richer status. `modelProxy.restart` should return the richer status. `workspaceModelSettings.save` should call `ensureRunning()` and throw a clear error if the resulting status has no `baseUrl`, using the status reason and `lastError` so users understand why settings cannot be written. Do not write workspace settings with a null or alternate proxy URL.

Add tests. Place daemon-manager tests near `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` if the current test setup supports Electron-main aliases there; otherwise put them under the nearest existing test-friendly desktop path and mock Node APIs carefully. Add server tests for identity and health authentication near `apps/desktop/src/main/model-proxy/server.ts`. Add shared type/UI helper tests only if a pure function is introduced to map status codes to display strings. Tests should cover no manifest/no listener, healthy manifest adoption, dead manifest cleanup, Superset identity without valid control token, unrelated port holder, missing daemon script, restart of known Superset daemon, and protection against killing unrelated listeners.

Finally, remove code baggage. Delete any fallback that silently changes ports. Delete compatibility branches for old in-process proxy ownership if any remain. Do not add feature flags. Do not preserve ambiguous status behavior once the typed diagnostics exist. Keep the implementation smaller and more decisive than a defensive migration would be.

## Concrete Steps

Start from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Review the relevant files before editing:

    apps/desktop/src/shared/constants.ts
    apps/desktop/src/shared/env.shared.ts
    apps/desktop/src/shared/model-proxy.ts
    apps/desktop/src/main/lib/app-environment.ts
    apps/desktop/src/main/lib/model-proxy-daemon/types.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manager.ts
    apps/desktop/src/main/model-proxy/index.ts
    apps/desktop/src/main/model-proxy/server.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/index.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/service.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.ts
    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx
    apps/desktop/electron.vite.config.ts

Edit `apps/desktop/src/main/lib/model-proxy-daemon/types.ts` to define all daemon protocol constants and identity types in one place. At the end of the implementation, this file should export constants for host, workspace token, protocol version, and service identity string, plus interfaces for manifest, health, and public identity response.

Edit `apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts` to make daemon control paths global and stable across desktop flavors. The resulting helpers should expose paths for manifest, control token, spawn lock, and log. They should create directories with private permissions and read invalid JSON as absent state. If provider storage still needs `SUPERSET_HOME_DIR`, leave provider storage unchanged.

Edit `apps/desktop/src/main/model-proxy/server.ts` to add the public identity endpoint and keep `/health` control-token protected. The identity endpoint should be implemented before workspace-token authorization so the manager can call it without credentials. It should reveal no secrets.

Edit `apps/desktop/src/shared/model-proxy.ts` to add typed diagnostic state to `ModelProxyStatus`. Keep the type simple enough for tRPC serialization.

Edit `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts` to implement the new discovery sequence. Use object-shaped helper parameters when helpers need two or more values, following repository conventions. Avoid empty catch blocks; when a caught error matters to status, turn it into a clear diagnostic. Keep spawn locking and concurrent start deduplication. Do not call destructive commands such as `lsof` plus kill. Do not kill unrelated processes.

Edit `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` so save failures include the diagnostic state. The router should still be the only renderer-to-main boundary for this feature.

Edit `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` to map status states to concise UI text. Prefer a small local helper in the same file unless the mapping is reused elsewhere. Do not create a new component folder unless the UI grows enough to justify it under AGENTS.md component co-location rules.

Add or update tests. Use existing Bun test patterns in the desktop app. Good target file names are:

    apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts
    apps/desktop/src/main/model-proxy/server.test.ts

If those exact locations are not compatible with the current test environment, document the reason in `Surprises & Discoveries` and place tests in the nearest existing model-proxy test location.

Run targeted tests from the repository root:

    bun test apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts
    # Expected: all existing model-proxy router tests pass.

    bun test apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts apps/desktop/src/main/model-proxy/server.test.ts
    # Expected: all new daemon tests pass.

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript exits successfully with no errors.

Run root lint from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset
    bun run lint
    # Expected: Biome exits successfully. If unrelated pre-existing lint failures appear, record the exact failures in Outcomes & Retrospective.

For manual desktop validation on Apple Silicon, use the known arm64 startup flow if the normal command hits native module architecture issues. The goal is to run the desktop app, not to repackage the app repeatedly. Start the app, open Settings > Models, and observe the Local proxy section.

## Validation and Acceptance

The first acceptance criterion is fixed-port singleton behavior. Start the desktop app in development, then open Settings > Models. The Local proxy section should show Running with `http://127.0.0.1:39127`. Open a second window or start another compatible Superset desktop process. The second process should adopt the same daemon instead of spawning another listener or changing ports.

The second acceptance criterion is daemon persistence. Start the desktop app, confirm the daemon is running, then restart the desktop app. The Local proxy should either remain running because the existing daemon was adopted, or be restarted cleanly if the daemon actually exited. The user should not need to delete manifest, lock, or log files manually.

The third acceptance criterion is workspace settings stability. Save model settings for a workspace. The workspace `.claude/settings.local.json` should contain `ANTHROPIC_BASE_URL=http://127.0.0.1:39127` and `ANTHROPIC_AUTH_TOKEN=superset-local-model-proxy`. Reopening the same workspace through another Superset app flavor must not require changing those values.

The fourth acceptance criterion is safe port diagnosis. If another non-Superset service is listening on `127.0.0.1:39127`, Settings > Models should show a clear occupied-by-other-service message. Superset must not kill that process, must not switch to another port, and must not write workspace settings pointing somewhere else.

The fifth acceptance criterion is Superset daemon identification. If a Superset model proxy daemon is already listening on `127.0.0.1:39127` but the manifest is missing or the control token is wrong, Settings > Models should identify that a Superset proxy is present but not adoptable. Restart should only terminate the process if the identity endpoint confirms it is `superset-model-proxy`.

The sixth acceptance criterion is API compatibility. With the daemon running, this command should return a JSON object with a `data` array. The array may be empty if no providers are configured:

    curl -H "x-api-key: superset-local-model-proxy" http://127.0.0.1:39127/v1/models
    # Expected: {"data":[...]}

The seventh acceptance criterion is validation. `bun run typecheck` inside `apps/desktop` passes. Targeted daemon and model-proxy tests pass. `bun run lint` from the repository root passes for changed files, or unrelated existing failures are documented with evidence.

## Idempotence and Recovery

Calling `modelProxyDaemonManager.start()` repeatedly must be safe. It should deduplicate concurrent work with the existing in-memory start promise and a filesystem spawn lock. Repeated status polling from Settings > Models must not spawn new daemons when an adoptable daemon already exists.

A dead manifest should be recoverable. If the manifest PID is not alive, the manager may remove the stale manifest and continue discovery. If the port is free, it can spawn a new daemon. If the port is occupied, it must report the occupant state instead of assuming ownership.

A stale lock should be recoverable. If the spawn lock is older than the lock timeout, the manager may remove it and retry. If the lock is fresh, another process may be starting the daemon, so the manager should wait briefly for health and then report a spawn timeout if no daemon becomes healthy.

A token mismatch should not be papered over. If a Superset daemon is alive but this manager cannot authenticate to `/health`, report the mismatch. Do not rotate tokens behind the live daemon. A user-initiated Restart proxy action can replace a known Superset daemon if the identity endpoint proves the listener is Superset-owned.

An unrelated port holder is not recoverable by Superset. The manager should report the conflict and leave the process alone. The user or operating system owns recovery for unrelated services.

## Artifacts and Notes

Current UI fallback to replace:

    {proxyStatus?.baseUrl ?? "Proxy URL unavailable"}

Final fixed endpoint calculation:

    modelProxyEndpoint() // http://127.0.0.1:39127

Final fixed model proxy port:

    export const MODEL_PROXY_PORT = 39127

A good final diagnostic status shape would look like this in spirit, though the exact names can change during implementation if tests document the final contract:

    export type ModelProxyStatusCode =
      | "running"
      | "stopped"
      | "script_missing"
      | "port_occupied_by_superset"
      | "port_occupied_by_other"
      | "manifest_token_mismatch"
      | "protocol_mismatch"
      | "health_unavailable"
      | "spawn_timeout";

    export interface ModelProxyStatus {
      running: boolean;
      statusCode: ModelProxyStatusCode;
      baseUrl: string | null;
      port: number | null;
      tokenConfigured: boolean;
      enabledProviderCount: number;
      aggregatedModelCount: number;
      lastError?: string;
    }

The exact status code names should be decided once the implementation is in place, but the final status must stay typed and must not require the renderer to parse `lastError` text.

## Interfaces and Dependencies

Use only existing runtime dependencies. Do not add a process supervisor, port allocator, or new package manager. Use Node.js `http`, `child_process`, filesystem helpers, Electron's current runtime, existing tRPC routers, and existing Bun test tooling.

The daemon server must expose these HTTP routes on `127.0.0.1:39127`:

    GET /identity or GET /.well-known/superset-model-proxy
    # No auth. Returns non-secret daemon identity only.

    GET /health
    # Requires daemon control token. Returns health details for adoption.

    GET /v1/models
    # Requires workspace token through authorization bearer token or x-api-key.

    POST /v1/messages
    # Requires workspace token through authorization bearer token or x-api-key.

The tRPC router must continue exposing these procedures:

    electronTrpc.modelProxy.status
    electronTrpc.modelProxy.restart
    electronTrpc.workspaceModelSettings.save
    electronTrpc.modelProviders.list/create/update/delete/test/fetchModels/fetchModelsFromDraft/listAggregatedModels

The daemon manager must continue providing these methods for main-process callers:

    start(): Promise<ModelProxyStatus>
    ensureRunning(): Promise<ModelProxyStatus>
    restart(): Promise<ModelProxyStatus>
    status(): Promise<ModelProxyStatus>
    getBaseUrl(): Promise<string | null>
    getWorkspaceToken(): string

Renderer code must not import Node-only daemon files. Renderer code may import shared types from `apps/desktop/src/shared/model-proxy.ts` and call tRPC hooks.

## Revision Notes

2026-04-28 12:34Z: Created the plan after diagnosing that `Proxy URL unavailable` means the daemon manager returned a null `baseUrl`, and after the user clarified that LocalProxy must use one stable port and persistent singleton daemon across all app flavors, windows, and workspaces. The plan intentionally rejects independent ports and compatibility fallback paths.
