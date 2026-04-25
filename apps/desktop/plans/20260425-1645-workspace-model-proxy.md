# Add workspace model switching and a local provider proxy

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, Electron interprocess communication must use tRPC from `apps/desktop/src/lib/trpc`, and desktop startup validation on Apple Silicon should use the known arm64 Node flow rather than a generic desktop command.

## Purpose / Big Picture

After this change, the desktop app can manage a user-defined list of model providers, run a local Anthropic-compatible proxy, and let each workspace choose which models Claude Code should use for Haiku, Sonnet, and Opus. A user will add only the providers they want in Settings > Models, test or fetch models from those providers, and then open a workspace right sidebar Models tab to write that workspace's `.claude/settings.local.json` safely.

This matters because each workspace can point Claude Code at the same local proxy while still choosing different model names. The proxy hides provider protocol differences: providers may speak Anthropic or OpenAI protocol, but the workspace receives an Anthropic-style `ANTHROPIC_BASE_URL` and model env vars. The user-visible proof is that Settings > Models shows provider management and proxy status, and a workspace can save `.claude/settings.local.json` with `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and the three default model env vars without losing unrelated JSON content.

## Assumptions

This plan assumes the feature is desktop-scoped and should live primarily under `apps/desktop`, with supporting changes in existing packages only where current model runtime code already lives. This must be rechecked during implementation before editing shared packages.

This plan assumes the local proxy should bind only to `127.0.0.1` and should auto-start with the desktop app, because the user selected automatic startup. Binding to all interfaces is out of scope for this first version.

This plan assumes the proxy's external protocol, meaning the protocol used by Claude Code and `.claude/settings.local.json`, is Anthropic-compatible. Provider entries may use Anthropic or OpenAI protocol internally.

This plan assumes secure local storage can be implemented as an app-local JSON file with secrets encrypted if an existing desktop-safe secret helper exists, or with strict `0600` permissions if no encryption helper exists. The user specifically requested local encrypted storage or `0600`; the implementation must prefer an existing encryption/keychain helper if available and otherwise use `0600` file permissions.

This plan assumes there should be no preseeded provider catalog. The Settings UI may offer placeholders and examples, but the saved provider list starts empty and contains only providers created by the user.

## Open Questions

There are no unresolved product questions at the time this plan is written. The user already chose full first-version scope, automatic proxy startup, local secure provider storage, and a right sidebar Models tab.

Implementation discovery may reveal technical questions about the best existing storage helper or proxy lifecycle hook. If that happens, record the answer in the Decision Log and update the relevant Plan of Work section before continuing.

## Progress

- [x] (2026-04-25 16:45Z) Reviewed repository instructions and desktop-specific tRPC guidance.
- [x] (2026-04-25 16:45Z) Inspected current Settings > Models, right sidebar, sidebar state, workspace tRPC, filesystem tRPC, and local model provider runtime code during planning discovery.
- [x] (2026-04-25 16:45Z) Compared the OpenCovibe provider/proxy design for inspiration, while deciding not to copy its preseeded provider catalog.
- [x] (2026-04-25 16:45Z) Captured user decisions: implement the full feature in one plan, auto-start the proxy, store provider credentials locally with encryption or `0600`, and expose workspace switching through a right sidebar Models tab.
- [x] Implement provider types and secure local storage.
- [x] Implement local Anthropic-compatible proxy lifecycle, model aggregation, and routing.
- [x] Redesign Settings > Models around provider management and proxy status.
- [x] Add workspace Models tab and safe `.claude/settings.local.json` read/write behavior.
- [x] Wire workspace model config into terminal/session startup where needed.
- [x] Add tests and run validation commands.
- [ ] Manually verify the desktop app can start and configure a workspace without the sign-in gate.

## Surprises & Discoveries

- Observation: Current Settings > Models is organized around Anthropic/OpenAI auth status and an Anthropic env override textarea, not around a user-maintained provider list.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` queries `chatServiceTrpc.auth.getAnthropicStatus`, `getOpenAIStatus`, and `getAnthropicEnvConfig`, while `utils.ts` parses only Anthropic env text.

- Observation: The right sidebar currently has only Changes and Files tabs.
  Evidence: `apps/desktop/src/renderer/stores/sidebar-state.ts` defines `RightSidebarTab.Changes` and `RightSidebarTab.Files`, and `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx` renders Changes and Files tab buttons.

- Observation: There is already a generic filesystem tRPC router that can read and write workspace-rooted files, but this feature should still use a specialized tRPC route for `.claude/settings.local.json` because it must create directories, merge JSON, preserve unrelated keys, and overwrite specific env keys safely.
  Evidence: `apps/desktop/src/lib/trpc/routers/filesystem/index.ts` contains generic operations like `readFile`, `writeFile`, and `createDirectory`, but no domain-specific model settings merge behavior.

- Observation: Current runtime model-provider code prepares environment variables from existing Anthropic/OpenAI credential storage and Anthropic env config.
  Evidence: `packages/host-service/src/providers/model-providers/LocalModelProvider/LocalModelProvider.ts` builds `runtimeEnv` from `resolveAnthropicCredential`, `resolveOpenAICredential`, and `getAnthropicEnvConfig`.

- Observation: An AES-GCM machine-key helper already exists for desktop auth secrets, so provider secrets can be encrypted and the provider file can still be written with `0600` permissions.
  Evidence: `apps/desktop/src/lib/trpc/routers/auth/utils/crypto-storage.ts` exports `encrypt` and `decrypt`, and `apps/desktop/src/main/lib/app-environment.ts` defines `SUPERSET_SENSITIVE_FILE_MODE = 0o600`.

## Decision Log

- Decision: Implement the first version as the full provider management, proxy, Settings redesign, and workspace Models tab feature rather than a smaller slice.
  Rationale: The user selected “一次全做” when asked about first-version scope.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Auto-start the local proxy with the desktop app and expose status/restart controls in Settings > Models.
  Rationale: The user selected “自动启动”; a local proxy must be available before workspace settings can point Claude Code at it reliably.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Store provider secrets locally using encryption if an existing helper exists, otherwise store the provider file with `0600` permissions.
  Rationale: The user selected “本地加密/0600”; this balances local-only operation with concrete filesystem protection.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Add the workspace model switcher to the right sidebar as a Models tab next to Changes and Files.
  Rationale: The user selected “右栏 Models tab” and specifically described adding Models next to Changes and Files.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Do not preseed a large provider list.
  Rationale: The user liked OpenCovibe's provider maintenance UI but explicitly disliked its many preset providers and wants users to add only what they use.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: The proxy presents an Anthropic-compatible interface to workspaces even when an upstream provider uses OpenAI protocol.
  Rationale: The user said the target protocol is temporarily Anthropic protocol, and the sample workspace settings use Anthropic environment variables.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Runtime integration is implemented by writing `.claude/settings.local.json` for the active workspace and relying on Claude Code to read that local settings file on process startup; existing sessions may require restart.
  Rationale: The app already launches Claude Code in the workspace, and the requested env keys are Claude Code local settings. Duplicating the file reader in terminal environment assembly would risk diverging from Claude Code behavior.
  Date/Author: 2026-04-25 / implementation agent.

## Outcomes & Retrospective

Implemented the first version: user-managed providers are stored locally with AES-GCM encrypted secrets and `0600` file permissions; the desktop main process auto-starts a loopback Anthropic-compatible proxy; Settings > Models manages providers and proxy status; the right sidebar has a Models tab that writes `.claude/settings.local.json` with create/overwrite semantics while preserving unrelated JSON.

Validation results:

- `bun test apps/desktop/src/lib/trpc/routers/model-proxy/aggregation.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts`: passed, 6 tests / 16 assertions.
- `cd apps/desktop && bun run typecheck`: passed after route/icon generation.
- `bun run lint`: failed before linting this change because the repository contains a nested Biome root under `.claude/worktrees/agent-a3d92e7b/biome.jsonc`, and `scripts/check-git-ref-strings.sh` cannot find `rg` in PATH.

Limitations recorded for this first version: OpenAI upstream translation is non-streaming; Anthropic upstream streaming is forwarded only as the upstream response body text through Node fetch, not optimized as a first-class streaming bridge. Existing Claude Code sessions need restart to pick up newly saved workspace settings.

## Context and Orientation

This repository is a Bun and Turborepo monorepo. The affected app is `apps/desktop`, the Electron desktop application. Electron has a main process, which can use Node.js APIs such as the filesystem and local HTTP servers, and a renderer process, which is the browser-like React UI. Communication between renderer and main process must use tRPC from `apps/desktop/src/lib/trpc`; tRPC is a type-safe request layer where the renderer calls named procedures instead of using untyped Electron IPC channels.

The affected packages may include `packages/host-service` or `packages/chat` only if the existing terminal/model runtime needs to consume the new proxy environment. `packages/host-service/src/providers/model-providers/LocalModelProvider/LocalModelProvider.ts` currently builds runtime environment variables from existing Anthropic/OpenAI credentials and Anthropic env configuration. Do not create a parallel model runtime if this file is the right integration point; update the existing path so terminals and sessions receive the new local proxy settings consistently.

The current Settings > Models UI lives at `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It currently focuses on Anthropic and OpenAI auth flows plus an Anthropic env textarea. Its helper file `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.ts` parses and builds Anthropic env text. This feature replaces that page's center of gravity with a provider list and proxy controls.

The right sidebar lives at `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx`. Its selected tab state lives at `apps/desktop/src/renderer/stores/sidebar-state.ts`, where `RightSidebarTab` currently has `Changes` and `Files`. This feature adds `Models` to that enum and renders a Models tab and panel. The panel should be a separate component folder under `RightSidebar/components/ModelsPanel/` if that matches nearby component organization.

A workspace is the local project folder that the desktop app opens. Some workspaces may use a worktree path, which is a separate checkout folder managed by git. The user wants per-workspace model configuration written under the active workspace folder at `.claude/settings.local.json`. `.claude/settings.local.json` is a Claude Code local settings file. For this feature, the app writes or overwrites these env keys inside the file's top-level `env` object:

    ANTHROPIC_AUTH_TOKEN
    ANTHROPIC_BASE_URL
    API_TIMEOUT_MS
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    ANTHROPIC_DEFAULT_HAIKU_MODEL
    ANTHROPIC_DEFAULT_SONNET_MODEL
    ANTHROPIC_DEFAULT_OPUS_MODEL

The expected env values point Claude Code at the local proxy and choose three model aliases. `ANTHROPIC_BASE_URL` should be the local proxy URL, for example `http://127.0.0.1:<port>`. `ANTHROPIC_AUTH_TOKEN` should be a local token accepted by the proxy; it must not be an upstream provider API key. `API_TIMEOUT_MS` should default to `3000000` unless product code already has a stronger app-wide default. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` should be set to `1` so workspace sessions avoid unrelated Claude Code network traffic when using the proxy.

OpenCovibe was used only as design inspiration. Borrow its useful concepts: a provider list with editable name, base URL, protocol, and API key; test connectivity; fetch models; proxy endpoints; protocol translation; and load balancing when more than one provider has the same model. Do not copy its large preset provider list or duplicate provider definitions across multiple sources of truth.

## Plan of Work

First, define the provider and proxy domain model in the desktop main-side code. Add types for a provider entry with `id`, `name`, `protocol`, `baseUrl`, secret credential reference or encrypted secret, `enabled`, `models`, and timestamps. The protocol should be a string union of `anthropic` and `openai`. A model entry should include at least `id`, `displayName` if available, `providerId`, and `lastFetchedAt` when the model came from a fetch operation. Keep these types in a shared place that can be safely imported by renderer and main code, such as a file under `apps/desktop/src/shared/` or an existing tRPC shared type module. Do not use `any`; if provider APIs return loose JSON, parse and narrow it at the tRPC boundary.

Next, implement secure provider storage in the main process. Search for existing local app data helpers, secret storage helpers, or auth storage utilities before adding a new file path. If an encrypted storage helper already exists and is desktop-safe, use it. If no helper exists, store a JSON file under the desktop app's user-data directory with file permissions `0600`. The storage module must read an absent file as an empty provider list, write atomically by writing a temporary file and renaming it, and ensure permissions after every write. Secrets must never be returned to the renderer in plaintext except when the user is actively editing a newly-entered value; normal list/get responses should indicate only whether a secret exists.

Add a tRPC router under `apps/desktop/src/lib/trpc/routers/` for provider and proxy operations. Name it clearly, such as `modelProviders` or `modelProxy`, following the existing router registration pattern. Procedures should include listing providers, creating a provider, updating non-secret fields, updating a secret, deleting a provider, testing a provider, fetching models for a provider, listing aggregated models, reading proxy status, and restarting the proxy. Use tRPC because `apps/desktop/AGENTS.md` requires Electron interprocess communication through tRPC.

Implement provider test and model fetch in the main process. For Anthropic providers, test with the provider's Anthropic-style endpoint and auth header, and fetch models from the Anthropic-style models endpoint if available. For OpenAI providers, test with an OpenAI-style request and fetch models from `/v1/models`. Normalize all fetched model IDs into the shared model entry shape. If a provider does not support model listing but a test succeeds, allow manual model entries in the Settings UI so the provider remains usable.

Implement the local proxy service in the main process or in an existing desktop service layer that starts with the app. The proxy must bind to `127.0.0.1`, choose a stable local port or persist the chosen port in proxy state, and auto-start during desktop startup. It should expose at minimum an Anthropic-compatible `GET /v1/models` endpoint and `POST /v1/messages` endpoint. If the codebase already has an HTTP server utility, use it; otherwise create the smallest local HTTP server needed. The proxy must require the local `ANTHROPIC_AUTH_TOKEN` generated by the app and reject missing or invalid tokens. This token is separate from upstream provider keys and is what workspace settings write into `.claude/settings.local.json`.

Implement model aggregation and routing. The aggregated model list should combine enabled providers' model IDs. If providers A and B both expose the same model ID, the proxy should show that model once to clients and route requests for that model across the eligible providers with a simple round-robin counter. Keep the round-robin state in memory; persistent load-balancing counters are unnecessary. If an upstream provider fails, return a clear error for the first version rather than silently switching to another provider unless the request has another eligible provider for the same model and retrying is safe for the endpoint. For streaming messages, preserve streaming behavior if the upstream protocol and existing app dependencies make it practical. If streaming translation is too large, implement non-streaming first and record the limitation in Outcomes before shipping.

Implement protocol translation. For Anthropic upstream providers, forward Anthropic-compatible message requests with adjusted base URL and authorization headers. For OpenAI upstream providers, translate the Anthropic `messages` request into an OpenAI chat completions request. The initial mapping should cover the common fields needed by Claude Code: model, messages, system prompt if present, max tokens, temperature, top_p, stop sequences, and streaming flag if supported. Translate the OpenAI response back into Anthropic-style content blocks. Keep unsupported fields explicit: either pass through only when known safe or return a typed error explaining that the field is unsupported.

Redesign Settings > Models. Replace the current provider-auth-centered layout with a provider management page that starts empty. The page should show proxy status, local proxy URL, whether it is running, and a restart button. It should show a provider list where users can add, edit, delete, enable, or disable providers. The provider form should include provider name, protocol selector, base URL, secret/API key input, and model list. It should include Test and Fetch Models actions. Fetch Models should populate the provider's model list; users should also be able to add or remove model IDs manually. Do not display stored secret plaintext after save; show a placeholder such as “API key saved” and require entering a new value to replace it.

Add the right sidebar Models tab. Extend `RightSidebarTab` in `apps/desktop/src/renderer/stores/sidebar-state.ts` with `Models = "models"`. Update `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx` to render a Models tab button next to Changes and Files and show a Models panel when selected. The panel should receive the active workspace identifier or path using the same props/patterns already used by Files and Changes. Keep it inside the right sidebar rather than Settings because the choice is workspace-specific.

Implement workspace `.claude/settings.local.json` operations as a specialized tRPC API. The read procedure should resolve the active workspace root, read `.claude/settings.local.json` if present, tolerate missing `.claude`, missing file, empty file, and invalid or non-object JSON, and return a typed status that the renderer can explain to the user. The write procedure should create `.claude` if missing, create or replace an empty or invalid settings file with a valid object, preserve unrelated top-level keys, preserve unrelated `env` keys, and overwrite only the required env keys listed in Context and Orientation. If the existing file has `env` that is not an object, replace `env` with an object and record that normalization in the returned result.

Build the Models panel UI around three model selectors: Haiku, Sonnet, and Opus. Each selector should use aggregated models from the local proxy/provider router. The panel should also show the proxy URL and a short explanation that saving writes the current workspace's `.claude/settings.local.json`. When the workspace has no settings file, the panel should say it will create one. When settings exist, it should show the currently configured model names if they are present. The Save action should write all required env keys every time, even if only one model changed, because the user explicitly wants create/overwrite semantics for those keys.

Wire runtime usage. After the proxy and workspace file writer exist, update the model runtime integration so terminal/session startup can use the workspace-local `.claude/settings.local.json` values. Search for where Claude Code terminal processes are spawned and how environment variables are assembled. If Claude Code already reads `.claude/settings.local.json` itself, avoid duplicating that behavior. If the app injects model env vars directly, ensure the workspace-specific env file values take precedence over global provider credentials for that workspace. Record the exact integration point in the Decision Log.

Keep the implementation additive until the new flow works. Do not delete existing Anthropic/OpenAI auth helpers until the Settings redesign and runtime integration are verified. If old code becomes unreachable, remove it in a final cleanup step with tests passing. Do not make unrelated formatting or cleanup changes.

## Concrete Steps

Start from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Inspect the relevant files before editing:

    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx
    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.ts
    apps/desktop/src/renderer/stores/sidebar-state.ts
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx
    apps/desktop/src/lib/trpc/routers/filesystem/index.ts
    apps/desktop/src/lib/trpc/routers/workspaces/index.ts
    packages/host-service/src/providers/model-providers/LocalModelProvider/LocalModelProvider.ts

Use repository search rather than assumptions to find router registration, user-data path helpers, secret storage helpers, and terminal process environment assembly. The likely searches are for `createTRPCRouter`, `app.getPath("userData")`, `chmod`, `0600`, `ANTHROPIC_BASE_URL`, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`.

Implement the provider storage and router first. At the end of this step, Settings UI may not be redesigned yet, but a main-side tRPC route should be able to list an empty provider list, create a provider, save a secret securely, test a provider, fetch models, and report aggregated models.

Implement and auto-start the local proxy second. At the end of this step, with a provider configured through a temporary script or tRPC call, `GET /v1/models` should return a normalized model list and `POST /v1/messages` should route to the selected provider.

Implement Settings > Models third. At the end of this step, a user should be able to manage providers without editing files manually. The page should show the local proxy URL and status.

Implement the right sidebar Models tab and workspace settings writer fourth. At the end of this step, opening a workspace and saving the Models tab should create or update `.claude/settings.local.json` in that workspace while preserving unrelated JSON.

Implement runtime integration and cleanup fifth. At the end of this step, Claude Code sessions launched from a workspace should see the env values from that workspace's settings. Remove obsolete UI paths only after the new flow is verified.

Run focused tests after each milestone when available, then run full validation:

    bun run typecheck
    # Expected: no TypeScript errors.

    bun test
    # Expected: all tests pass. If unrelated existing tests fail, record exact failing tests and evidence.

    bun run lint
    # Expected: no lint errors except known unrelated local files if they remain modified outside this feature.

For manual desktop validation on Apple Silicon, use the remembered arm64 Node startup flow instead of generic `bun dev`:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run clean:dev && bun run generate:icons && bun run clean-launch-services && bun run patch-dev-protocol && npx electron-vite dev --watch -c electron.vite.config.ts'

Expected result: the Electron app opens, Settings > Models shows an empty provider list and proxy status, adding a provider works, the proxy reports models, and the workspace right sidebar Models tab can save `.claude/settings.local.json` without requiring sign-in.

## Validation and Acceptance

Provider storage acceptance: with no provider file present, listing providers returns an empty array. Creating a provider with a secret writes secure local storage and returns provider metadata without plaintext secret. File permissions must be `0600` when using file storage. Updating a provider must not lose its model list or secret unless explicitly changed. Deleting a provider removes it from aggregation.

Provider test and fetch acceptance: an Anthropic-compatible provider can be tested with its configured base URL and secret. An OpenAI-compatible provider can be tested with its configured base URL and secret. Fetch Models populates model IDs when the provider supports `/v1/models` or the equivalent endpoint. If fetching fails, the UI shows a clear error and still allows manual model entry.

Proxy acceptance: the proxy auto-starts with the desktop app, binds to `127.0.0.1`, reports status in Settings > Models, requires the local token, exposes `GET /v1/models`, and routes `POST /v1/messages` to the correct upstream provider. If two enabled providers expose the same model ID, repeated requests for that model use both providers in round-robin order. The aggregated `/v1/models` response should show duplicate model IDs only once.

Settings > Models acceptance: a fresh app install shows no preset providers. The user can add a provider, choose Anthropic or OpenAI protocol, enter base URL and secret, test the provider, fetch or manually add models, enable or disable the provider, and delete it. Saved secrets are not displayed in plaintext after save. The page shows local proxy URL and status.

Right sidebar Models acceptance: the right sidebar has a Models tab next to Changes and Files. In a workspace with no `.claude` directory, saving from Models creates `.claude/settings.local.json`. In a workspace with no settings file, saving creates the file. In a workspace with an empty settings file, saving replaces it with valid JSON. In a workspace with unrelated JSON keys, saving preserves those keys. In a workspace with unrelated `env` keys, saving preserves those env keys. In all cases, saving creates or overwrites these keys:

    ANTHROPIC_AUTH_TOKEN
    ANTHROPIC_BASE_URL
    API_TIMEOUT_MS
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    ANTHROPIC_DEFAULT_HAIKU_MODEL
    ANTHROPIC_DEFAULT_SONNET_MODEL
    ANTHROPIC_DEFAULT_OPUS_MODEL

Example expected output after saving:

    {
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "<local proxy token>",
        "ANTHROPIC_BASE_URL": "http://127.0.0.1:<proxy-port>",
        "API_TIMEOUT_MS": "3000000",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5.5",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5"
      }
    }

Runtime acceptance: after saving workspace model settings, launching or restarting a Claude Code session for that workspace uses the configured local proxy URL and model names. Existing conversations may require restart if the app's current terminal environment is fixed at process launch; if so, state that clearly in the UI or release notes and record it in Outcomes.

Quality acceptance: `bun run typecheck`, `bun test`, and `bun run lint` pass, except for any explicitly documented unrelated local file formatting issue. New utility behavior for JSON merge, provider storage redaction, model aggregation, and load-balancing should have unit tests.

## Idempotence and Recovery

Provider storage writes must be idempotent: saving the same provider twice should produce the same provider metadata and should not duplicate models. Model fetching should replace or merge by model ID rather than appending duplicates.

Proxy startup must be idempotent: starting the app twice or restarting the proxy from Settings should not leave multiple servers listening on different ports. If the configured port is occupied by the same app's previous proxy, stop the old instance if it is owned by this process. If the port is occupied by another process, choose a new local port, update proxy status, and make workspace saves use the current port.

Workspace settings writes must be safe to repeat. Running Save multiple times should update the seven required env keys and leave unrelated JSON unchanged. If `.claude/settings.local.json` contains invalid JSON, the write procedure may replace it with a valid object, but the UI should warn that the old file was invalid and the returned result should mention the normalization. Do not delete the invalid file before successfully writing the replacement.

If implementation partially fails, recover by keeping old provider/auth code in place until the new path is complete. Revert only this feature's files if necessary; do not run destructive git commands or delete unrelated local files. Avoid touching `.claude/settings.json`, `.claude/scheduled_tasks.lock`, and `apps/desktop/.tanstack/` unless the user explicitly asks.

## Artifacts and Notes

Sample provider metadata returned to the renderer should redact secrets:

    {
      "id": "provider_abc123",
      "name": "My OpenAI-compatible provider",
      "protocol": "openai",
      "baseUrl": "https://example.test/v1",
      "enabled": true,
      "hasSecret": true,
      "models": [
        { "id": "gpt-5.5", "providerId": "provider_abc123" }
      ]
    }

Sample workspace merge behavior:

    Input file:
    {
      "permissions": { "allow": ["Bash(bun test)"] },
      "env": {
        "CUSTOM_FLAG": "keep-me",
        "ANTHROPIC_BASE_URL": "old"
      }
    }

    Save from Models tab with proxy URL and model choices.

    Output file:
    {
      "permissions": { "allow": ["Bash(bun test)"] },
      "env": {
        "CUSTOM_FLAG": "keep-me",
        "ANTHROPIC_BASE_URL": "http://127.0.0.1:<proxy-port>",
        "ANTHROPIC_AUTH_TOKEN": "<local proxy token>",
        "API_TIMEOUT_MS": "3000000",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5.5",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5"
      }
    }

Suggested tests:

    mergeWorkspaceModelSettings creates .claude/settings.local.json when missing.
    mergeWorkspaceModelSettings preserves unrelated top-level keys.
    mergeWorkspaceModelSettings preserves unrelated env keys.
    mergeWorkspaceModelSettings replaces non-object env with an object.
    providerStorage redacts secrets in renderer responses.
    providerStorage writes with 0600 permissions when using file storage.
    aggregateModels deduplicates model IDs across providers.
    routeForModel round-robins providers with the same model ID.
    openAiToAnthropicTranslation maps basic non-streaming responses.

## Interfaces and Dependencies

The provider protocol type should be explicit:

    export type ModelProviderProtocol = "anthropic" | "openai";

Provider metadata exposed to the renderer should not expose plaintext secrets:

    export interface ModelProviderSummary {
      id: string;
      name: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      enabled: boolean;
      hasSecret: boolean;
      models: ModelProviderModel[];
      createdAt: string;
      updatedAt: string;
    }

    export interface ModelProviderModel {
      id: string;
      displayName?: string;
      providerId: string;
      lastFetchedAt?: string;
    }

Provider create/update input may include a secret, but responses must not:

    export interface UpsertModelProviderInput {
      id?: string;
      name: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      enabled: boolean;
      secret?: string;
      models?: string[];
    }

Proxy status should be renderer-safe:

    export interface ModelProxyStatus {
      running: boolean;
      baseUrl: string | null;
      port: number | null;
      tokenConfigured: boolean;
      enabledProviderCount: number;
      aggregatedModelCount: number;
      lastError?: string;
    }

Workspace model config input should be simple and explicit:

    export interface SaveWorkspaceModelSettingsInput {
      workspaceId: string;
      haikuModel: string;
      sonnetModel: string;
      opusModel: string;
    }

The save response should describe what happened so the UI can show precise feedback:

    export interface SaveWorkspaceModelSettingsResult {
      settingsPath: string;
      createdClaudeDirectory: boolean;
      createdSettingsFile: boolean;
      replacedInvalidJson: boolean;
      replacedNonObjectEnv: boolean;
      preservedEnvKeys: string[];
      writtenEnvKeys: string[];
    }

For tRPC, add procedures under the existing desktop router registration. Exact names may change to match repository conventions, but the final router must support these behaviors:

    modelProviders.list
    modelProviders.create
    modelProviders.update
    modelProviders.delete
    modelProviders.test
    modelProviders.fetchModels
    modelProviders.listAggregatedModels
    modelProxy.status
    modelProxy.restart
    workspaceModelSettings.read
    workspaceModelSettings.save

The local proxy depends on Node.js networking and filesystem APIs, so it belongs in main-process or service code, not renderer code. The renderer must call tRPC procedures and must not read provider secret files directly.

## Milestones

### Milestone 1: Provider storage and tRPC foundation

This milestone creates the provider data model and secure storage. At completion, the main process can persist providers, redact secrets in responses, test provider connectivity, fetch model lists, and return aggregated model metadata through tRPC. No UI redesign is required yet.

Acceptance:

    bun test <focused provider storage tests>
    bun run typecheck

Expected result: provider storage tests pass, provider tRPC types compile, and provider list responses do not include plaintext secrets.

### Milestone 2: Local Anthropic-compatible proxy

This milestone adds the auto-starting local proxy. At completion, the desktop app owns a loopback HTTP server that requires a local token, reports status through tRPC, exposes aggregated models, and routes message requests to Anthropic or OpenAI upstream providers.

Acceptance:

    bun test <focused proxy aggregation and routing tests>
    bun run typecheck

Expected result: model aggregation deduplicates model IDs, duplicate model routing round-robins providers, and proxy status reports a loopback base URL.

### Milestone 3: Settings > Models provider management redesign

This milestone replaces the old model settings page with provider management and proxy controls. At completion, a user can add providers from an empty state, test them, fetch or manually edit models, enable or disable them, and restart the proxy.

Acceptance:

    bun run typecheck
    bun test <focused renderer tests if this repo has matching component test patterns>

Expected result: the page renders an empty provider list without seeded providers, never displays saved secrets in plaintext, and surfaces provider/proxy errors clearly.

### Milestone 4: Workspace right sidebar Models tab

This milestone adds the workspace-specific Models tab and `.claude/settings.local.json` writer. At completion, the right sidebar can read current workspace model settings, choose Haiku/Sonnet/Opus models from aggregate models, and save the seven required env keys while preserving unrelated JSON.

Acceptance:

    bun test <focused workspace settings merge tests>
    bun run typecheck

Expected result: missing `.claude`, missing file, empty file, invalid JSON, missing `env`, non-object `env`, and existing unrelated content are all covered by tests.

### Milestone 5: Runtime integration, cleanup, and manual validation

This milestone ensures launched Claude Code sessions use the workspace model settings and removes obsolete UI/code only after the new path is working. At completion, the desktop app can be started manually, providers can be configured, a workspace settings file can be saved, and a workspace Claude Code session uses the configured proxy env.

Acceptance:

    bun run lint
    bun run typecheck
    bun test

Manual validation on Apple Silicon:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run clean:dev && bun run generate:icons && bun run clean-launch-services && bun run patch-dev-protocol && npx electron-vite dev --watch -c electron.vite.config.ts'

Expected result: the app opens without sign-in blocking, Settings > Models manages providers, the local proxy is running, the right sidebar Models tab saves workspace settings, and a Claude Code session for that workspace uses the saved env.

## Revision Notes

2026-04-25 16:45Z: Initial plan created after discovery and user decisions. The plan intentionally covers the full requested first version, uses OpenCovibe only as inspiration, and anchors workspace behavior on safe creation/overwrite of `.claude/settings.local.json` while preserving unrelated JSON content.
