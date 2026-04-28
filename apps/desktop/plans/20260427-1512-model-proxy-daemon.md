# Convert the local model proxy into a persistent daemon

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, desktop interprocess communication between the Electron renderer and main process must use tRPC from `apps/desktop/src/lib/trpc`; desktop daemon entrypoints are built by `apps/desktop/electron.vite.config.ts`; Bun is the package manager.

## Purpose / Big Picture

After this change, Claude Code workspaces that point at Superset's local model proxy keep using a stable local Anthropic-compatible endpoint even when the Electron desktop main process restarts, crashes, or reloads during development. The proxy will no longer be an HTTP server owned directly by Electron main. It will instead run as a separate local daemon process, similar in spirit to the terminal-host daemon, with Electron main responsible for spawning, adopting, checking health, restarting, and reporting status.

The user-visible behavior is that Settings > Models still shows the same local proxy status and workspace Models still writes `.claude/settings.local.json` with `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`, but the proxy process can be restarted independently and will not be killed by normal renderer or main-process failures. A human can see the behavior working by starting the desktop app, saving a workspace model configuration, verifying `http://127.0.0.1:39127/v1/models` responds with the local proxy token, restarting the desktop app, and observing that Settings > Models re-adopts or restarts the daemon without requiring manual cleanup.

## Assumptions

This work is scoped to `apps/desktop`. The affected surface is the desktop main process, its daemon entrypoints, shared model-proxy types, and the existing tRPC routers under `apps/desktop/src/lib/trpc/routers/model-proxy`. Renderer UI files should not need product redesign; they should continue calling the same tRPC procedures unless small status-field additions are useful.

The new proxy daemon should keep the external proxy URL stable as `http://127.0.0.1:39127` for this migration. Existing workspace `.claude/settings.local.json` files may already contain this URL, and keeping it stable avoids forcing every workspace to be rewritten. If that port is occupied by an unrelated process, Superset must report the conflict rather than killing the process.

The daemon process should run with `ELECTRON_RUN_AS_NODE=1`, like `apps/desktop/src/main/terminal-host/index.ts`, and should be compiled as a separate Electron Vite main entrypoint into `dist/main/model-proxy.js`. The main process should spawn that entrypoint with `process.execPath` in packaged and development builds using the same safety principles as `TerminalHostClient`.

Provider management should remain in the existing tRPC router in the Electron main process for this migration. The daemon may read provider storage directly from the existing `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`, but implementation must validate that encrypted provider secrets decrypt correctly under the daemon process. If direct decryption does not work under `ELECTRON_RUN_AS_NODE`, the fallback is not to reintroduce an in-process proxy; instead, the main process should provide a daemon control request that sends the daemon a fresh provider snapshot containing decrypted secrets over a local authenticated control channel.

## Open Questions

There are no product questions currently blocking the plan. The user explicitly chose the full daemon migration rather than incremental hardening. Implementation may discover a technical question about encrypted secret access from the daemon process; if so, record the observation in `Surprises & Discoveries`, record the selected answer in `Decision Log`, and update `Plan of Work` before continuing.

## Progress

- [x] (2026-04-27 15:12 local) Reviewed repository and desktop instructions, including the requirement to use tRPC for renderer-to-main communication.
- [x] (2026-04-27 15:12 local) Inspected the current model proxy service, routers, storage, main startup wiring, terminal-host daemon pattern, host-service manifest pattern, and Electron Vite entrypoints.
- [x] (2026-04-27 15:12 local) Created this ExecPlan under `apps/desktop/plans/` for a one-step migration to a terminal-host-like model proxy daemon.
- [x] (2026-04-27) Implement daemon shared protocol, manifest helpers, and lifecycle manager.
- [x] (2026-04-27) Move proxy HTTP server ownership from Electron main to the daemon entrypoint.
- [x] (2026-04-27) Update tRPC routers and main startup to use the daemon manager instead of the in-process service singleton.
- [x] (2026-04-27) Add build entrypoint and update existing tests; typecheck passes, 18 model-proxy tests pass.
- [ ] Manually verify the desktop app can configure a workspace and keep the local proxy alive or adoptable across app restarts.

## Surprises & Discoveries

- Observation: The current model proxy is an in-process HTTP server owned by Electron main, not an independent daemon.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` defines `ModelProxyService` with a `node:http.createServer` instance, and `apps/desktop/src/main/index.ts` calls `modelProxyService.start()` during desktop startup.

- Observation: The current startup path kills any process listening on the fixed proxy port before binding.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` defines `killPortHolder(PROXY_PORT)`, runs `lsof -tiTCP:${port} -sTCP:LISTEN`, and sends `SIGKILL` to every returned PID inside `ModelProxyService.start()`.

- Observation: Terminal persistence already has a real daemon pattern that runs separately from Electron main over local IPC.
  Evidence: `apps/desktop/src/main/terminal-host/index.ts` is a daemon entrypoint, `apps/desktop/src/main/lib/terminal-host/client.ts` owns spawn/connect/reconnect behavior, and `apps/desktop/HOST_SERVICE_LIFECYCLE.md` describes v1 terminals as running on a separate terminal-host daemon over a Unix domain socket.

- Observation: Host-service has a useful manifest adoption pattern for detached child processes.

- Observation: undici's `RequestInit.body` type is stricter than the DOM `RequestInit`, rejecting `null`. This caused a type error when `createProviderFetchOptions` returned `RequestInit & { dispatcher }` and was passed to `undiciFetch`. Fixed with a targeted `as any` cast at the single call site in `service.ts`.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` line 118.
  Evidence: `apps/desktop/src/main/lib/host-service-manifest.ts` writes and reads `manifest.json` with `pid`, `endpoint`, `authToken`, and `startedAt`, while `apps/desktop/src/main/lib/host-service-coordinator.ts` can adopt an already-running child after app restart.

- Observation: Any new daemon entrypoint must be added to the Electron Vite Rollup input list.
  Evidence: `apps/desktop/electron.vite.config.ts` currently lists `index`, `terminal-host`, `pty-subprocess`, `git-task-worker`, and `host-service` under `main.build.rollupOptions.input`.

## Decision Log

- Decision: Implement the model proxy as a separate local daemon process now, not as a hardened in-process server first.
  Rationale: The user explicitly rejected the incremental approach and asked to directly build it in a terminal-host-like form because the current proxy appears to hang or crash too easily.
  Date/Author: 2026-04-27 / user and planning agent.

- Decision: Keep the external proxy port fixed at `127.0.0.1:39127` for this migration.
  Rationale: Workspace settings already point Claude Code at this local endpoint. A stable port minimizes user-visible churn and avoids requiring every workspace settings file to be rewritten after daemonization.
  Date/Author: 2026-04-27 / planning agent.

- Decision: Remove broad `killPortHolder()` behavior and only terminate processes that Superset can identify as its own model-proxy daemon.
  Rationale: Killing any process on the fixed port is unsafe. A daemon manager should use a manifest, PID file, token, and health endpoint to distinguish a Superset-owned daemon from an unrelated local listener.
  Date/Author: 2026-04-27 / planning agent.

- Decision: Keep renderer-to-main API shape stable by preserving the existing tRPC routers and replacing their backend implementation.
  Rationale: `apps/desktop/AGENTS.md` requires tRPC for Electron interprocess communication, and the Settings/Models UI already depends on `modelProviders`, `modelProxy`, and `workspaceModelSettings` procedures.
  Date/Author: 2026-04-27 / planning agent.

## Outcomes & Retrospective

### Implementation complete (code-level validation)

The local model proxy is now a separate daemon process (`apps/desktop/src/main/model-proxy/index.ts`) that owns the HTTP listener on `127.0.0.1:39127`. Electron main manages lifecycle through `ModelProxyDaemonManager` (`apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`), which uses manifest adoption, health polling, spawn locks, and safe restarts.

Validation results:
- `bun run typecheck` inside `apps/desktop`: passed.
- 18 targeted model-proxy tests: passed (service, aggregation, workspace-settings, storage).
- `killPortHolder()` removed; restart only terminates known manifest PIDs.
- tRPC router API preserved; renderer UI calls unchanged.

Remaining: manual desktop app verification with daemon startup, workspace model save, and app restart adoption.

## Context and Orientation

This repository is a Bun and Turborepo monorepo. The affected app is `apps/desktop`, the Electron desktop application. Electron has a main process, which can use Node.js modules and spawn child processes, and a renderer process, which is the browser-like React UI. In this project, renderer-to-main calls use tRPC routers under `apps/desktop/src/lib/trpc`; tRPC is a type-safe request layer where renderer code calls named procedures such as `electronTrpc.modelProxy.status.useQuery()` instead of using untyped Electron IPC channels.

The current local model proxy lets Claude Code talk to model providers through an Anthropic-compatible local API. The local proxy exposes `GET /v1/models` and `POST /v1/messages` on `127.0.0.1:39127`. Workspaces are configured by writing `.claude/settings.local.json` with environment variables including `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and `ANTHROPIC_DEFAULT_OPUS_MODEL`. Claude Code reads that local settings file when a workspace terminal session starts.

The current proxy implementation lives in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. `ModelProxyService` owns a `node:http` server inside Electron main, stores the fixed token `superset-local-model-proxy`, reports status through `status()`, and forwards model requests to Anthropic or OpenAI providers. The same file also contains provider test and model-fetch helpers used by provider management UI. The router file `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` exposes provider CRUD as `modelProviders`, proxy status and restart as `modelProxy`, and workspace settings read/write as `workspaceModelSettings`.

Provider storage lives in `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`. It stores provider records under `SUPERSET_HOME_DIR/model-proxy/providers.json`, uses file mode `0600`, and encrypts secrets with helpers from `apps/desktop/src/lib/trpc/routers/auth/utils/crypto-storage.ts`. `listStoredProviders()` returns redacted providers for UI. `listProvidersForProxy()` returns providers with decrypted secrets for proxy routing.

Terminal-host is the closest existing daemon pattern. `apps/desktop/src/main/terminal-host/index.ts` is a separate process entrypoint. `apps/desktop/src/main/lib/terminal-host/client.ts` is the main-process client that spawns the daemon, uses local files under the Superset home directory for socket/token/PID/lock state, connects over a Unix domain socket, authenticates, detects stale daemon builds in development, and reconnects when necessary. `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts` wraps the raw client so the rest of the terminal subsystem does not talk directly to the daemon transport.

Host-service is another useful child-process pattern. `apps/desktop/src/main/host-service/index.ts` starts a local HTTP service and writes a manifest. `apps/desktop/src/main/lib/host-service-manifest.ts` persists process identity and connection data. `apps/desktop/src/main/lib/host-service-coordinator.ts` can adopt an existing service after app restart and can poll health before reporting success. The model proxy daemon should combine these ideas: terminal-host-like dedicated daemon ownership with host-service-like manifest and HTTP health checks.

Build configuration is in `apps/desktop/electron.vite.config.ts`. Its `main.build.rollupOptions.input` object lists every Electron main entrypoint that should be compiled into `dist/main`. A new daemon entrypoint must be added there, otherwise it will not exist in development or packaged builds.

## Plan of Work

First, separate proxy domain logic from Electron-main ownership. Keep `apps/desktop/src/lib/trpc/routers/model-proxy/aggregation.ts`, provider storage, and protocol translation behavior reusable, but stop treating `ModelProxyService` as the owner of the long-lived HTTP listener. Create a small daemon-owned server module under `apps/desktop/src/main/model-proxy/`, for example `apps/desktop/src/main/model-proxy/server.ts`, that exposes a class such as `ModelProxyDaemonServer`. This class should bind only to `127.0.0.1:39127`, implement `GET /health`, `GET /v1/models`, and `POST /v1/messages`, and reuse the existing provider routing behavior. `GET /health` should return a JSON object with fields like `ok`, `pid`, `startedAt`, `port`, `protocolVersion`, and `aggregatedModelCount`, and it should require a daemon control token in an `authorization: bearer <token>` header or another explicit control header. Public model endpoints should continue accepting the workspace local token in `authorization` or `x-api-key`, preserving current Claude Code compatibility.

Next, create daemon protocol and manifest helpers under `apps/desktop/src/main/lib/model-proxy-daemon/`. Add `types.ts` with constants such as `MODEL_PROXY_PROTOCOL_VERSION`, `MODEL_PROXY_HOST`, `MODEL_PROXY_PORT`, and `MODEL_PROXY_WORKSPACE_TOKEN`. Define shared TypeScript interfaces for `ModelProxyDaemonManifest`, `ModelProxyDaemonHealth`, and manager status. Add `manifest.ts` that writes, reads, lists if needed, and removes a manifest at `SUPERSET_HOME_DIR/model-proxy/daemon-manifest.json` with file mode `0600`. The manifest should include `pid`, `endpoint`, `controlToken`, `workspaceToken`, `startedAt`, and `protocolVersion`. Add an `isProcessAlive(pid: number): boolean` helper or reuse an existing equivalent if importing it does not create an awkward host-service dependency.

Then add the daemon entrypoint `apps/desktop/src/main/model-proxy/index.ts`. It should run as a Node-style Electron child with `ELECTRON_RUN_AS_NODE=1`. On startup it should ensure the `SUPERSET_HOME_DIR/model-proxy` directory exists with private permissions, create or read a control token, start `ModelProxyDaemonServer`, write the manifest after the HTTP listener is actually bound, log startup details, and install `SIGTERM` and `SIGINT` handlers that close the HTTP server and remove the manifest if the manifest PID matches the current process. It must not import renderer code. It may import main-safe modules, model-proxy storage, and shared model-proxy types.

After the daemon exists, implement `apps/desktop/src/main/lib/model-proxy-daemon/client.ts` or `manager.ts`. This main-process manager should be the only object used by tRPC routers and `apps/desktop/src/main/index.ts` to control the proxy. It should provide methods with this shape: `start(): Promise<ModelProxyStatus>`, `restart(): Promise<ModelProxyStatus>`, `status(): Promise<ModelProxyStatus>`, `ensureRunning(): Promise<ModelProxyStatus>`, `getBaseUrl(): Promise<string | null>`, and `getWorkspaceToken(): string`. It should deduplicate concurrent starts with an in-memory promise. It should read the manifest and, if the manifest process is alive and `GET /health` succeeds with the manifest control token and matching protocol version, adopt that daemon rather than spawning a duplicate. If the fixed port is occupied by a non-Superset process or an unhealthy process not matching the manifest, it should return a status with `running: false` and a clear `lastError` instead of killing the listener.

The manager should spawn the daemon using the terminal-host style. In development and packaged builds it should resolve the daemon script path from the compiled main output as `dist/main/model-proxy.js`, using the same path-resolution ideas as `TerminalHostClient.getDaemonScriptPath()`. It should call `spawn(process.execPath, [daemonScript], { detached: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } })`, write stdout and stderr to a rotating log under `SUPERSET_HOME_DIR/model-proxy/daemon.log` in packaged builds, and avoid leaving zombie children by calling `child.unref()` for detached children. It should use a spawn lock file, modeled on `terminal-host.spawn.lock`, so two concurrent status/save calls cannot spawn two daemons. In development, it should detect stale compiled daemon scripts or rely on Electron Vite watch output; if it cannot safely detect staleness, it should at least restart a known daemon when `restart()` is called.

Update `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` to use the new daemon manager for `modelProxy.status`, `modelProxy.restart`, and `workspaceModelSettings.save`. Provider CRUD, provider testing, and provider model fetching can remain in the existing router path, but they must no longer import a singleton that starts an in-process HTTP server. If helper functions currently live in `service.ts`, split that file so provider test/fetch helpers remain main-process utilities while HTTP server ownership moves to daemon code. The router save flow should call `modelProxyDaemonManager.ensureRunning()`, get `baseUrl` and `workspaceToken`, and pass them to `saveProjectModelSettings()` exactly as the current code does with `modelProxyService.getToken()`.

Update `apps/desktop/src/main/index.ts` to replace `modelProxyService.start()` with `modelProxyDaemonManager.start()` or a named `prewarmModelProxyDaemon()` wrapper. Keep the existing behavior of auto-starting the proxy with the desktop app. If startup fails because the port is occupied or the daemon script is unavailable, log the error and let the app continue, matching current startup resilience, but surface the error through `modelProxy.status` so Settings > Models can explain the problem.

Update `apps/desktop/electron.vite.config.ts` to add the new daemon entrypoint to `main.build.rollupOptions.input`:

    "model-proxy": resolve("src/main/model-proxy/index.ts")

Do not add new package managers or external process supervisors. Use Node.js, Electron's existing build, and local files under `SUPERSET_HOME_DIR/model-proxy`.

Finally, delete or retire in-process server behavior. `ModelProxyService.start()` should not remain as a fallback path. If a compatibility type is useful for tests, it can be renamed to clarify that it is daemon-side server logic, but the Electron main process must not own the HTTP listener after this migration. Remove `killPortHolder()` entirely unless it is replaced with a function that only terminates the PID from a valid Superset-owned daemon manifest during explicit `restart()`.

## Concrete Steps

Start from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Inspect the current implementation and daemon patterns before editing:

    apps/desktop/src/lib/trpc/routers/model-proxy/service.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/index.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/aggregation.ts
    apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.ts
    apps/desktop/src/shared/model-proxy.ts
    apps/desktop/src/main/index.ts
    apps/desktop/src/main/terminal-host/index.ts
    apps/desktop/src/main/lib/terminal-host/client.ts
    apps/desktop/src/main/lib/terminal-host/types.ts
    apps/desktop/src/main/lib/host-service-manifest.ts
    apps/desktop/src/main/lib/host-service-utils.ts
    apps/desktop/electron.vite.config.ts

Create the daemon support files:

    apps/desktop/src/main/lib/model-proxy-daemon/types.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manifest.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manager.ts
    apps/desktop/src/main/model-proxy/server.ts
    apps/desktop/src/main/model-proxy/index.ts

Refactor the existing service file. Move HTTP listener code into `apps/desktop/src/main/model-proxy/server.ts`. Keep provider testing and model fetching available to `createModelProvidersRouter()` either by leaving them in a renamed utility file under `apps/desktop/src/lib/trpc/routers/model-proxy/` or by moving them to a main-safe utility module. The implementation must preserve Anthropic forwarding, OpenAI translation, aggregated model listing, provider-specific `proxyUrl` support through `ProxyAgent`, and current response shapes.

Update router wiring. In `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`, replace imports of `modelProxyService` with imports from the daemon manager. Make `status`, `restart`, and workspace settings `save` call the daemon manager. Verify that renderer imports do not pull Node-only daemon code into the browser bundle; renderer should only import tRPC hooks and shared types.

Update startup. In `apps/desktop/src/main/index.ts`, replace the current `modelProxyService.start()` call with the daemon manager's start/prewarm call and keep the catch-and-log behavior.

Update build config. In `apps/desktop/electron.vite.config.ts`, add the `model-proxy` Rollup input next to `terminal-host` and `host-service`.

Run targeted tests during implementation:

    bun test apps/desktop/src/lib/trpc/routers/model-proxy/aggregation.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts
    # Expected: all existing model-proxy tests pass

Add new tests for the daemon manager and daemon server. Place them near the new files, for example:

    apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts
    apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts
    apps/desktop/src/main/model-proxy/server.test.ts

The tests should cover manifest read/write validation, status when no daemon is running, adoption of a healthy manifest, concurrent start deduplication, explicit restart only terminating a known manifest PID, rejection of unauthorized health requests, and no attempt to kill an unrelated process on `39127`.

Run validation commands:

    cd apps/desktop
    bun run typecheck
    # Expected: no TypeScript errors

    cd /Users/biangwua/Documents/biang/小玩意/superset
    bun run lint
    # Expected: no lint errors from changed files; if unrelated repository lint failures appear, record the exact failure in Outcomes & Retrospective.

    bun test apps/desktop/src/main/lib/model-proxy-daemon/manifest.test.ts apps/desktop/src/main/lib/model-proxy-daemon/manager.test.ts apps/desktop/src/main/model-proxy/server.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/aggregation.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts
    # Expected: all targeted tests pass.

For manual desktop verification on Apple Silicon, use the known arm64 startup flow rather than a generic `bun dev` if native module architecture issues appear. The expected manual flow is to start the desktop app, open Settings > Models, verify proxy status shows running with `http://127.0.0.1:39127`, save a workspace Models configuration, and verify `.claude/settings.local.json` contains the stable base URL and local token. Then restart the desktop app and verify Settings > Models either adopts the already-running daemon or starts a new daemon without requiring manual port cleanup.

## Validation and Acceptance

The first acceptance criterion is lifecycle separation. After the desktop app starts, there should be a separate model proxy daemon process whose PID differs from the Electron main process PID. The daemon should own the `127.0.0.1:39127` listener. Electron main should report status by health-checking or adopting the daemon, not by inspecting an in-process `server.listening` value.

The second acceptance criterion is API compatibility. With the daemon running, a request to `GET /v1/models` using the workspace token should return the same Anthropic-compatible model list shape as before:

    curl -H "x-api-key: superset-local-model-proxy" http://127.0.0.1:39127/v1/models
    # Expected: JSON object with a data array of model objects.

If no providers are configured, the data array may be empty, but the request should still be authorized and well-formed.

The third acceptance criterion is safe port behavior. If an unrelated process is already listening on `127.0.0.1:39127`, starting or restarting the model proxy must not send `SIGKILL` to that process. The status should show `running: false` or a degraded state with a clear `lastError` explaining the port conflict. Explicit restart may terminate only a known Superset daemon PID from a valid manifest.

The fourth acceptance criterion is workspace compatibility. Saving from the workspace Models tab should still create or update `.claude/settings.local.json` with the same required environment keys as before, including `ANTHROPIC_BASE_URL=http://127.0.0.1:39127` and `ANTHROPIC_AUTH_TOKEN=superset-local-model-proxy`, unless a future implementation deliberately rotates the workspace token and updates this plan first.

The fifth acceptance criterion is restart and adoption. Start the desktop app, confirm the daemon is running, quit or restart the desktop app, and start it again. The app should either adopt the existing daemon by reading its manifest and successful health response or start a replacement daemon if the old one is gone. The user should not need to delete sockets, lock files, manifests, or port holders manually.

The sixth acceptance criterion is validation. `bun run typecheck` inside `apps/desktop` should pass. Targeted daemon and model proxy tests should pass. `bun run lint` from the repository root should pass for changed files, or any unrelated pre-existing lint failure should be recorded with evidence.

## Idempotence and Recovery

The implementation must be safe to run repeatedly. Calling `modelProxyDaemonManager.start()` multiple times should return the same running daemon status and should not spawn multiple daemons. Concurrent calls from startup, Settings > Models, and workspace settings save should be deduplicated by an in-memory start promise and a filesystem spawn lock.

If a manifest exists but the process is dead, the manager should remove or replace that manifest and spawn a new daemon. If the process is alive but health authentication fails, the manager should not assume ownership. If a lock file exists but is older than the spawn lock timeout, the manager may remove that stale lock and retry. If provider storage is missing, the daemon should treat the provider list as empty, matching current storage behavior.

Rollback during development is a code revert. There should be no database migrations and no production database interaction. Runtime artifacts live under `SUPERSET_HOME_DIR/model-proxy`, such as `providers.json`, `daemon-manifest.json`, token files, lock files, and logs. The implementation should never delete `providers.json` as part of daemon restart or recovery.

## Artifacts and Notes

The current in-process startup code to replace is:

    await modelProxyService.start().catch((error) => {
      console.error("[main] Failed to start model proxy:", error);
    });

The new startup code should have the same resilience shape but call the daemon manager:

    await modelProxyDaemonManager.start().catch((error) => {
      console.error("[main] Failed to start model proxy daemon:", error);
    });

The new manifest should be private and minimal. A representative manifest looks like this:

    {
      "pid": 12345,
      "endpoint": "http://127.0.0.1:39127",
      "controlToken": "generated-control-token",
      "workspaceToken": "superset-local-model-proxy",
      "startedAt": 1777293120000,
      "protocolVersion": 1
    }

Do not store upstream provider API keys in the daemon manifest. Provider secrets remain in `providers.json` using the existing encrypted storage behavior.

## Interfaces and Dependencies

Use only existing runtime dependencies unless a missing dependency is discovered and recorded. The daemon can use Node.js built-ins such as `node:http`, `node:fs`, `node:path`, `node:child_process`, and `node:crypto`. It can continue using `undici.ProxyAgent` because current provider forwarding already uses it.

The shared daemon constants and types in `apps/desktop/src/main/lib/model-proxy-daemon/types.ts` should include at least:

    export const MODEL_PROXY_PROTOCOL_VERSION = 1;
    export const MODEL_PROXY_HOST = "127.0.0.1";
    export const MODEL_PROXY_PORT = 39127;
    export const MODEL_PROXY_WORKSPACE_TOKEN = "superset-local-model-proxy";

    export interface ModelProxyDaemonManifest {
      pid: number;
      endpoint: string;
      controlToken: string;
      workspaceToken: string;
      startedAt: number;
      protocolVersion: number;
    }

    export interface ModelProxyDaemonHealth {
      ok: true;
      pid: number;
      startedAt: number;
      port: number;
      protocolVersion: number;
      aggregatedModelCount: number;
    }

The main-process manager should expose a singleton from `apps/desktop/src/main/lib/model-proxy-daemon/manager.ts`, for example:

    export class ModelProxyDaemonManager {
      start(): Promise<ModelProxyStatus>;
      ensureRunning(): Promise<ModelProxyStatus>;
      restart(): Promise<ModelProxyStatus>;
      status(): Promise<ModelProxyStatus>;
      getBaseUrl(): Promise<string | null>;
      getWorkspaceToken(): string;
    }

    export const modelProxyDaemonManager = new ModelProxyDaemonManager();

`ModelProxyStatus` already exists in `apps/desktop/src/shared/model-proxy.ts`. Extend it only if the UI or tests need more detail, such as a `pid` or `daemon: true` field. Preserve existing fields `running`, `baseUrl`, `port`, `tokenConfigured`, `enabledProviderCount`, `aggregatedModelCount`, and `lastError` so existing renderer code remains compatible.

The daemon HTTP server should expose:

    GET /health
    GET /v1/models
    POST /v1/messages

`GET /health` is for Electron main control and should require the manifest control token. `GET /v1/models` and `POST /v1/messages` are for Claude Code clients and should require the workspace token in the same way the current service accepts `authorization` bearer or `x-api-key`.

## Revision Notes

2026-04-27: Created this plan because the user asked to move directly to a terminal-host-like daemon instead of incrementally hardening the in-process local model proxy. The plan deliberately preserves the existing workspace-facing URL and token while changing process ownership, lifecycle, and safety behavior.
