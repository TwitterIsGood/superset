# Use a Fixed API Key for the Local Model Proxy

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows repository conventions from `AGENTS.md` and desktop-specific conventions from `apps/desktop/AGENTS.md`. The desktop app uses Electron. Electron has a main process, which can use Node.js APIs, and a renderer process, which runs browser UI code. This repository routes desktop UI-to-main-process calls through tRPC in `apps/desktop/src/lib/trpc`; do not add a new raw IPC channel for this change.

## Purpose / Big Picture

The desktop app has a local Anthropic-compatible model proxy that listens only on `127.0.0.1`. Claude Code workspaces use this local proxy through environment variables written into each workspace's `.claude/settings.local.json`. Today the proxy API key is generated randomly when the Electron main process starts, so restarting the app can leave previously written workspace settings with an outdated key until model settings are saved again.

After this change, the local proxy API key will be a fixed, deterministic value owned by the app. A user can restart Superset Desktop and keep using the same saved workspace `.claude/settings.local.json` without needing to re-save model configuration just to refresh the proxy key. The existing right sidebar Model Configuration save flow already writes the current API key into every workspace root for the project, so that flow should be preserved rather than reworked.

## Assumptions

The fixed key is acceptable because the proxy binds to `127.0.0.1`, which means it accepts connections only from the local machine. The key is still useful as a guardrail so accidental unauthenticated calls fail, but it is not being treated as a high-entropy secret after this change.

The fixed key should be a clear app-owned string, for example `superset-local-model-proxy`, rather than a random value or a user-editable setting. This keeps behavior predictable and avoids adding storage, migrations, or UI.

The user request refers to the workspace right sidebar's `Model Configuration` panel and its `Save settings` button, implemented in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`. The global Settings page at `Settings > Models`, implemented in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`, manages provider configuration and proxy restart, but it does not contain the workspace model mapping save button.

## Open Questions

There are no blocking open questions. If implementation reveals that the fixed key string needs a different exact value for product copy or compatibility, record that in the Decision Log and update the Plan of Work before changing code.

## Progress

- [x] (2026-04-26 17:55 local) Reviewed the current local proxy token implementation in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`.
- [x] (2026-04-26 17:55 local) Reviewed the tRPC save flow in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`.
- [x] (2026-04-26 17:55 local) Reviewed the workspace settings writer in `apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.ts`.
- [x] (2026-04-26 17:55 local) Reviewed the right sidebar Model Configuration UI in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`.
- [x] (2026-04-26 17:55 local) Reviewed the global Settings > Models UI in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`.
- [x] Replace the per-process random proxy token with a fixed app-owned constant.
- [x] Remove the now-unused `node:crypto` import from the proxy service.
- [x] Add or update tests that prove the fixed proxy token is returned without binding the proxy port.
- [x] Run focused tests for model proxy settings.
- [x] Run desktop validation commands: typecheck, lint, and Node import check.
- [ ] Manually verify the desktop UI flow if the dev environment is available.

## Surprises & Discoveries

- Observation: `ModelProxyService.restart()` stops and starts the HTTP server but does not regenerate the token.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` has `restart()` call `stop()` and `start()`, while the token is initialized only once as a class field.

- Observation: The existing right sidebar `Model Configuration` save button already causes the proxy token to be written to `.claude/settings.local.json` for all workspace roots in the same project.
  Evidence: `ModelsPanel.tsx` calls `electronTrpc.workspaceModelSettings.save.useMutation()`. The router in `model-proxy/index.ts` injects `modelProxyService.getToken()` and calls `saveProjectModelSettings()`. `saveProjectModelSettings()` writes `ANTHROPIC_AUTH_TOKEN` for all roots returned by `getProjectWorkspaceRoots()`.

- Observation: The global `Settings > Models` page has provider add/edit/delete and proxy restart actions, but it does not save workspace model mappings.
  Evidence: `ModelsSettings.tsx` uses `modelProviders.*` mutations and `modelProxy.restart`, but there is no `workspaceModelSettings.save` call in that file.

- Observation: A focused `service.test.ts` already existed for `createProviderFetchOptions`, so the fixed-key assertion could be added there without creating a new test file or starting the proxy server.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts` now instantiates `ModelProxyService` and asserts `getToken()` returns `superset-local-model-proxy`.

- Observation: Repository-level `typecheck` and `lint` currently fail on pre-existing desktop renderer layout/formatting issues outside this model proxy change.
  Evidence: `bun run typecheck` reports `LayoutNode`/`MosaicNode<string>` errors in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx` and `apps/desktop/src/renderer/stores/tabs/store.ts`; `bun run lint` reports formatting issues in terminal/tabs/auto-update files unrelated to the changed model proxy files.

- Observation: The desktop package has no `lint:check-node-imports` script at this checkout.
  Evidence: `bun run --cwd apps/desktop lint:check-node-imports` exits with `Script not found "lint:check-node-imports"`; `apps/desktop/package.json` lists scripts such as `typecheck` and `test`, but not `lint:check-node-imports`.

## Decision Log

- Decision: Use a fixed local proxy API key instead of generating one with `randomBytes(24)` at Electron main-process startup.
  Rationale: The proxy is a local service bound to `127.0.0.1`, and a fixed key prevents stale workspace settings after app restarts.
  Date/Author: 2026-04-26 / Claude Code.

- Decision: Keep the existing right sidebar Model Configuration save flow unchanged unless implementation shows a concrete defect.
  Rationale: The flow already writes `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and selected model mappings into `.claude/settings.local.json` for all active workspace roots in the project.
  Date/Author: 2026-04-26 / Claude Code.

- Decision: Do not add a new user-facing API key setting.
  Rationale: The requested behavior is a fixed local service key, not a configurable provider secret. Adding UI would increase complexity and create a false impression that this key is equivalent to upstream provider API keys.
  Date/Author: 2026-04-26 / Claude Code.

## Outcomes & Retrospective

Implemented the fixed local proxy API key by changing `ModelProxyService` to initialize its token from `LOCAL_PROXY_API_KEY = "superset-local-model-proxy"` and removing the prior `randomBytes(24)` per-process token generation. `getToken()`, `isAuthorized()`, `status()`, and the tRPC workspace save flow shape remain intact, so the existing right sidebar Model Configuration save flow continues to write the current token through `saveProjectModelSettings()` without renderer or UI changes.

Focused validation passed: `bun test apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts` and `bun test apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts` both pass. Repository-level validation was attempted: `bun run typecheck` fails on existing desktop renderer `LayoutNode`/`MosaicNode<string>` type errors outside the model proxy files, and `bun run lint` fails on existing formatting issues outside the model proxy files. The planned Node import check could not be run because `apps/desktop/package.json` does not define `lint:check-node-imports` in this checkout. Manual desktop UI verification was not performed in this non-interactive implementation pass.

## Context and Orientation

This change affects only the desktop app at `apps/desktop`. It does not require database schema changes, shared package changes, web app changes, marketing changes, or mobile changes.

The local model proxy is an HTTP server created in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. It binds to host `127.0.0.1` and port `39127`. The proxy accepts Anthropic-compatible requests such as `GET /v1/models` and `POST /v1/messages`, then forwards them to configured model providers. A provider is an upstream model API configuration, such as an Anthropic-compatible or OpenAI-compatible endpoint. Provider secrets are separate from this plan and are stored by `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`; do not change provider secret storage for this work.

The current proxy auth token is stored as a private field on `ModelProxyService` in `service.ts`:

    private token = randomBytes(24).toString("hex");

The service checks incoming requests in `isAuthorized()`. It accepts the token through either an `Authorization: Bearer <token>` header or an `x-api-key: <token>` header:

    return auth === this.token || anthropicKey === this.token;

The token is exposed inside the main process through `getToken()`. The renderer process does not receive or generate the token directly.

The tRPC router in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` defines `workspaceModelSettings.save`. A tRPC procedure is a typed function exposed from the Electron main process to the renderer UI. The `save` procedure accepts `workspaceId`, `haikuModel`, `sonnetModel`, and `opusModel`. It ensures the proxy is running, gets the proxy base URL, calls `modelProxyService.getToken()`, and passes the token into `saveProjectModelSettings()`.

The file `apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.ts` writes workspace model settings. `saveProjectModelSettings()` finds every active workspace root for the same project and writes a `.claude/settings.local.json` file under each root. The environment variables it writes include:

    ANTHROPIC_AUTH_TOKEN
    ANTHROPIC_BASE_URL
    API_TIMEOUT_MS
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    ANTHROPIC_DEFAULT_HAIKU_MODEL
    ANTHROPIC_DEFAULT_SONNET_MODEL
    ANTHROPIC_DEFAULT_OPUS_MODEL

The right sidebar model mapping UI lives at `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`. Its `Save settings` button calls `workspaceModelSettings.save`. This is the existing flow that already propagates the proxy key into workspace settings.

The global Settings page for model providers lives at `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It manages providers and the local proxy restart button. It does not save workspace model mappings and should not be changed for this request unless later requirements explicitly ask provider edits to rewrite workspace `.claude/settings.local.json`.

## Plan of Work

First, update `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. Remove the `randomBytes` import from `node:crypto`. Add a file-level constant near `HOST` and `PROXY_PORT`:

    const LOCAL_PROXY_API_KEY = "superset-local-model-proxy";

Then change the `ModelProxyService` token field from a random initializer to the fixed constant:

    private token = LOCAL_PROXY_API_KEY;

Keep `getToken()` unchanged so all existing callers continue to use the same method. Keep `isAuthorized()` unchanged so both `Authorization` and `x-api-key` headers still work. Keep `status()` unchanged so `tokenConfigured` remains true when the fixed key is non-empty.

Second, leave `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` behavior intact. The existing `workspaceModelSettings.save` mutation already injects `modelProxyService.getToken()` and writes the token through `saveProjectModelSettings()`. No renderer changes are needed for the right sidebar save flow because the renderer should not know or pass the token.

Third, leave `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx` behavior intact unless testing shows the save button does not call the mutation. The code already calls `saveMutation.mutateAsync({ workspaceId, haikuModel, sonnetModel, opusModel })`, invalidates the read query, and shows `Model settings saved` on success.

Fourth, consider adding a focused test around the fixed key only if it can be done without brittle network behavior. The most direct low-risk test is to export the fixed key constant from `service.ts` only if needed by tests; however, avoid exporting production internals just for tests unless the repository already follows that pattern. If not exporting the constant, rely on a direct `new ModelProxyService().getToken()` assertion in a new or existing test file, such as `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts`, expecting `superset-local-model-proxy`. Do not start the HTTP server in this unit test.

Fifth, keep the existing `workspace-settings.test.ts` tests. They already verify that `saveProjectModelSettings()` writes whatever token is passed to `ANTHROPIC_AUTH_TOKEN` for all workspace roots. Because the router is the layer that passes `modelProxyService.getToken()` into that function, this existing test is enough to prove the writer works. If adding a router-level test is significantly more setup than value, document that the writer and service tests cover the behavior separately.

## Concrete Steps

Work from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Edit `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` as described above.

If adding a focused service test, create `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts` with a Bun test that imports `ModelProxyService`, creates a new instance, and asserts that `getToken()` returns `superset-local-model-proxy`. The test must not call `start()` because that would bind a real port and could interact with local app state.

Run the focused model proxy tests:

    bun test apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts
    # Expected: all workspace settings tests pass.

If a service test was added, run it too:

    bun test apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts
    # Expected: the fixed token assertion passes.

Run desktop validation commands from `apps/desktop` or from the repository root if the package scripts are root-oriented. Prefer the existing package scripts over ad-hoc commands:

    bun run typecheck
    # Expected: no TypeScript errors.

    bun run lint
    # Expected: no Biome lint errors.

For desktop Node import safety, run the desktop-specific command if available:

    cd apps/desktop
    bun run lint:check-node-imports
    # Expected: no renderer Node.js import violations.

## Validation and Acceptance

The main acceptance behavior is that the proxy token is stable across app restarts. A human can verify this without exposing any secret UI.

Start the desktop app using the existing desktop development flow. On Apple Silicon, avoid a generic `bun dev` if it triggers native module architecture issues; use the known arm64-safe startup flow for this project if needed. Open a workspace, open the right sidebar Model Configuration panel, choose model mappings, and click `Save settings`. Then inspect that workspace's `.claude/settings.local.json`. It should contain:

    "ANTHROPIC_AUTH_TOKEN": "superset-local-model-proxy"
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:39127"

Quit and restart Superset Desktop. Without changing model mappings, confirm the local proxy still uses the same key by saving again or by making a local Anthropic-compatible request using `x-api-key: superset-local-model-proxy` against `http://127.0.0.1:39127/v1/models` while the app is running. The expected result is either a model list response when providers are configured or an authorized proxy response that is not `401 Unauthorized`. A request with a different key should return `401 Unauthorized`.

Verify the existing right sidebar behavior remains unchanged. In `Model Configuration`, changing Haiku, Sonnet, or Opus enables the `Save settings` button. Clicking it shows `Model settings saved` and rewrites `.claude/settings.local.json` for every active workspace root in the project. This confirms no additional UI work is required for the user's second requirement.

## Idempotence and Recovery

This change is safe to apply repeatedly because it replaces a random class-field initializer with a fixed constant. Re-running tests or saving model settings repeatedly will write the same `ANTHROPIC_AUTH_TOKEN` value into `.claude/settings.local.json`.

If validation fails because an existing `.claude/settings.local.json` still contains an old random token, use the right sidebar Model Configuration `Save settings` button once. That existing action rewrites the token and model mapping for all active workspace roots in the current project.

If the fixed token must be renamed later, change only the `LOCAL_PROXY_API_KEY` constant in `service.ts`, then use the same right sidebar save flow to update workspace settings. Do not manually edit generated or unrelated files.

## Artifacts and Notes

Current random-token implementation found during discovery:

    import { randomBytes } from "node:crypto";
    private token = randomBytes(24).toString("hex");

Target fixed-token implementation:

    const LOCAL_PROXY_API_KEY = "superset-local-model-proxy";

    export class ModelProxyService {
      private token = LOCAL_PROXY_API_KEY;
      ...
    }

Existing save propagation chain found during discovery:

    ModelsPanel Save settings button
      -> electronTrpc.workspaceModelSettings.save.useMutation()
      -> createWorkspaceModelSettingsRouter().save
      -> modelProxyService.getToken()
      -> saveProjectModelSettings()
      -> each project workspace root's .claude/settings.local.json

## Interfaces and Dependencies

The implementation uses only existing Node.js, Electron, and tRPC infrastructure. No new package dependency is required.

At completion, `ModelProxyService` in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` must still expose this method:

    getToken(): string

The method must return the fixed local proxy key. The router in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` must continue to call this method rather than duplicating the key string.

No new IPC channel should be added. Desktop UI-to-main-process communication must continue to use the tRPC routers under `apps/desktop/src/lib/trpc`.

## Initial Plan Note

This plan was created on 2026-04-26 to address the request to make the local model proxy API key fixed and to confirm whether the existing right sidebar Model Configuration save flow already updates the key in workspace settings. Discovery confirmed that the save flow already rewrites the token through `workspaceModelSettings.save`, so the implementation should focus on changing token generation only.
