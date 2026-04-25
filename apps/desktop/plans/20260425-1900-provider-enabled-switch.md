# Replace provider enabled checkbox with a switch

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is `apps/desktop`. Electron interprocess communication, meaning renderer-to-main-process calls, must continue to use tRPC from `apps/desktop/src/lib/trpc`; this plan should not require IPC changes.

## Purpose / Big Picture

After this change, the Settings > Models provider form will use the same switch-style control used elsewhere in the desktop settings UI for enabling or disabling a provider. Users adding or editing a provider will see a modern on/off switch instead of a raw checkbox, making the form feel consistent with other settings screens and making the provider enabled state easier to understand.

The observable result is simple: open Settings > Models, look at the right-side provider form in both `Add provider` and `Edit provider` modes, and the `Enabled` control is a switch. Toggling it still changes the same `form.enabled` boolean, still participates in edit-mode dirty detection, and saving still sends the same `enabled` value through the existing provider create/update tRPC calls.

## Assumptions

Settings > Models is rendered by `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. The provider form currently stores `enabled` as a boolean in `form.enabled`. The add form defaults `enabled` to `true` through `EMPTY_FORM`.

The current form already has mode-specific provider actions: `Add provider` in add mode, `Update provider` in edit mode, `Cancel edit` in edit mode, and edit-mode no-op save prevention. This plan should preserve those behaviors.

The repository already has a shared switch component at `packages/ui/src/components/ui/switch.tsx`, exported as `@superset/ui/switch`. Existing desktop settings pages import `Switch` from `@superset/ui/switch` and pair it with a label/description in a `flex items-center justify-between` row. This plan should follow that pattern.

This plan is renderer-only. It should not change provider storage, encrypted secret handling, local proxy behavior, workspace `.claude/settings.local.json` writing, or tRPC router contracts.

## Open Questions

There are no open product questions. The user explicitly asked to make the enabled control in both edit-provider and add-provider forms a switch.

## Progress

- [x] (2026-04-25 19:00Z) Reviewed `ModelsSettings.tsx` and confirmed the provider form currently renders `Enabled` as a native checkbox.
- [x] (2026-04-25 19:00Z) Confirmed `@superset/ui/switch` exists and is already used in desktop settings pages.
- [x] (2026-04-25 19:00Z) Confirmed the existing provider form stores enabled state as `form.enabled`, so no data-model change is needed.
- [x] (2026-04-25 19:00Z) Created this ExecPlan for replacing the checkbox with a switch.
- [x] (2026-04-25 19:00Z) Replaced the native checkbox with `Switch` in `ModelsSettings.tsx`.
- [x] (2026-04-25 19:00Z) Verified add mode defaults the switch on in the running desktop renderer.
- [ ] Verify edit mode reflects the selected provider's saved enabled value and toggling the switch marks edit mode dirty.
- [x] (2026-04-25 19:00Z) Ran desktop typecheck successfully.
- [x] (2026-04-25 19:00Z) Performed focused manual validation of add mode in the running desktop app.

## Surprises & Discoveries

- Observation: The shared UI package already provides the desired switch component.
  Evidence: `packages/ui/src/components/ui/switch.tsx` exports `Switch`, a Radix Switch wrapper with Superset styling.

- Observation: Desktop settings screens already use the switch pattern the provider form should match.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx` imports `Switch` from `@superset/ui/switch` and renders it in a row with label text and a short description.

- Observation: The provider form currently uses a raw checkbox for enabled state.
  Evidence: `ModelsSettings.tsx` renders `<input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />` followed by `Enabled`.

## Decision Log

- Decision: Use `@superset/ui/switch` instead of creating a custom switch.
  Rationale: The app already has a shared switch primitive with existing styling and behavior. Reusing it keeps the provider form consistent with other desktop settings.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Keep the existing `form.enabled` boolean and existing save payload unchanged.
  Rationale: This is a presentation/control change only. Provider create/update APIs already accept `enabled`, and existing provider cards already display enabled/disabled status.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Render the enabled switch as a settings row with label and short description.
  Rationale: A switch benefits from clear explanatory copy. A row matching existing settings pages makes it obvious that the switch controls whether this provider participates in the model proxy.
  Date/Author: 2026-04-25 / planning agent.

## Outcomes & Retrospective

Implemented. `ModelsSettings.tsx` now imports `Switch` from `@superset/ui/switch` and renders the provider enabled state as a settings-style switch row with label text and helper copy. The switch is bound directly to the existing `form.enabled` boolean through `checked={form.enabled}` and `onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}`. The existing `EMPTY_FORM`, `editProvider`, dirty detection, cancel behavior, and create/update payloads were left unchanged, so add-provider and edit-provider modes share the same form control and data flow.

Validation: `cd apps/desktop && bun run typecheck` passed. Focused manual validation was performed in the running desktop app at Settings > Models: the add-provider form rendered a role=`switch` control for `Enabled`, it was checked by default, and clicking it changed `aria-checked`/`data-state` from checked to unchecked. Edit-mode manual validation was not practical in the current runtime because the app had no saved providers available (`No providers yet`) and creating a real provider would require test provider details/API-key handling outside this small UI-only change.

## Context and Orientation

The affected app is `apps/desktop`, the Electron desktop app. The renderer process is the React UI under `apps/desktop/src/renderer`. Settings > Models is a renderer page that manages global model providers for the local Anthropic-compatible proxy. A provider is a saved upstream model service configuration with a name, protocol, base URL, optional proxy URL, optional encrypted API key, enabled state, and model IDs.

The key file is `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`. It defines a `ProviderForm` type with `enabled: boolean` and an `EMPTY_FORM` constant with `enabled: true`. The component sets `form.enabled` from a saved provider when `editProvider` runs, and includes `enabled: form.enabled` in the provider create/update input sent to existing tRPC mutations.

The current enabled control is a native checkbox in the provider form. It works functionally but does not match the surrounding settings UI. Existing settings screens, such as `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx`, use the shared `Switch` component from `@superset/ui/switch` for boolean settings.

This plan involves no IPC changes. IPC means interprocess communication between the renderer UI and Electron main process. In this repo, IPC must use tRPC from `apps/desktop/src/lib/trpc`. The provider create/update calls already use tRPC through `electronTrpc.modelProviders`; this plan only changes the React control that edits the local `form.enabled` boolean.

## Plan of Work

First, import the shared switch component in `ModelsSettings.tsx`:

    import { Switch } from "@superset/ui/switch";

If the implementation wants an accessible label component and it is already available in the UI package, it may also import `Label` from `@superset/ui/label`; otherwise a normal text label beside the switch is acceptable as long as the switch has an `id` and accessible label text.

Next, replace the current native checkbox block with a settings-style row. The current block is near the provider form inputs and looks like this:

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
      Enabled
    </label>

Replace it with a row shaped like the existing settings screens:

    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="space-y-0.5">
        <label htmlFor="provider-enabled" className="text-sm font-medium">Enabled</label>
        <p className="text-xs text-muted-foreground">Use this provider in the local model proxy.</p>
      </div>
      <Switch
        id="provider-enabled"
        checked={form.enabled}
        onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
      />
    </div>

If `id="provider-enabled"` could be duplicated across multiple rendered forms in the future, use a more specific id such as `provider-enabled-switch`. Only one provider form is currently rendered, so a static id is acceptable.

Then verify the switch participates in existing form behavior. In add mode, `EMPTY_FORM.enabled` should keep the switch checked by default. In edit mode, `editProvider` should keep setting `enabled: provider.enabled`, so the switch reflects the saved provider. The existing dirty detection already compares `form.enabled !== editingProvider.enabled`, so toggling the switch should enable `Update provider` in edit mode.

Do not change provider card badges, provider create/update mutation payloads, proxy status, provider storage, or model chip behavior.

## Concrete Steps

From the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Read the current form file before editing:

    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx

Read the shared switch and one settings example if needed:

    packages/ui/src/components/ui/switch.tsx
    apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx

Edit only `ModelsSettings.tsx` unless TypeScript reveals an import/export issue. Add the `Switch` import and replace the checkbox with the switch row.

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: route/icon generation completes and TypeScript reports no errors.

For manual desktop validation, use the current running dev app if available. If it must be restarted on Apple Silicon, use the known arm64 flow:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run dev'

Expected dev output should include the fixed automation port:

    DevTools listening on ws://127.0.0.1:9322/...
    [window-loader] Successfully loaded: http://localhost:5173/#/workspace/...

## Validation and Acceptance

Add-mode acceptance: open Settings > Models with no provider selected for editing. The form title says `Add provider`. The enabled control is a switch, not a native checkbox. The switch is checked by default because new providers default to enabled. Toggling it off makes the provider draft disabled; saving a valid new provider sends `enabled: false` through the existing create mutation.

Edit-mode acceptance: click `Edit` on an existing provider. The form title says `Edit provider`. The enabled control is a switch, not a native checkbox. The switch reflects the selected provider's saved enabled state. Toggling it changes `form.enabled` and enables `Update provider` because enabled state is part of dirty detection.

Cancel acceptance: toggling the switch while editing and then clicking `Cancel edit` returns the form to add mode, with the switch checked again from `EMPTY_FORM.enabled`. No provider mutation or toast happens from canceling.

Save acceptance: toggling the switch and clicking `Update provider` still updates the existing provider. After refresh, the provider card's `Enabled` or `Disabled` badge reflects the saved value. Other actions such as model chip editing, `Test`, `Fetch models`, and `Delete` continue to work.

Validation command must pass:

    cd apps/desktop
    bun run typecheck

Manual e2e should verify the flow using an existing provider such as CPAMeiguo without printing or exposing API keys.

## Idempotence and Recovery

This change is local to renderer UI state. Reapplying it should be safe because it only swaps one boolean input control for the shared switch component. It does not add persistent state, migrations, or new dependencies.

If the switch import is wrong, TypeScript will fail. Recovery is to check existing imports in desktop settings screens and use the same path, `@superset/ui/switch`.

If the switch does not update the form, check that it uses `onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}` rather than native `onChange`, because Radix Switch uses `onCheckedChange`.

Rollback is limited to `ModelsSettings.tsx`: remove the `Switch` import and restore the native checkbox. No provider storage, proxy process, or workspace settings file needs recovery.

## Artifacts and Notes

Current UI:

    [checkbox] Enabled

Desired UI:

    Enabled                                      [switch on/off]
    Use this provider in the local model proxy.

The switch should preserve the existing data flow:

    checked={form.enabled}
    onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}

## Interfaces and Dependencies

Use the existing shared UI dependency:

    import { Switch } from "@superset/ui/switch";

No new interfaces, APIs, IPC channels, tRPC procedures, dependencies, or packages are needed.

The existing `ProviderForm` type remains unchanged:

    type ProviderForm = {
      enabled: boolean;
    };

The existing create/update input remains unchanged:

    const input = {
      enabled: form.enabled,
    };

## Revision Notes

2026-04-25 19:00Z: Initial plan created because the user requested replacing the enabled checkbox in both add-provider and edit-provider forms with a switch control.

2026-04-25 19:00Z: Implemented the renderer-only `Switch` replacement in `ModelsSettings.tsx`. Validation passed with `cd apps/desktop && bun run typecheck`; focused add-mode manual validation passed in the running desktop app. Edit-mode behavior was validated by code path preservation, but not interactively, because the current app instance had no saved providers to edit.
