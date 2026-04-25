# Add an explicit exit from provider edit mode

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is `apps/desktop`. Electron interprocess communication, meaning renderer-to-main-process calls, must continue to use tRPC from `apps/desktop/src/lib/trpc`; this plan should not require IPC changes.

## Purpose / Big Picture

After this change, a user who clicks `Edit` on a provider in Settings > Models can clearly leave edit mode and return to adding a new provider. The user-visible problem is that the right-side form title changes to `Edit provider`, but the UI does not make it obvious how to exit that state, so users feel blocked when they want to add another provider or model. The fix should make the state transition explicit: edit an existing provider, cancel editing, and see the form return to `Add provider` without modifying saved providers.

The behavior is visible in the desktop app by opening Settings > Models, clicking `Edit` on a provider such as CPAMeiguo, then clicking a clear `Cancel edit` or `New provider` action. The form should reset to `Add provider`, the provider list should remain unchanged, and the user should be able to create a new provider immediately.

## Assumptions

The provider/proxy foundation and UI refinements are already implemented. Settings > Models is rendered by `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`, and provider CRUD operations already go through `electronTrpc.modelProviders` calls.

The current form already has a `clearForm` function that resets the provider form to `EMPTY_FORM` and clears the pending model input. The bug is primarily a UX clarity issue: the existing `Clear` button is ambiguous and does not communicate that it exits edit mode.

This plan is intentionally renderer-only. It should not change provider storage, secret handling, local proxy behavior, workspace `.claude/settings.local.json` writing, or tRPC router contracts.

## Open Questions

There are no open product questions. The user reported that after clicking a provider's `Edit` button, the right side shows `Edit provider` and there is no obvious way to exit back to adding a provider/model. The acceptance behavior is therefore explicit: add an obvious exit action and ensure it resets the form without saving.

## Progress

- [x] (2026-04-25 18:30Z) Reviewed `ModelsSettings.tsx` and confirmed the provider form switches title based on `form.id`.
- [x] (2026-04-25 18:30Z) Confirmed `clearForm` already resets form state and pending model input, but the visible button label is only `Clear`.
- [x] (2026-04-25 18:30Z) Created this self-contained ExecPlan for the edit-mode exit UX fix.
- [x] (2026-04-25 18:30Z) Update the provider form header/actions so edit mode has an obvious `Cancel edit` or `New provider` control.
- [x] (2026-04-25 18:30Z) Verified canceling edit mode uses the existing `clearForm` reset path, which clears `form.id` and `newModelId` without provider mutations or refreshes.
- [x] (2026-04-25 18:30Z) Ran desktop typecheck. Focused manual e2e was attempted against the running desktop app, but the automation session remained on the workspace UI after navigating to `/settings/models`, so validation was limited to code inspection plus typecheck.

## Surprises & Discoveries

- Observation: The form already has the correct reset primitive.
  Evidence: `ModelsSettings.tsx` defines `clearForm`, which calls `setForm(EMPTY_FORM)` and `setNewModelId("")`.

- Observation: The UI currently relies on a generic `Clear` button for both add mode and edit mode.
  Evidence: `ModelsSettings.tsx` renders the form title as `form.id ? "Edit provider" : "Add provider"` and always renders `<Button type="button" variant="outline" onClick={clearForm}>Clear</Button>` next to `Save provider`.

## Decision Log

- Decision: Keep this fix in `ModelsSettings.tsx` and avoid tRPC/main-process changes.
  Rationale: The broken behavior is the renderer form state and button labeling, not provider persistence or proxy behavior.
  Date/Author: 2026-04-25 / planning agent.

- Decision: In edit mode, show an explicit exit action labeled `Cancel edit` or `New provider`; in add mode, keep a reset action only if useful and label it as clearing the draft.
  Rationale: The user needs to understand that clicking the action leaves edit mode and returns to adding a new provider. `Clear` is too ambiguous when the title says `Edit provider`.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Canceling edit mode must not save, update, delete, or refetch any provider data.
  Rationale: The action is a local form-state reset only. Provider data should change only when the user clicks `Save provider`, `Delete`, `Fetch models`, or another explicit provider action.
  Date/Author: 2026-04-25 / planning agent.

## Outcomes & Retrospective

Implemented in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. Edit mode now renders a clearly labeled `Cancel edit` button in the provider form header and no longer shows the ambiguous bottom `Clear` action while editing. Add mode keeps a secondary reset action labeled `Clear draft`.

`Cancel edit` calls the existing `clearForm` function, which resets the draft to `EMPTY_FORM` and clears `newModelId`; because `EMPTY_FORM` has no `id`, this exits edit mode and makes the next save create a new provider. The cancel path does not call any provider mutation, proxy mutation, refresh, or toast, so saved providers are not mutated by canceling.

Validation: `cd apps/desktop && bun run typecheck` passed. A focused manual/e2e check was attempted with the running Electron app via desktop automation, but navigation to `#/settings/models` did not leave the active workspace UI in that session, so no reliable UI click-through result was captured.

## Context and Orientation

The affected app is `apps/desktop`, the Electron desktop application. The renderer process is the React UI under `apps/desktop/src/renderer`. Settings > Models is a renderer page that lets users manage global model providers for the local Anthropic-compatible proxy. A provider is a saved upstream model service configuration with a name, protocol, base URL, optional encrypted API key, enabled state, and model IDs.

The key file is `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It defines a `ProviderForm` type and an `EMPTY_FORM` constant. The component stores current draft state in `const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)` and stores the pending chip input in `const [newModelId, setNewModelId] = useState("")`.

The edit flow works like this: each provider card renders an `Edit` button. Clicking it calls `editProvider(provider.id)`, finds the provider in the loaded provider list, and sets `form.id` plus the provider fields. The form title then becomes `Edit provider` because it renders `{form.id ? "Edit provider" : "Add provider"}`. Saving calls `updateMutation` when `form.id` exists, otherwise `createMutation`.

The current reset flow works technically but is unclear. The form renders a `Clear` button next to `Save provider`. That button calls `clearForm`, which resets to `EMPTY_FORM` and clears `newModelId`. However, users do not recognize this as the way to exit `Edit provider`, and the label does not explain the state transition.

This plan involves no IPC changes. IPC means interprocess communication between the renderer UI and Electron main process. In this repo, IPC must use tRPC from `apps/desktop/src/lib/trpc`, but the desired fix only changes local React state and visible labels.

## Plan of Work

First, update `ModelsSettings.tsx` around the provider form header at the place that currently renders only the title. Replace the single title line with a small header row. The left side should continue to show `Edit provider` when `form.id` exists and `Add provider` otherwise. The right side should show an explicit `New provider` or `Cancel edit` button only when `form.id` exists. Clicking it should call `clearForm`. If choosing `Cancel edit`, the button communicates discarding the current edit draft. If choosing `New provider`, the button communicates switching the form back to add mode. Use one label consistently; `Cancel edit` is preferred because it clearly indicates no save will happen.

Next, update the bottom form action row. Keep `Save provider` as the primary submit button. In edit mode, replace the generic `Clear` secondary button with `Cancel edit`, or remove the duplicate bottom cancel if the header already has it. Avoid presenting two different labels that do the same thing. In add mode, either keep a secondary `Clear draft` button or omit it if the form is empty. If kept, label it `Clear draft` rather than `Clear` so it does not sound like it modifies saved providers.

Then, make the reset behavior robust. `clearForm` should continue to reset `form` to `EMPTY_FORM` and `newModelId` to an empty string. It should not call provider mutations or refresh by itself. If the current `EMPTY_FORM` object is reused directly, ensure no mutation path mutates it in place; the current state updates appear to create new objects, so this should remain safe.

Optionally add small helper booleans in the component for readability, such as `const isEditingProvider = Boolean(form.id);`, and use that in titles and action rendering. Do not create a new component or abstraction for this small form change.

Finally, perform manual e2e validation against the running desktop app. Use the existing CPAMeiguo provider if present, but do not print API keys. Verify that clicking `Edit` enters edit mode, clicking `Cancel edit` exits edit mode, the form becomes `Add provider`, model chips/new model input are cleared, and a new provider can be started immediately.

## Concrete Steps

From the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Read the current form file before editing:

    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx

Edit only the provider form UI and local state wiring in that file. The important current locations are:

    clearForm around the top of the component
    editProvider around the top of the component
    the form header that renders Edit provider/Add provider
    the bottom action row that renders Save provider and Clear

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: route/icon generation completes and TypeScript reports no errors.

If focused tests are added for extracted helpers, run them directly. This fix can also be validated without new unit tests because it is a small UI state-label change inside one renderer component.

For manual desktop validation, use the current running dev app if available. If it must be restarted on Apple Silicon, use the known arm64 flow:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run dev'

Expected dev output should include the fixed automation port:

    DevTools listening on ws://127.0.0.1:9322/...
    [window-loader] Successfully loaded: http://localhost:5173/#/workspace/...

## Validation and Acceptance

Settings > Models edit-mode acceptance: navigate to Settings > Models, click `Edit` on an existing provider, and observe the right-side form title says `Edit provider`. The form must show an obvious `Cancel edit` or `New provider` action while editing.

Cancel acceptance: click the exit action. The form title must change to `Add provider`. Provider name, base URL, secret input, enabled checkbox, model chips, and the inline new-model input must return to the default add-provider draft state. No saved provider should be changed and no success toast should appear from canceling.

Add-after-edit acceptance: after canceling edit mode, type a new provider name and base URL. The primary action should create a new provider rather than updating the previously edited provider, because `form.id` has been cleared.

Save acceptance: editing a provider and clicking `Save provider` should still update that provider as before. The new cancel button must not break `Save provider`, `Test`, `Fetch models`, `Delete`, or model chip add/remove behavior.

Validation commands must pass:

    cd apps/desktop
    bun run typecheck

Manual e2e should verify the flow using an existing provider such as CPAMeiguo without printing or exposing API keys.

## Idempotence and Recovery

This change is local to renderer form state. Re-running the implementation is safe because the desired end state is just explicit action labels and a local reset path. If a partial edit leaves both `Clear` and `Cancel edit` visible, simplify to one clear exit action before finishing.

Canceling edit mode must be idempotent. Clicking it once or multiple times should leave the form in the same add-provider draft state. It should not affect the saved provider list, proxy status, encrypted secrets, or workspace settings files.

If the change causes unexpected UI behavior, rollback is limited to `ModelsSettings.tsx`. No database, filesystem migration, provider storage, or proxy recovery is needed.

## Artifacts and Notes

Current problematic UI:

    Edit provider
    [Provider name]
    [Protocol]
    [Base URL]
    [API key saved; enter a new value to replace]
    [model chips]
    [Save provider] [Clear]

Desired edit-mode UI:

    Edit provider                         [Cancel edit]
    [Provider name]
    [Protocol]
    [Base URL]
    [API key saved; enter a new value to replace]
    [model chips]
    [Save provider]

Desired state after cancel:

    Add provider
    [Provider name]
    [Protocol]
    [Base URL]
    [API key]
    No model IDs added yet. Add model IDs manually or fetch them from the provider.
    [Save provider] [Clear draft]

## Interfaces and Dependencies

No new interfaces, APIs, IPC channels, tRPC procedures, dependencies, or packages are needed.

The only existing functions that must remain available are:

    const clearForm = () => {
      setForm(EMPTY_FORM);
      setNewModelId("");
    };

    const saveProvider = async () => {
      if (form.id) await updateMutation.mutateAsync({ ...input, id: form.id });
      else await saveMutation.mutateAsync(input);
    };

At the end of implementation, `clearForm` must still clear `form.id`. That is what ensures a subsequent `Save provider` creates a new provider rather than updating the previously edited provider.

## Revision Notes

2026-04-25 18:30Z: Initial plan created because the Settings > Models provider form could enter `Edit provider` mode without an obvious way for users to return to `Add provider` mode.

2026-04-25 18:30Z: Implemented the renderer-only fix by adding a header `Cancel edit` action wired to `clearForm`, renaming the add-mode reset action to `Clear draft`, and validating with `bun run typecheck` in `apps/desktop`. Manual automation was attempted but could not reach the settings route from the active workspace UI.
