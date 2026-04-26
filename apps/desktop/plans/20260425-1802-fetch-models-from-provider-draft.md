# Fetch models from an unsaved provider draft

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, desktop Electron interprocess communication must use tRPC from `apps/desktop/src/lib/trpc`, renderer code must not import Node.js modules, Bun is the package manager, and implementation plans for desktop work belong in `apps/desktop/plans/`.

## Purpose / Big Picture

Users adding a model provider should not have to save an incomplete provider before discovering its available model IDs. After this change, the Add provider form in Desktop Settings > Models will let a user enter protocol, Base URL, optional Proxy URL, and API key, click Fetch models directly inside the form, and populate the draft's Models list before saving. This makes the provider setup flow natural: paste connection details, fetch available models, review or edit the model list, then save once.

The visible behavior is: open the desktop app, go to Settings > Models, fill the Add provider form with a Base URL and API key, click a new Fetch models button near the form's Models section, and see model badges appear in the draft without creating a saved provider card first. The existing Fetch models button on saved provider cards should continue to work for already saved providers.

## Assumptions

The form-level fetch should require only the fields needed to contact the provider: protocol, Base URL, and API key. Provider name should not be required for draft fetching because the name is only needed to save the provider in local storage.

The optional Proxy URL that was just added to provider settings should also be used for draft fetching. This lets a user test a foreign provider through `http://127.0.0.1:7890` before saving.

Draft fetching should not write to provider storage. It should return model IDs to the renderer, and the renderer should update `form.models`. The user must still click Add provider or Update provider to persist the provider and its fetched model list.

For an existing saved provider being edited, form-level fetch should use the visible draft fields. If the API key input is blank while editing, form-level fetch may use the saved provider ID as a fallback, or the UI may require entering a key. This plan chooses the better user experience: if editing a saved provider and the key field is blank, the backend should fetch using the saved secret plus the current draft Base URL, Proxy URL, and Protocol. If the key field is non-blank, it should use the draft key.

## Open Questions

There are no user-blocking questions. The plan chooses a form-level fetch button that works for both Add provider and Edit provider. For new providers it requires an API key; for existing providers it can use the saved key unless the user entered a replacement key.

## Progress

- [x] (2026-04-25 10:02Z) Inspected the current Models settings form, model provider tRPC router, shared provider types, and model proxy service after the proxy URL implementation.
- [x] (2026-04-25 10:02Z) Created this ExecPlan for fetching models from unsaved provider draft fields.
- [x] (2026-04-26 01:20 local) Added `FetchProviderModelsInput` interface in `apps/desktop/src/shared/model-proxy.ts` with fields `id?`, `protocol`, `baseUrl`, `proxyUrl?`, `secret?`.
- [x] (2026-04-26 01:20 local) Refactored service: extracted `fetchProviderModelsFromConnection()` as reusable helper, added `resolveDraftProviderConnection()` (pure, testable), and `fetchProviderModelsFromDraft()` in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. Existing `fetchProviderModels()` now delegates to the shared helper.
- [x] (2026-04-26 01:20 local) Added `fetchModelsFromDraft` tRPC mutation with zod input schema in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. Returns models without persisting.
- [x] (2026-04-26 01:20 local) Added `canFetchDraftModels()` helper in `utils.ts`. Added `fetchDraftModelsMutation` hook and `canFetchDraft` derived state in `ModelsSettings.tsx`. Added Fetch models button inside the form's Models section (next to the Add button) with loading state, disabled logic, and success/error toasts.
- [x] (2026-04-26 01:45 local) Ran validation: Biome fix passed, desktop typecheck passed (no errors), all existing tests pass (service 3/3, storage 2/2, aggregation 2/2, utils 5/5). Also fixed missing `ModelProviderProtocol` import in service.ts and renamed `_canFetchDraft` to `canFetchDraft`.
- [x] (2026-04-26 01:45 local) Updated this ExecPlan with final outcomes.

## Surprises & Discoveries

- Observation: The current form already has a Models section with manual model ID entry, but its only provider-backed Fetch models action is on saved provider cards.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` renders card-level Fetch models buttons that call `modelProviders.fetchModels({ id })`, while the form only has manual Add model ID controls.

- Observation: The backend fetch path currently requires a saved provider ID.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` defines `fetchModels` with input `{ id: string }`, and `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` exports `fetchProviderModels(providerId: string)` which loads the provider from storage before fetching.

- Observation: The proxy URL support is already centralized in `createProviderFetchOptions`, so draft fetching can reuse the same proxy behavior by passing a draft provider object into a shared fetch implementation.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` uses `createProviderFetchOptions({ proxyUrl, init })` for saved provider model fetches and forwarding.

- Observation: Subagent initially placed the Fetch models mutation hook and `canFetchDraft` logic but did not render the button in the form UI. The button had to be added manually after the subagent completed.
  Evidence: The `fetchDraftModelsMutation` hook and `canFetchDraftModels` helper existed but the variable was named `_canFetchDraft` (underscore prefix indicating unused) and no `<Button>` element was rendered inside the form's Models section.

- Observation: `ModelProviderProtocol` type was used in the new `fetchProviderModelsFromConnection` function parameter but not imported, causing a typecheck error. Fixed by adding it to the existing import block from `shared/model-proxy`.
  Evidence: `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` line 362 referenced `ModelProviderProtocol` but only `FetchProviderModelsInput`, `ModelProviderModel`, and `ModelProxyStatus` were imported.

## Decision Log

- Decision: Add a new draft fetch mutation instead of overloading the saved-provider `fetchModels` mutation.
  Rationale: Saved-provider fetch mutates storage by replacing stored provider models. Draft fetching must not write storage; it only returns model IDs to the form. Separate procedures keep those behaviors clear.
  Date/Author: 2026-04-25 / Claude Code

- Decision: The draft fetch input should include `id?: string`, `protocol`, `baseUrl`, `proxyUrl?: string`, and `secret?: string`.
  Rationale: New providers have no ID and must provide a key. Existing providers can pass their ID so the backend may reuse the saved secret when the replacement key field is blank.
  Date/Author: 2026-04-25 / Claude Code

- Decision: The form-level Fetch models button should live inside the form's Models section, next to or near the manual Add model ID control.
  Rationale: The action populates the draft Models list, not the saved provider card list. Keeping it in the form makes the result visible immediately before saving.
  Date/Author: 2026-04-25 / Claude Code

- Decision: Fetching draft models should replace the draft model list with fetched provider models.
  Rationale: The saved-provider Fetch models action replaces stored models. Mirroring that behavior is predictable and avoids mixing stale manually entered IDs with provider-reported IDs. Users can still manually add or remove IDs after fetching.
  Date/Author: 2026-04-25 / Claude Code

## Outcomes & Retrospective

Implementation complete. Users can now fetch models from the Add/Edit provider form before saving the provider.

Backend: `resolveDraftProviderConnection` is a pure function that resolves connection details, falling back to saved provider secrets for edit mode. `fetchProviderModelsFromDraft` calls it then delegates to the shared `fetchProviderModelsFromConnection` helper. The `fetchModelsFromDraft` tRPC mutation returns models without writing storage.

Frontend: The form's Models section now has a "Fetch models" button next to the manual "Add" button. It is enabled when baseUrl is non-empty and either a secret is provided or the saved provider has a secret (edit mode). On success it replaces the draft model list and shows a toast with the count. On error it shows the error message. While fetching, the button text changes to "Fetching..." and is disabled.

Validation results:
- Biome check/fix: passed
- Desktop typecheck: passed (0 errors)
- Service tests: 3/3 passed
- Storage tests: 2/2 passed
- Aggregation tests: 2/2 passed
- UI utils tests: 5/5 passed
- Total: 12/12 tests passing

Lesson learned: Subagent completed the backend and hooks correctly but left the UI button unwired. The `_canFetchDraft` variable name (underscore prefix) was a signal that the integration was incomplete. Manual verification of the rendered UI is essential for frontend work.

## Context and Orientation

This work affects the desktop app only. It does not require database migrations, web, marketing, admin, API, docs, or mobile changes. The relevant package is `apps/desktop`. No new Electron IPC channel file is needed because this app uses tRPC for Electron interprocess communication.

Electron has a main process and a renderer process. The main process can use Node.js APIs and performs provider network calls. The renderer process is the browser UI and must not import Node.js modules. tRPC is the type-safe call layer used by the renderer to ask the main process to perform work; in this feature, tRPC router code lives in `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`.

The settings UI lives in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It owns `ProviderForm`, including `protocol`, `baseUrl`, `proxyUrl`, `secret`, and `models`. It currently uses `electronTrpc.modelProviders.create` and `electronTrpc.modelProviders.update` to save the form, `electronTrpc.modelProviders.fetchModels` to fetch models for saved providers by ID, and local state to render draft model badges.

The shared type file is `apps/desktop/src/shared/model-proxy.ts`. It currently defines `ModelProviderProtocol`, `ModelProviderModel`, `ModelProviderSummary`, and `UpsertModelProviderInput`. A new input interface can be added here so both the router and service use the same shape for draft fetches.

The service code lives in `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts`. It currently has `fetchProviderModels(providerId: string)`, which reads a saved provider from storage, validates that it has an API key, sends a request to `/v1/models`, and returns `ModelProviderModel[]`. It also has `createProviderFetchOptions`, which applies an optional undici proxy dispatcher for proxy URLs like `http://127.0.0.1:7890`.

The storage code lives in `apps/desktop/src/lib/trpc/routers/model-proxy/storage.ts`. It can list saved providers including decrypted secrets through `listProvidersForProxy`. Draft fetching should not call `upsertProvider`, `replaceProviderModels`, or write provider storage.

## Plan of Work

First, add a draft fetch input type in `apps/desktop/src/shared/model-proxy.ts`. Name it `FetchProviderModelsInput` or similar. It should include `id?: string`, `protocol: ModelProviderProtocol`, `baseUrl: string`, `proxyUrl?: string`, and `secret?: string`. It should not require `name`, `enabled`, or `models`, because those fields are not necessary to contact `/v1/models`.

Next, refactor `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` so the actual `/v1/models` request accepts provider connection details rather than only a provider ID. Introduce a narrow helper such as `fetchProviderModelsFromConnection(params)` that accepts `id`, `protocol`, `baseUrl`, `proxyUrl`, and `secret`, applies `createProviderFetchOptions`, parses the provider response, and returns `ModelProviderModel[]`. Preserve the existing exported `fetchProviderModels(providerId: string)` by making it load the saved provider, then call the new helper. This keeps the saved-provider card behavior unchanged.

Then add `fetchProviderModelsFromDraft(input)` in the service. This function should trim `baseUrl`, `proxyUrl`, and `secret`. If `input.secret` is present after trimming, use it. If it is blank and `input.id` exists, load the saved provider from `listProvidersForProxy()` and use its saved secret. If no usable secret is available, throw `Provider API key is required`. The function should use draft `protocol`, `baseUrl`, and `proxyUrl` even when using a saved secret, so edit-mode fetching tests the visible draft connection fields. For returned models, use `input.id ?? "draft"` as `providerId`; the renderer only needs IDs, and the providerId is not persisted until save.

Then update `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`. Add a zod schema for the draft fetch input, or reuse the new shared type shape through a local schema with the same fields. Add a new mutation named `fetchModelsFromDraft` under `modelProviders`. It should call `fetchProviderModelsFromDraft(input)` and return the model array directly. Do not call `replaceProviderModels` in this new mutation.

Then update `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. Add a mutation hook named `fetchDraftModelsMutation = electronTrpc.modelProviders.fetchModelsFromDraft.useMutation()`. Add a function such as `fetchModelsForDraft` that calls the mutation with `id: form.id`, `protocol: form.protocol`, `baseUrl: form.baseUrl`, `proxyUrl: form.proxyUrl || undefined`, and `secret: form.secret || undefined`. On success, update `form.models` to the fetched model IDs, clear `newModelId`, and show a success toast like `Fetched 12 models`. On error, show the existing style of error toast.

Add a Fetch models button inside the form's Models section. Place it near the `Models` label or next to the manual model ID Add button. Disable it while fetching. For a new provider, disable it until `form.baseUrl.trim()` and `form.secret.trim()` are non-empty. For an existing provider, disable it until `form.baseUrl.trim()` is non-empty and either `form.secret.trim()` is non-empty or `editingProvider?.hasSecret` is true. Do not require provider name for this button. Do not save the provider automatically.

Keep the saved-provider card Fetch models button unchanged. That button should still update provider storage immediately for already saved providers because it works on an existing provider ID and then refreshes the list.

Add focused tests. In `apps/desktop/src/lib/trpc/routers/model-proxy/service.test.ts`, add tests for draft input validation that do not perform real network calls where possible. If the helper cannot be tested without real fetch, export a pure helper such as `resolveDraftProviderConnection` that returns the connection details or throws `Provider API key is required`, and test that new providers require a key while edit-mode inputs can use saved secrets. If adding service tests requires too much mocking of storage, at minimum add tests for pure helper behavior and keep network behavior covered by the existing saved fetch implementation. Do not introduce broad abstractions just for tests.

If the UI gains any non-trivial enabling logic, move it to `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.ts` and test it in `utils.test.ts`. For example, a helper `canFetchDraftModels({ baseUrl, secret, hasSavedSecret, isPending })` can make button behavior easy to test without rendering the full component.

Finally, run focused tests and typecheck from `apps/desktop`. Because this repository uses Bun, do not use npm, yarn, or pnpm.

## Concrete Steps

Work from the repository root unless a command explicitly changes directories.

Edit the shared input type:

    apps/desktop/src/shared/model-proxy.ts

Add or refactor service functions:

    apps/desktop/src/lib/trpc/routers/model-proxy/service.ts

Add the tRPC mutation:

    apps/desktop/src/lib/trpc/routers/model-proxy/index.ts

Update the renderer form:

    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx

Run focused tests from `apps/desktop`:

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/service.test.ts src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts
    # Expected: all tests pass.

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript completes with no errors.

If practical, run the existing storage/service/UI tests touched by the previous proxy work:

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/storage.test.ts src/lib/trpc/routers/model-proxy/service.test.ts src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts
    # Expected: all tests pass.

For manual validation on Apple Silicon, use the known arm64 desktop startup flow rather than a generic desktop dev command if the local environment has Rosetta x64 native module issues. Once the app opens, go to Settings > Models, fill Protocol, Base URL, optional Proxy URL, and API key in Add provider, click Fetch models before saving, and observe model badges appear in the draft. Then click Add provider and verify the saved provider card shows the fetched model count.

## Validation and Acceptance

Acceptance is complete when all of these behaviors are true.

In Settings > Models, the Add provider form has a Fetch models button in the form itself. A user can enter Base URL and API key, click Fetch models before saving, and the draft Models list is populated from the provider response. The provider is not saved until the user clicks Add provider.

The form-level Fetch models button does not require Provider name for a new provider. It does require Base URL and an API key for a new provider. It supports optional Proxy URL and uses the same proxy handling as saved provider fetches.

In Edit provider mode, form-level Fetch models uses the visible draft Base URL, Protocol, and Proxy URL. If the API key field is blank, it uses the saved provider secret. If the API key field has a value, it uses that replacement key for the fetch without saving it yet.

The saved provider card's Fetch models button still works as before: it fetches by saved provider ID, writes the fetched models to storage, refreshes the list, and shows the existing success toast.

Validation commands pass or unrelated failures are recorded exactly in `Artifacts and Notes`:

    cd apps/desktop
    bun test src/lib/trpc/routers/model-proxy/service.test.ts src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts
    bun run typecheck

## Idempotence and Recovery

The change is additive. Adding a new draft fetch mutation does not alter saved provider storage, and repeated draft fetches only replace the in-memory form model list. If a draft fetch fails because the Base URL, API key, or Proxy URL is wrong, the user can edit those fields and retry without corrupting saved providers.

If the new mutation name conflicts with generated tRPC types or existing router names, choose a similarly explicit name such as `fetchDraftModels`, update the renderer hook consistently, and record the decision in this plan. Do not overload the existing `fetchModels` mutation in a way that makes it sometimes write storage and sometimes not.

If typecheck fails because the new shared input type creates an import cycle, keep the shared type in `apps/desktop/src/shared/model-proxy.ts` and import it only as a type in main-process service code. If zod schemas need to duplicate the fields, keep the duplication small and explicit rather than building a complicated schema abstraction.

## Artifacts and Notes

Current saved-only fetch flow:

    // apps/desktop/src/lib/trpc/routers/model-proxy/index.ts
    fetchModels: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const models = await fetchProviderModels(input.id);
        return replaceProviderModels(input.id, models);
      })

    // apps/desktop/src/lib/trpc/routers/model-proxy/service.ts
    export async function fetchProviderModels(providerId: string): Promise<ModelProviderModel[]> {
      const provider = (await listProvidersForProxy()).find((item) => item.id === providerId);
      if (!provider) throw new Error(`Provider ${providerId} not found`);
      if (!provider.secret) throw new Error("Provider API key is required");
      ...
    }

The new draft mutation should look conceptually like this, but final names may differ:

    fetchModelsFromDraft: publicProcedure
      .input(fetchProviderModelsInputSchema)
      .mutation(({ input }) => fetchProviderModelsFromDraft(input))

The renderer success handler should only update local form state:

    const models = await fetchDraftModelsMutation.mutateAsync({ ...draftFields });
    setForm((current) => ({
      ...current,
      models: models.map((model) => model.id),
    }));

Record command outputs here during implementation, especially if typecheck or tests fail for unrelated reasons.

## Interfaces and Dependencies

At completion, `apps/desktop/src/shared/model-proxy.ts` should expose a draft fetch input shape similar to:

    export interface FetchProviderModelsInput {
      id?: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      proxyUrl?: string;
      secret?: string;
    }

At completion, `apps/desktop/src/lib/trpc/routers/model-proxy/service.ts` should expose these behaviors:

    export async function fetchProviderModels(providerId: string): Promise<ModelProviderModel[]>;

    export async function fetchProviderModelsFromDraft(
      input: FetchProviderModelsInput,
    ): Promise<ModelProviderModel[]>;

The existing `fetchProviderModels(providerId)` must keep its saved-provider semantics. The new `fetchProviderModelsFromDraft(input)` must not write storage.

At completion, `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts` should expose both mutations:

    fetchModels: saved provider ID -> fetch and persist models to storage.
    fetchModelsFromDraft: draft connection details -> return models without persisting.

No new package dependency should be needed for this plan. Reuse the existing `undici` dependency and `createProviderFetchOptions` from the proxy URL work.

## Revision Notes

- 2026-04-25: Initial plan created after inspecting the current saved-only Fetch models flow. The plan adds a separate draft fetch mutation so users can fetch provider models before saving, without changing the saved-provider fetch behavior.
