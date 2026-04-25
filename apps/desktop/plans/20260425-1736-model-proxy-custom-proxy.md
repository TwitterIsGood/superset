# Add custom network proxy support to desktop model providers

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, desktop Electron interprocess communication must use tRPC from `apps/desktop/src/lib/trpc`, renderer code must not import Node.js modules, and implementation plans for desktop work belong in `apps/desktop/plans/`.

## Purpose / Big Picture

Users can already add Anthropic-compatible or OpenAI-compatible model providers in Desktop Settings > Models, but the provider requests go directly to the provider URL. This fails or is unreliable for users whose providers are only reachable through a local or corporate proxy, for example `http://127.0.0.1:7890`. After this change, a user can configure an optional proxy per model provider, test or fetch models through it, and have workspace model traffic routed through the same proxy when the local Superset model proxy forwards requests upstream.

The visible behavior is: open the desktop app, go to Settings > Models, add or edit a provider, fill a new proxy URL field with `http://127.0.0.1:7890`, save, then click Test or Fetch models. The upstream request should use that proxy. If the proxy field is empty, behavior remains unchanged.

## Assumptions

Node.js `fetch` in the Electron main process is backed by undici and can accept an undici `dispatcher` option at runtime. The implementation should add the `undici` package explicitly to `apps/desktop/package.json` if TypeScript cannot import `ProxyAgent` from an existing transitive dependency. This assumption must be confirmed during implementation by running the focused tests and `bun run typecheck` in `apps/desktop`.

The feature should store proxy configuration per provider, not globally for all model providers. This matches the current provider form structure and allows one provider to use a proxy while another provider connects directly.

A single proxy URL is enough for the first version. Although some tools expose separate `HTTP_PROXY` and `HTTPS_PROXY` environment variables, undici's `ProxyAgent` accepts one proxy endpoint and uses it to connect to both HTTP and HTTPS upstream URLs. The UI should describe this plainly as an optional proxy URL, not expose separate `http.proxy` and `https.proxy` fields unless implementation discovers that one field cannot satisfy both protocols.

Only HTTP proxy endpoints should be accepted initially, with `http://` and `https://` proxy URL schemes allowed. SOCKS support should not be included unless a future dependency explicitly supports it.

## Open Questions

There are no user-blocking questions for the first implementation. The plan intentionally chooses a per-provider, single optional proxy URL because it is the smallest behavior that satisfies the request and maps cleanly onto the existing provider settings.

## Progress

- [x] (2026-04-25 09:36Z) Inspected the desktop model settings UI, shared model provider types, tRPC router, storage layer, and model proxy service.
- [x] (2026-04-25 09:36Z) Created this ExecPlan for adding per-provider custom proxy configuration.
- [x] (2026-04-25 19:05Z) Implemented shared types and storage support for provider proxy URLs.
- [x] (2026-04-25 19:05Z) Added proxy-aware request helpers in the model proxy service and applied them to Test, Fetch models, Anthropic forwarding, and OpenAI forwarding.
- [x] (2026-04-25 19:05Z) Added the proxy URL field to Settings > Models and show saved proxy status in provider cards with credential redaction.
- [x] (2026-04-25 19:05Z) Added tests for storage proxy preservation/removal, proxy request option construction, and UI proxy display redaction.
- [x] (2026-04-25 19:05Z) Ran focused tests and desktop typecheck; root lint was attempted and failed for unrelated environment/worktree issues recorded below.

## Surprises & Discoveries

- Observation: The model provider feature already stores provider records in a sensitive local JSON file, and secrets are encrypted before writing.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts` writes `providers.json` with mode `0600` and encrypts `secretEncrypted`.

- Observation: All provider network calls currently use direct `fetch` calls with no proxy option.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` calls `fetch` in `forwardAnthropic`, `forwardOpenAI`, and `fetchProviderModels` without a dispatcher or agent.

- Observation: Provider settings are handled entirely through Electron tRPC, not a custom IPC channel file.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` exposes `modelProviders` and `modelProxy` routers, and `apps/desktop/AGENTS.md` says Electron interprocess communication should use tRPC from `src/lib/trpc`.

- Observation: `undici` was not listed as an available desktop dependency before implementation, so it was added explicitly with Bun.
  Evidence: `cd apps/desktop && bun pm ls undici` did not list `undici`; `bun add undici` installed `undici@8.1.0` and updated `apps/desktop/package.json` plus `bun.lock`.

- Observation: `ProxyAgent.Dispatcher` is not exported by the installed `undici` types.
  Evidence: the first `cd apps/desktop && bun run typecheck` failed with `src/lib/trpc/routers/model-proxy/service.ts(34,75): error TS2694: Namespace 'ProxyAgent' has no exported member 'Dispatcher'.` The helper now uses the plan's allowed local `dispatcher?: unknown` intersection type.

## Decision Log

- Decision: Store proxy configuration per model provider as an optional `proxyUrl` string.
  Rationale: The existing settings screen edits providers one at a time, and users may need a proxy for only the foreign provider while keeping local or domestic providers direct.
  Date/Author: 2026-04-25 / Claude Code

- Decision: Use one optional proxy URL field instead of separate `http.proxy` and `https.proxy` fields.
  Rationale: The user is not sure which split is needed and gave `http://127.0.0.1:7890` as the desired input. In Node's undici model, one proxy endpoint can proxy requests to HTTPS upstreams, so one field is simpler and less error-prone.
  Date/Author: 2026-04-25 / Claude Code

- Decision: Do not treat the proxy URL as a secret.
  Rationale: A local proxy URL such as `http://127.0.0.1:7890` is configuration rather than a credential. If the URL contains username/password, the provider storage file is already written with sensitive permissions, but the UI should avoid prominently displaying embedded credentials.
  Date/Author: 2026-04-25 / Claude Code

- Decision: Keep renderer code browser-only and build all proxy behavior in the main-process tRPC model proxy router.
  Rationale: The renderer only collects settings. Actual provider requests already happen in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`, which can safely use Node.js modules and undici.
  Date/Author: 2026-04-25 / Claude Code

## Outcomes & Retrospective

Users can now configure a single optional `proxyUrl` per desktop model provider. The value is accepted by the shared provider contract and tRPC schema, trimmed in storage, omitted when blank, returned in provider summaries, and displayed in Settings > Models with password redaction for credential-bearing proxy URLs.

Provider Test and Fetch models both use the configured proxy because they share `fetchProviderModels`. Workspace model forwarding also uses the selected provider's proxy URL for both Anthropic-compatible `/v1/messages` forwarding and OpenAI-compatible `/v1/chat/completions` forwarding. Providers without `proxyUrl` continue to pass the original fetch options unchanged.

Validation completed: focused storage/service/UI utility tests passed, and `cd apps/desktop && bun run typecheck` passed after changing the local dispatcher option type to `unknown`. Root lint was attempted but did not complete because of unrelated existing environment issues recorded in Artifacts and Notes. No real-proxy manual validation was performed in this session.

## Context and Orientation

This work affects the desktop app only. It does not require database migrations, shared web packages, marketing pages, admin, API, docs, or mobile changes. The relevant package is `apps/desktop`, plus workspace package metadata if a new dependency is required.

The desktop app is an Electron application. Electron has a main process and a renderer process. The main process can use Node.js modules such as `node:http` and filesystem APIs. The renderer process is the browser UI and must not import Node.js modules. In this repository, calls between renderer and main process use tRPC, a type-safe remote procedure call layer located under `apps/desktop/src/lib/trpc`. The desktop-specific instruction in `apps/desktop/AGENTS.md` says to use tRPC for Electron interprocess communication.

The current model provider UI lives in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It defines a `ProviderForm` with `name`, `protocol`, `baseUrl`, `secret`, `enabled`, and `models`, then calls `electronTrpc.modelProviders.create` or `electronTrpc.modelProviders.update` to save providers. It also lists providers and offers Test and Fetch models buttons.

The shared provider types live in `apps/desktop/src/shared/model-proxy.ts`. `ModelProviderSummary` is the redacted shape returned to the renderer, and `UpsertModelProviderInput` is the input shape used when saving providers.

The tRPC router for provider operations lives in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. It validates provider inputs with zod, then calls storage and service functions. The `modelProviders.test` procedure calls `testProvider`, and `modelProviders.fetchModels` calls `fetchProviderModels`.

Provider storage lives in `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`. It writes `providers.json` under Superset's local home directory, encrypts API keys as `secretEncrypted`, and redacts secrets before returning provider summaries to the UI.

Network forwarding lives in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. The local proxy listens on `127.0.0.1` and exposes Anthropic-compatible endpoints. When a workspace sends `/v1/messages` to this local proxy, `handleMessages` chooses a configured provider, then `forwardAnthropic` or `forwardOpenAI` sends the request to the upstream provider using `fetch`. `fetchProviderModels` also calls the provider's `/v1/models` endpoint using `fetch`. These fetch calls are the exact place where proxy support must be applied.

A proxy in this plan means an HTTP intermediary that the desktop app connects to before reaching the provider. For example, when the provider URL is `https://api.anthropic.com` and the proxy URL is `http://127.0.0.1:7890`, the desktop main process connects to `127.0.0.1:7890`, and that proxy makes or tunnels the connection to `api.anthropic.com`.

## Plan of Work

First, extend the shared model provider contract in `apps/desktop/src/shared/model-proxy.ts`. Add an optional `proxyUrl?: string` to `ModelProviderSummary` and `UpsertModelProviderInput`. Do not add proxy configuration to workspace model settings because workspace settings only need the local Superset proxy base URL and token; the upstream provider proxy is internal to the desktop app.

Next, extend the storage layer in `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`. Add `proxyUrl?: string` to `StoredModelProvider`. Update `parseStoredProvider` to preserve `proxyUrl` only when it is a string. Update `redactProvider` to include `proxyUrl`, but sanitize display if the implementation decides to protect embedded credentials. Update `upsertProvider` to trim the incoming proxy URL, remove trailing whitespace, and store `undefined` when the input is blank. Do not change encryption behavior for `secretEncrypted`.

Then update the tRPC validation schema in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. Add `proxyUrl: z.string().optional()` to `providerInputSchema`. Keep validation permissive at this boundary if the UI will perform basic URL guidance, but the service helper should reject unsupported proxy URL schemes before making network calls so bad values fail with a clear message.

Then implement proxy-aware fetching in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. Create a small helper near `appendPath` such as `createFetchOptions` or `fetchWithProviderProxy`. The helper should accept a provider object or `proxyUrl` plus normal fetch options, and if `proxyUrl` is blank, return the original options unchanged. If `proxyUrl` exists, parse it with `new URL(proxyUrl)`, allow only `http:` and `https:`, create an undici `ProxyAgent`, and pass it as the fetch `dispatcher`. If TypeScript complains that `dispatcher` is not part of the standard `RequestInit` type, define a local intersection type instead of using `as any`, for example `type FetchOptionsWithDispatcher = RequestInit & { dispatcher?: unknown }`. The goal is type safety without `any` or `@ts-ignore`.

Apply that helper to all provider-bound requests. `fetchProviderModels` should pass the provider proxy when calling `/v1/models`. `forwardAnthropic` should accept the full provider or a `proxyUrl` parameter instead of only `baseUrl` and `secret`, then use the helper for `/v1/messages`. `forwardOpenAI` should do the same for `/v1/chat/completions`. `handleMessages` should pass the chosen provider into these methods so they can access `provider.proxyUrl`.

Add or update focused tests. In `apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts`, add an assertion that `upsertProvider` persists `proxyUrl` in `listStoredProviders`, trims it, and converts blank proxy values to no proxy. Add a focused service-level test file if service internals are exported safely, such as `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts`, to verify proxy URL validation and dispatcher option creation. If exporting a helper would expose too much production surface, keep the helper exported only for tests with a clear name such as `createProviderFetchOptions` and do not add broader abstractions.

Update the UI in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. Add `proxyUrl: string` to `ProviderForm` and `EMPTY_FORM`. When editing a provider, populate `proxyUrl` from `provider.proxyUrl ?? ""`. When saving, include `proxyUrl: form.proxyUrl || undefined` in the input. Add an input after Base URL with placeholder text like `Proxy URL (optional), e.g. http://127.0.0.1:7890`. Add short helper text near the field explaining that one HTTP proxy URL is used for this provider's upstream requests, including HTTPS providers. In the provider card, show a small muted line such as `Proxy: http://127.0.0.1:7890` only when a proxy URL exists. If the URL contains credentials, display it via a sanitizing helper that replaces the password with `***`.

Keep all new UI code in the existing `ModelsSettings` component unless the file becomes hard to read. Do not create a new component unless repeated logic appears at least twice, because `AGENTS.md` favors co-location and avoiding unnecessary files. If adding a URL display helper, prefer placing it in the existing co-located `utils.ts` and add tests to `utils.test.ts` if the helper has meaningful credential redaction behavior.

Finally, run validation commands from `apps/desktop`. Start with focused tests for changed files, then run the app-level checks. Because this repository uses Bun, use `bun`, not npm, yarn, or pnpm.

## Concrete Steps

Work from the repository root unless a command explicitly changes directories.

Inspect package availability before adding a dependency:

    cd apps/desktop
    bun pm ls undici
    # Expected: either shows an available undici package or confirms it must be added.

If `undici` is not importable from desktop code, add it to `apps/desktop/package.json` using Bun:

    cd apps/desktop
    bun add undici
    # Expected: package.json and the lockfile update. Do not use npm, yarn, or pnpm.

After editing shared types, storage, service, and UI, run focused tests:

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/storage.test.ts
    # Expected: storage tests pass, including proxyUrl persistence.

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/service.test.ts
    # Expected: service proxy helper tests pass if this test file was added.

    cd apps/desktop
    bun test src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts
    # Expected: renderer utility tests pass if a proxy display helper was added.

Run desktop validation:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript completes with no errors.

    cd apps/desktop
    bun run lint:check-node-imports
    # Expected: no renderer Node.js import violations. If this script does not exist in package.json, run the repository's equivalent node-import check or note that it is unavailable.

From the repository root, run lint if practical for the current change set:

    bun run lint
    # Expected: Biome reports no lint errors for touched files.

For manual validation on Apple Silicon, use the known arm64 desktop startup flow rather than a generic desktop dev command if the local environment has Rosetta x64 native module issues. If that startup command is needed, retrieve the exact command from memory or existing project notes before running it. Once the app opens, go to Settings > Models, add or edit a provider, enter `http://127.0.0.1:7890` in the proxy field, save, and click Test. With a working local proxy and valid provider key, Test should report the number of fetched models. With an unreachable proxy, Test should fail with a clear network error and the app should remain usable.

## Validation and Acceptance

Acceptance is complete when all of these behaviors are true.

In Settings > Models, adding a provider includes an optional proxy URL field. Saving a provider with an empty proxy field works exactly as before. Editing that provider later shows an empty proxy field.

Saving a provider with `http://127.0.0.1:7890` persists that value. Editing the provider later shows the same value. The provider card indicates that a proxy is configured. If the proxy URL includes credentials, the display does not reveal the password.

Clicking Test or Fetch models for a provider with a proxy configured sends the provider request through the configured proxy. A working proxy allows the request to succeed. A bad proxy produces a clear failure toast from the existing error handling and does not corrupt the saved provider.

Sending a workspace model request through the local Superset proxy uses the selected provider's proxy URL when forwarding to the upstream provider. Providers without a proxy URL continue to use direct fetch behavior.

Focused tests pass:

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/storage.test.ts
    bun test src/lib/trpc/routers/model-proxy/service.test.ts

Type checking passes:

    cd apps/desktop
    bun run typecheck

Linting passes or any unrelated pre-existing lint failures are recorded in `Artifacts and Notes` with exact output:

    bun run lint

## Idempotence and Recovery

The storage migration is additive and safe. Existing `providers.json` files do not contain `proxyUrl`, and `parseStoredProvider` should treat missing `proxyUrl` as no proxy. Re-saving an existing provider should preserve the existing API key when the secret field is blank, matching current behavior, and should update only the provider's proxy URL when that field changes.

If a proxy URL is invalid, saving may still be allowed only if validation is intentionally deferred, but Test and Fetch models must fail clearly before attempting an unsupported proxy scheme. Retrying is safe: edit the provider, correct or clear the proxy URL, save again, and retest.

If adding `undici` causes dependency issues, revert only the dependency addition and try importing `ProxyAgent` from the runtime-supported source already available to Electron main process. Do not bypass type errors with `as any`; instead, isolate the fetch option type in a local type and keep the implementation explicit.

If manual validation with a real proxy is not possible, validation can still prove the feature structurally through tests and typecheck. Record the lack of real proxy manual validation in `Outcomes & Retrospective` so a later tester knows what remains.

## Artifacts and Notes

Current direct fetch calls that need proxy support are in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`:

    const upstream = await fetch(appendPath(baseUrl, "/v1/messages"), { ... });
    const upstream = await fetch(appendPath(baseUrl, "/v1/chat/completions"), { ... });
    const response = await fetch(appendPath(provider.baseUrl, endpoint), { ... });

The existing provider save input in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` should gain `proxyUrl`:

    const input = {
      id: form.id,
      name: form.name,
      protocol: form.protocol,
      baseUrl: form.baseUrl,
      proxyUrl: form.proxyUrl || undefined,
      enabled: form.enabled,
      secret: form.secret || undefined,
      models: normalizeModelIds(form.models),
    };

Record command outputs here during implementation, especially if lint or tests fail for unrelated reasons.

Implemented artifacts:

- `apps/desktop/src/shared/model-proxy.ts`: added optional `proxyUrl` to provider summary and upsert input.
- `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`: tRPC provider input now accepts optional `proxyUrl`.
- `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`: stored providers preserve, trim, redact/return, and remove blank proxy URLs.
- `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`: added `createProviderFetchOptions` using `undici` `ProxyAgent` for `http:` and `https:` proxy URLs and applied it to provider model fetches plus Anthropic/OpenAI forwarding.
- `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`: added provider proxy field, save/edit plumbing, draft-change detection, and provider-card proxy display.
- `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.ts`: added proxy display password redaction helper.
- `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts`: added focused service helper tests.
- `apps/desktop/src/lib/trpc/routers/model-proxy/storage.test.ts`: added proxy URL persistence/removal assertions.
- `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts`: added proxy display redaction tests.
- `apps/desktop/package.json` and `bun.lock`: added `undici@8.1.0` via `cd apps/desktop && bun add undici`.

Dependency check:

    cd apps/desktop && bun pm ls undici

Output did not list an available `undici` package, so `bun add undici` was run.

Focused tests:

    cd apps/desktop && bun test src/lib/trpc/routers/model-proxy/storage.test.ts src/lib/trpc/routers/model-proxy/service.test.ts src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts

Output:

    10 pass
    0 fail
    21 expect() calls
    Ran 10 tests across 3 files.

Typecheck:

    cd apps/desktop && bun run typecheck

First attempt failed with:

    src/lib/trpc/routers/model-proxy/service.ts(34,75): error TS2694: Namespace 'ProxyAgent' has no exported member 'Dispatcher'.

After changing the helper type to `type FetchOptionsWithDispatcher = RequestInit & { dispatcher?: unknown };`, rerunning the same command passed:

    $ bun run generate:icons && bun run generate:routes
    $ bun run scripts/generate-file-icons.ts
    Generated file icons: 0 SVGs copied, 2046 file names, 1152 extensions, 4528 folder names
    $ tsr generate
    $ tsc --noEmit

Node import check:

    cd apps/desktop && bun run lint:check-node-imports

Output:

    error: Script not found "lint:check-node-imports"

Root lint:

    bun run lint

Output:

    $ ./scripts/lint.sh
    Saved lockfile
    /Users/biangwua/Documents/biang/小玩意/superset/.claude/worktrees/agent-a3d92e7b/biome.jsonc configuration ━━━━━━━━━━

      × Found a nested root configuration, but there's already a root configuration.

      i The other configuration was found in /Users/biangwua/Documents/biang/小玩意/superset.

      i Use the migration command from the root of the project to update the configuration.

      $ biome migrate --write

    configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      × Biome exited because the configuration resulted in errors. Please fix them.

    [git-refs] ripgrep scan failed (exit 127)
    ./scripts/check-git-ref-strings.sh: line 28: rg: command not found
    [git-refs] ripgrep scan failed (exit 127)
    ./scripts/check-git-ref-strings.sh: line 28: rg: command not found
    error: script "lint" exited with code 1

## Interfaces and Dependencies

At completion, `apps/desktop/src/shared/model-proxy.ts` should expose these provider shapes with optional proxy configuration:

    export interface ModelProviderSummary {
      id: string;
      name: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      proxyUrl?: string;
      enabled: boolean;
      hasSecret: boolean;
      models: ModelProviderModel[];
      createdAt: string;
      updatedAt: string;
    }

    export interface UpsertModelProviderInput {
      id?: string;
      name: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      proxyUrl?: string;
      enabled: boolean;
      secret?: string;
      models?: string[];
    }

The tRPC input schema in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` should accept the same optional `proxyUrl` field:

    const providerInputSchema = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      protocol: protocolSchema,
      baseUrl: z.string().min(1),
      proxyUrl: z.string().optional(),
      enabled: z.boolean(),
      secret: z.string().optional(),
      models: z.array(z.string()).optional(),
    });

The service helper should have a narrow interface. One acceptable shape is:

    type FetchOptionsWithDispatcher = RequestInit & { dispatcher?: unknown };

    export function createProviderFetchOptions(params: {
      proxyUrl?: string;
      init: RequestInit;
    }): FetchOptionsWithDispatcher {
      ...
    }

The actual dispatcher should be an undici `ProxyAgent` when `proxyUrl` is present. Do not import undici in renderer files. If `undici` is added, it belongs in `apps/desktop/package.json` dependencies because the desktop main process needs it at runtime.

No new IPC channel in `apps/desktop/src/shared/ipc-channels.ts` is needed because this feature uses the existing tRPC model provider procedures.

## Revision Notes

- 2026-04-25: Initial plan created after inspecting the existing desktop model settings UI, tRPC provider router, provider storage, and model proxy service. The plan chooses one per-provider proxy URL because it satisfies the requested `http://127.0.0.1:7890` workflow with minimal UI and storage changes.
