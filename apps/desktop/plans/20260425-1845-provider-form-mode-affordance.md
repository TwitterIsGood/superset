# Make provider form mode and save state explicit

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is `apps/desktop`. Electron interprocess communication, meaning renderer-to-main-process calls, must continue to use tRPC from `apps/desktop/src/lib/trpc`; this plan should not require IPC changes.

## Purpose / Big Picture

After this change, the Settings > Models provider form will make its current mode and available action obvious. The current experience is confusing because the form can say `Edit provider`, but the primary button still says `Save provider`, and it can be enabled even when the user has not actually changed anything. Users should immediately understand whether they are adding a provider or editing an existing provider, and the primary action should only be available when it can do useful work.

The observable result is that opening Settings > Models shows an add-provider form with a clear add-oriented primary action. Clicking `Edit` on an existing provider changes both the title and primary action to edit-oriented copy, shows `Cancel edit`, and disables the update action until the user changes a field or model chip. This prevents users from thinking the app is in a broken edit state and prevents no-op saves.

## Assumptions

Settings > Models is rendered by `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. The provider form currently stores draft state in `form`, with `form.id` present only while editing an existing provider.

The latest edit-mode exit fix already added `isEditingProvider = Boolean(form.id)`, a header `Cancel edit` button, and an add-mode `Clear draft` action. This plan builds on that UI and improves wording plus disabled-state behavior.

This plan is renderer-only. It should not change provider storage, encrypted secret handling, local proxy behavior, workspace `.claude/settings.local.json` writing, or tRPC router contracts.

Because saved provider secrets are intentionally not loaded into the form, the edit form cannot compare the secret input against the saved secret. An empty secret while editing means “keep the existing saved secret”; a non-empty secret means “replace it.”

## Open Questions

There are no open product questions. The user asked why edit mode does not show edit-oriented wording while `Save provider` is still enabled, and requested a better experience. The acceptance behavior is clear: mode-specific copy and no enabled no-op save.

## Progress

- [x] (2026-04-25 18:45Z) Reviewed `ModelsSettings.tsx` after the edit-mode exit fix.
- [x] (2026-04-25 18:45Z) Confirmed the form title changes to `Edit provider`, but the submit button still says `Save provider`.
- [x] (2026-04-25 18:45Z) Confirmed submit disabled state only checks required fields and pending mutations, so edit mode can submit even without changes.
- [x] (2026-04-25 18:45Z) Created this ExecPlan for mode-specific form affordances and no-op save prevention.
- [x] (2026-04-25 18:45Z) Implemented mode-specific primary button labels and edit-mode helper text in `ModelsSettings.tsx`.
- [x] (2026-04-25 18:45Z) Derived whether the edit draft has changed compared with the selected saved provider.
- [x] (2026-04-25 18:45Z) Disabled edit-mode submit until there are actual changes, while keeping add-mode validation simple.
- [x] (2026-04-25 18:45Z) Ran desktop typecheck; attempted manual automation, but the running app window was blank/no interactive DOM was available.

## Surprises & Discoveries

- Observation: Edit mode already has a boolean that can drive mode-specific UI.
  Evidence: `ModelsSettings.tsx` defines `const isEditingProvider = Boolean(form.id);` and uses it for the title and `Cancel edit` rendering.

- Observation: The primary submit action is still generic and can look wrong in edit mode.
  Evidence: The bottom action row renders `<Button type="submit" disabled={!form.name || !form.baseUrl || saveMutation.isPending || updateMutation.isPending}>Save provider</Button>` for both add and edit modes.

- Observation: Edit mode currently has no no-op detection.
  Evidence: The disabled expression does not compare `form` to the saved provider being edited, so a provider with existing name and base URL leaves `Save provider` enabled immediately after clicking `Edit`.

## Decision Log

- Decision: Use mode-specific primary button labels: `Add provider` in add mode and `Update provider` in edit mode.
  Rationale: The title alone is not enough. Matching the button text to the operation makes the mode obvious and removes the mismatch reported by the user.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Disable `Update provider` until the edit draft differs from the selected saved provider.
  Rationale: Users should not be invited to save when nothing changed. This avoids no-op updates and makes the active button state meaningful.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Treat a non-empty secret input in edit mode as a change, and treat an empty secret input as no secret change.
  Rationale: The saved secret is intentionally not shown in the renderer. The existing API contract uses `secret: undefined` to keep the saved secret, so only typed secret text can count as a secret edit.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Keep this in `ModelsSettings.tsx` unless a tiny pure helper becomes necessary for readability.
  Rationale: This is local UI state logic. New files or abstractions would add more structure than the task needs.
  Date/Author: 2026-04-25 / planning agent.

## Outcomes & Retrospective

Implemented in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` as a renderer-only change. Add mode now uses the `Add provider` primary label. Edit mode now uses the `Update provider` primary label, keeps `Cancel edit`, and shows `Make a change to update this provider.` while the selected saved provider matches the draft.

The submit button is enabled only when required provider fields contain non-whitespace text, no create/update mutation is pending, and, in edit mode, the draft differs from the selected saved provider. Edit-mode change detection covers name, protocol, base URL, enabled state, normalized model IDs, and a non-empty secret draft. Cancel edit still calls `clearForm`, so it returns to add mode without provider mutations.

Validation: `cd apps/desktop && bun run typecheck` passed. A focused manual/e2e check was attempted against the current Electron automation target, but the app window rendered blank and `inspect_dom` returned no interactive elements, so manual UI validation was not practical in the current running session.

## Context and Orientation

The affected app is `apps/desktop`, the Electron desktop app. The renderer process is the React UI under `apps/desktop/src/renderer`. Settings > Models is a renderer page that manages global model providers for the local Anthropic-compatible proxy. A provider is a saved upstream model service configuration with a name, protocol, base URL, optional encrypted API key, enabled state, and model IDs.

The key file is `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It defines a `ProviderForm` type and `EMPTY_FORM`. The component loads providers with `electronTrpc.modelProviders.list.useQuery()`, stores the current draft in `form`, and uses `form.id` to decide whether saving should create or update.

The relevant current behavior is:

    const isEditingProvider = Boolean(form.id);

    <h3>{isEditingProvider ? "Edit provider" : "Add provider"}</h3>

    <Button type="submit" disabled={!form.name || !form.baseUrl || saveMutation.isPending || updateMutation.isPending}>
      Save provider
    </Button>

This means edit mode is partially visible through the title, but not through the main action. The button is also enabled immediately after entering edit mode because an existing provider already has a name and base URL.

This plan involves no IPC changes. IPC means interprocess communication between the renderer UI and Electron main process. In this repo, IPC must use tRPC from `apps/desktop/src/lib/trpc`. The provider create/update calls already use tRPC through `electronTrpc.modelProviders`; this plan only changes when the renderer enables the existing submit action and what text it shows.

## Plan of Work

First, derive the provider currently being edited. In `ModelsSettings.tsx`, after `isEditingProvider`, add a local value such as `const editingProvider = form.id ? providers.find((provider) => provider.id === form.id) : undefined;`. This should reuse the already loaded provider list and should not trigger new queries.

Next, derive whether the form has the minimum required values. Use trimmed strings so whitespace-only names or base URLs do not enable submit. For example, `const hasRequiredProviderFields = form.name.trim().length > 0 && form.baseUrl.trim().length > 0;`. If changing `saveProvider`, also trim before sending if the surrounding code style permits; otherwise keep the payload behavior unchanged and only use trimmed values for disabled state.

Then, derive whether the edit draft has changed. Compare the current form to `editingProvider` when present. The comparison should include provider name, protocol, base URL, enabled state, model IDs after normalization, and secret replacement. For model IDs, use the existing `normalizeModelIds` helper on both `form.models` and `editingProvider.models.map((model) => model.id)`, then compare arrays by length and exact item order. A non-empty `form.secret.trim()` should count as a change because it will replace the saved secret. An empty secret in edit mode should not count as a change.

Use the derived values to build a clear disabled state. Add mode should enable submit only when required fields are present and no create/update mutation is pending. Edit mode should enable submit only when required fields are present, an `editingProvider` still exists, at least one field changed, and no create/update mutation is pending. If the provider disappears while editing, the existing effect resets the form; keep that behavior.

Update button labels. The primary submit button should render `Add provider` when `!isEditingProvider` and `Update provider` when `isEditingProvider`. Keep the header title as `Add provider` or `Edit provider`. Keep `Cancel edit` in edit mode. Keep `Clear draft` in add mode only.

Optionally add a small text hint under the action row in edit mode when no changes exist, such as `Make a change to update this provider.` This hint should be muted and should not appear while the update is enabled. Keep it concise; do not add a larger validation system.

Finally, validate manually. In Settings > Models, click `Edit` on a provider. The form should say `Edit provider`, the primary button should say `Update provider`, and it should be disabled until a field or model chip changes. Change the provider name, base URL, enabled checkbox, model chips, or secret input; the button should become enabled. Click `Cancel edit`; the form should return to `Add provider` and the primary button should say `Add provider`.

## Concrete Steps

From the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Read the current form file before editing:

    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx

Make a small renderer-only edit in that file. The relevant locations are:

    the state/derived values near `isEditingProvider`
    the `saveProvider` required-field behavior if trimming is added
    the form header and bottom action row

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: route/icon generation completes and TypeScript reports no errors.

If a pure comparison helper is extracted, add or update a focused colocated test and run it directly. If no helper is extracted, manual e2e plus typecheck are enough for this small UI-state change.

For manual desktop validation, use the current running dev app if available. If it must be restarted on Apple Silicon, use the known arm64 flow:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run dev'

Expected dev output should include the fixed automation port:

    DevTools listening on ws://127.0.0.1:9322/...
    [window-loader] Successfully loaded: http://localhost:5173/#/workspace/...

## Validation and Acceptance

Add-mode acceptance: open Settings > Models with no provider selected for editing. The form title says `Add provider`. The primary submit button says `Add provider`. It is disabled when provider name or base URL is empty or whitespace-only, and enabled after both fields contain non-whitespace text. The secondary action says `Clear draft`.

Edit-mode acceptance: click `Edit` on an existing provider. The form title says `Edit provider`. The header shows `Cancel edit`. The primary submit button says `Update provider`, not `Save provider`. Immediately after entering edit mode, `Update provider` is disabled if no field has been changed.

Change detection acceptance: while editing, changing any of these makes `Update provider` enabled: provider name, protocol, base URL, enabled checkbox, model chip add/remove, or typing a replacement secret. Reverting the changed field back to the saved value disables `Update provider` again, except for a typed replacement secret which remains a draft change until canceling or clearing the field.

Cancel acceptance: clicking `Cancel edit` resets the form to add mode. The title becomes `Add provider`, the primary button becomes `Add provider`, the secret input placeholder becomes `API key`, model chips/new-model draft are cleared, and no provider mutation or toast happens.

Save acceptance: clicking `Update provider` when enabled still updates the existing provider and then clears the form after success. Clicking `Add provider` in add mode still creates a new provider. `Test`, `Fetch models`, and `Delete` buttons on provider cards continue to work.

Validation command must pass:

    cd apps/desktop
    bun run typecheck

Manual e2e should verify the flow using an existing provider such as CPAMeiguo without printing or exposing API keys.

## Idempotence and Recovery

This change is local to renderer UI state. Reapplying it should be safe because it only derives booleans and labels from loaded provider data and form state. It should not add persistent state.

If comparison logic is wrong, the failure mode is limited to the submit button enabling or disabling at the wrong time. Recovery is to simplify the comparison to the fields listed in Validation and Acceptance. No provider storage, secret encryption, proxy process, or workspace settings file needs rollback.

If a provider is deleted while it is being edited, the existing effect that clears the form when `providers.find((item) => item.id === form.id)` fails should keep working. The new `editingProvider` derived value must not throw when undefined.

## Artifacts and Notes

Current confusing UI:

    Edit provider                         [Cancel edit]
    ...fields already filled...
    [Save provider]

Desired add mode:

    Add provider
    ...empty draft fields...
    [Add provider] [Clear draft]

Desired edit mode immediately after clicking Edit:

    Edit provider                         [Cancel edit]
    ...saved provider fields...
    [Update provider disabled]
    Make a change to update this provider.

Desired edit mode after changing a field:

    Edit provider                         [Cancel edit]
    ...changed provider fields...
    [Update provider enabled]

## Interfaces and Dependencies

No new interfaces, APIs, IPC channels, tRPC procedures, dependencies, or packages are needed.

The implementation should use existing local values and helpers:

    const isEditingProvider = Boolean(form.id);
    const editingProvider = form.id ? providers.find((provider) => provider.id === form.id) : undefined;
    const hasRequiredProviderFields = form.name.trim().length > 0 && form.baseUrl.trim().length > 0;

Model comparison should use the existing helper imported from `./utils`:

    normalizeModelIds(form.models)
    normalizeModelIds(editingProvider.models.map((model) => model.id))

The final submit disabled value should be conceptually equivalent to:

    const isProviderMutationPending = saveMutation.isPending || updateMutation.isPending;
    const canSubmitProvider = hasRequiredProviderFields && !isProviderMutationPending && (!isEditingProvider || (Boolean(editingProvider) && hasProviderDraftChanges));

Then the button renders:

    <Button type="submit" disabled={!canSubmitProvider}>
      {isEditingProvider ? "Update provider" : "Add provider"}
    </Button>

## Revision Notes

2026-04-25 18:45Z: Initial plan created because the provider form had edit-mode title text but still showed an always-generic enabled `Save provider` button, making the editing state unclear and allowing no-op saves.

2026-04-25 18:45Z: Implemented the renderer-only affordance change in `ModelsSettings.tsx`: mode-specific primary labels, edit-mode dirty detection, edit-mode disabled submit until changes exist, and a small no-change helper. Typecheck passed; manual automation could not verify the UI because the current app window was blank with no interactive DOM.
