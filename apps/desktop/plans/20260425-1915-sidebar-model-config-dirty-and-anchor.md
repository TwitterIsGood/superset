# Disable no-op workspace model saves and anchor model picker selection

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is `apps/desktop`. Electron interprocess communication, meaning renderer-to-main-process calls, must continue to use tRPC from `apps/desktop/src/lib/trpc`; this plan should not require IPC changes.

## Purpose / Big Picture

After this change, the workspace Settings sidebar's Model Configuration form will behave like a normal settings form: `Save settings` is disabled when nothing has changed, and becomes enabled only after the user changes the Haiku, Sonnet, or Opus model mapping. This prevents users from wondering why they can save an unchanged configuration and avoids no-op writes to `.claude/settings.local.json`.

The custom model dropdown will also open at the currently selected model instead of visually starting at the first model in the list. When a user opens the Haiku, Sonnet, or Opus picker, the selected model should be checked and scrolled into view, so the user can orient themselves immediately before choosing a nearby model.

## Assumptions

The Settings sidebar Model Configuration form lives in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`. Although the sidebar tab is labeled `Settings`, the component path still contains `ModelsPanel` from the original implementation.

The custom dropdown component lives in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/components/GroupedModelPicker/GroupedModelPicker.tsx`. It uses `@superset/ui/popover` and `@superset/ui/command` to render a searchable grouped list.

The saved workspace model settings are read through `electronTrpc.workspaceModelSettings.read.useQuery`. The read result includes the current `.claude/settings.local.json` model values as `haikuModel`, `sonnetModel`, and `opusModel`. If a saved value is missing, the UI currently falls back to the first aggregated model ID.

This plan is renderer-only. It should not change workspace settings tRPC routes, provider storage, local proxy behavior, `.claude/settings.local.json` merge logic, or model aggregation.

## Open Questions

There are no open product questions. The user explicitly asked why `Save settings` is active with no modifications and why the dropdown does not anchor to the corresponding selected model when opened.

## Progress

- [x] (2026-04-25 19:15Z) Reviewed `ModelsPanel.tsx` and confirmed `canSave` only checks workspace/model presence, not whether the draft differs from saved settings.
- [x] (2026-04-25 19:15Z) Reviewed `GroupedModelPicker.tsx` and confirmed selected items render a checkmark but the list does not scroll or focus to the selected item on open.
- [x] (2026-04-25 19:15Z) Reviewed workspace settings read behavior and confirmed missing saved models are represented as absent values, while the UI falls back to the first available model.
- [x] (2026-04-25 19:15Z) Created this ExecPlan for dirty-state save disabling and selected-model anchoring.
- [x] (2026-04-25 19:15Z) Implemented dirty-state comparison in `ModelsPanel.tsx` and disabled `Save settings` when the draft matches the effective saved values.
- [x] (2026-04-25 19:15Z) Skipped extra no-change helper text to keep the compact sidebar minimal; the disabled button provides the requested state.
- [x] (2026-04-25 19:15Z) Updated `GroupedModelPicker.tsx` so opening the dropdown scrolls the selected model into view.
- [x] (2026-04-25 19:15Z) Ran desktop typecheck. No focused tests were added because no helper logic was extracted. Manual e2e was not practical in this headless agent session.

## Surprises & Discoveries

- Observation: `Save settings` is currently active whenever three model values and a workspace ID exist.
  Evidence: `ModelsPanel.tsx` computes `const canSave = !!workspaceId && !!haikuModel && !!sonnetModel && !!opusModel;`, then disables the button only with `disabled={!canSave || saveMutation.isPending}`.

- Observation: The form already derives displayed draft values from saved settings plus a default model fallback.
  Evidence: `ModelsPanel.tsx` sets `haikuModel`, `sonnetModel`, and `opusModel` in an effect using `settings?.haikuModel || defaultModel`, `settings?.sonnetModel || defaultModel`, and `settings?.opusModel || defaultModel`.

- Observation: The custom picker marks the selected model but does not anchor the scroll position to it.
  Evidence: `GroupedModelPicker.tsx` renders a `CheckIcon` when `model === value`, but `CommandList` has no ref/effect and `CommandItem` has no selected-item ref used for scrolling.

## Decision Log

- Decision: Compare against the same effective saved values that populate the form, not only raw settings values.
  Rationale: If `.claude/settings.local.json` lacks a model value and the UI falls back to `defaultModel`, the initial draft should count as unchanged. Otherwise the form would still look dirty immediately after loading missing settings.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Disable `Save settings` until the draft differs from effective saved values.
  Rationale: This matches common settings UI behavior and the user's expectation that an unchanged form should not have an active save button.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Anchor by scrolling the selected `CommandItem` into view when the popover opens.
  Rationale: The UI already has a searchable list and checkmark. Scrolling the selected item into view is the minimal change that fixes orientation without replacing the command component or changing grouping/sorting behavior.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Keep the picker search input empty on open and avoid auto-filtering to the selected model.
  Rationale: The user asked for anchoring, not search prefill. Prefilling search would hide surrounding models and make nearby selection harder.
  Date/Author: 2026-04-25 / planning agent.

## Outcomes & Retrospective

Implemented renderer-only changes in `ModelsPanel.tsx` and `GroupedModelPicker.tsx`. `Save settings` now requires a workspace ID, all three draft model values, and at least one Haiku/Sonnet/Opus draft value to differ from the corresponding effective saved value (`settings?.x || defaultModel`). The existing save mutation payload, toast handling, and `workspaceModelSettings.read` invalidation behavior are unchanged.

The grouped model picker now keeps search, grouping, and sorting unchanged while scrolling the selected checked `CommandItem` into view on popover open via a local ref and `requestAnimationFrame`.

Validation: `cd apps/desktop && bun run typecheck` passed. Focused unit tests were not added because no helper logic was extracted. Manual e2e validation was not practical in this headless agent session; the expected manual check remains to open the desktop Settings sidebar, verify no-change save disabling, change and revert a picker, and confirm the picker opens with the checked selected model visible.

## Context and Orientation

The affected app is `apps/desktop`, the Electron desktop app. The renderer process is the React UI under `apps/desktop/src/renderer`. The right sidebar in a workspace has a `Settings` tab that currently renders the model configuration UI from `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`.

The Model Configuration form lets users choose three Claude Code model mappings: Haiku, Sonnet, and Opus. These names correspond to Claude Code's model environment variables in the workspace `.claude/settings.local.json`: `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and `ANTHROPIC_DEFAULT_OPUS_MODEL`. Saving calls `electronTrpc.workspaceModelSettings.save.useMutation`, which writes those model values plus proxy settings through the desktop tRPC layer.

The current form state is local React state: `haikuModel`, `sonnetModel`, and `opusModel`. An effect initializes those values from `settings?.haikuModel`, `settings?.sonnetModel`, and `settings?.opusModel`, falling back to `defaultModel`, which is the first aggregated provider model ID. `canSave` currently only checks that a workspace and all three model strings exist.

The custom dropdown component is `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/components/GroupedModelPicker/GroupedModelPicker.tsx`. It groups model IDs with `groupModelIds`, renders a popover, and shows a check icon beside the selected model. The list is grouped and sorted, but when opened, it starts at the top of the list rather than scrolling to the selected item.

This plan involves no IPC changes. IPC means interprocess communication between the renderer UI and Electron main process. In this repo, IPC must use tRPC from `apps/desktop/src/lib/trpc`. The existing workspace settings read/save tRPC calls remain unchanged; this plan only changes renderer state derivation and dropdown scroll behavior.

## Plan of Work

First, update dirty-state logic in `ModelsPanel.tsx`. Derive effective saved values near the current `defaultModel` and local state. The effective saved Haiku value should be `settings?.haikuModel || defaultModel`; Sonnet and Opus should follow the same pattern. These effective values should match the values used by the existing `useEffect` that initializes the local draft.

Then derive `hasModelSettingsChanges` by comparing the current draft values to those effective saved values:

    const savedHaikuModel = settings?.haikuModel || defaultModel;
    const savedSonnetModel = settings?.sonnetModel || defaultModel;
    const savedOpusModel = settings?.opusModel || defaultModel;
    const hasModelSettingsChanges =
      haikuModel !== savedHaikuModel ||
      sonnetModel !== savedSonnetModel ||
      opusModel !== savedOpusModel;

Use this value in the save button state. The button should be enabled only when `workspaceId`, all three draft model values, and `hasModelSettingsChanges` are truthy, and no save mutation is pending. Keep the existing proxy readiness warning separate; the current behavior can still allow saving once the model/proxy state is valid according to existing logic unless implementation finds the existing code already disables for proxy issues.

Optionally add a muted helper line under the button when `!hasModelSettingsChanges` and all models are selected, such as `No changes to save.` Keep it short and do not add a new validation framework. If this makes the compact sidebar too noisy, disabling the button is enough.

Next, update `GroupedModelPicker.tsx` to scroll the selected model into view when the popover opens. Import `useEffect` and `useRef` from React. Create a `selectedItemRef` with `useRef<HTMLDivElement | null>(null)` or the element type TypeScript accepts for the command item. Attach the ref only to the `CommandItem` whose `model === value`. When `open` becomes true, schedule a scroll with `requestAnimationFrame` so it runs after the popover content is mounted:

    useEffect(() => {
      if (!open) return;
      const frame = requestAnimationFrame(() => {
        selectedItemRef.current?.scrollIntoView({ block: "center" });
      });
      return () => cancelAnimationFrame(frame);
    }, [open, value]);

If `CommandItem` does not accept a normal `ref` because of its wrapper type, use a `data-selected-model` attribute plus a ref on the `CommandList`, then query within the list for `[data-selected-model="true"]` and call `scrollIntoView`. Do not use global `document.querySelector`, because there can be three pickers on the page.

Keep search behavior unchanged. Do not prefill search text, do not change grouping, and do not alter `groupModelIds` unless tests reveal a related bug.

Finally, validate. Use typecheck and manual e2e. In the running desktop app, open the workspace Settings sidebar, observe `Save settings` disabled before changes, change one picker and observe it enabled, change it back and observe it disabled again. Open a picker whose selected value is not the first visible model; the list should scroll so the selected checked item is visible near the middle.

## Concrete Steps

From the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Read the relevant files before editing:

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/components/GroupedModelPicker/GroupedModelPicker.tsx
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/utils/groupModelIds.ts

Implement the dirty-state logic in `ModelsPanel.tsx`, then implement selected-item scroll anchoring in `GroupedModelPicker.tsx`.

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: route/icon generation completes and TypeScript reports no errors.

If helper functions are extracted for dirty-state comparison, add or update focused colocated tests and run them directly. If no helpers are extracted, typecheck plus manual e2e are sufficient for this renderer-only behavior.

For manual desktop validation, use the current running dev app if available. If it must be restarted on Apple Silicon, use the known arm64 flow:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run dev'

Expected dev output should include the fixed automation port:

    DevTools listening on ws://127.0.0.1:9322/...
    [window-loader] Successfully loaded: http://localhost:5173/#/workspace/...

## Validation and Acceptance

No-change save acceptance: open a workspace with existing or defaulted model settings. After the Model Configuration form loads, `Save settings` is disabled if Haiku, Sonnet, and Opus match the effective saved values. It should not be active just because all three model values are present.

Dirty-state acceptance: change Haiku, Sonnet, or Opus to a different model. `Save settings` becomes enabled. Change the value back to the effective saved value and `Save settings` becomes disabled again. After saving a changed configuration, the read query invalidates as before; once the saved values reload and match the draft, `Save settings` becomes disabled again.

Fallback acceptance: if `.claude/settings.local.json` has no saved model values and the UI initializes all three values to `defaultModel`, the form is not dirty immediately. Changing any value makes it dirty.

Dropdown anchoring acceptance: open a model picker when the selected model is not the first model in the grouped list. The popover opens with the selected, checked item scrolled into view. The search field remains usable and empty by default. Group headings and natural descending sort remain unchanged.

Save behavior acceptance: when `Save settings` is enabled and clicked, it still calls the existing save mutation with `workspaceId`, `haikuModel`, `sonnetModel`, and `opusModel`, still invalidates `workspaceModelSettings.read`, and still shows the same success/error toast behavior.

Validation command must pass:

    cd apps/desktop
    bun run typecheck

Manual e2e should verify the flow using the current workspace and existing provider models without printing or exposing API keys.

## Idempotence and Recovery

This change is local to renderer UI state. Reapplying it is safe because it derives `hasModelSettingsChanges` from existing query data and form state, and it adds a local scroll effect inside the picker.

If settings data reloads while the user is editing, the existing effect already resets draft values from settings/defaultModel. This plan does not change that behavior. If future behavior should preserve unsaved edits across background reloads, that should be a separate plan.

If the selected-item ref approach fails because `CommandItem` does not forward refs, switch to the scoped `CommandList` ref plus `data-selected-model` query fallback described in the Plan of Work. Avoid global DOM queries.

Rollback is limited to `ModelsPanel.tsx` and `GroupedModelPicker.tsx`. No provider storage, proxy process, workspace settings files, or tRPC routes need recovery.

## Artifacts and Notes

Current save logic:

    const canSave = !!workspaceId && !!haikuModel && !!sonnetModel && !!opusModel;
    disabled={!canSave || saveMutation.isPending}

Desired save logic concept:

    const savedHaikuModel = settings?.haikuModel || defaultModel;
    const savedSonnetModel = settings?.sonnetModel || defaultModel;
    const savedOpusModel = settings?.opusModel || defaultModel;
    const hasModelSettingsChanges =
      haikuModel !== savedHaikuModel ||
      sonnetModel !== savedSonnetModel ||
      opusModel !== savedOpusModel;
    const canSave =
      !!workspaceId &&
      !!haikuModel &&
      !!sonnetModel &&
      !!opusModel &&
      hasModelSettingsChanges;

Current picker behavior:

    The selected model has a checkmark, but opening the popover starts at the top of the list.

Desired picker behavior:

    Opening the popover scrolls the selected checked model into view without changing search text or grouping.

## Interfaces and Dependencies

No new interfaces, APIs, IPC channels, tRPC procedures, dependencies, or packages are needed.

Use existing React APIs in `GroupedModelPicker.tsx`:

    import { useEffect, useMemo, useRef, useState } from "react";

The picker should continue to expose the same props:

    interface GroupedModelPickerProps {
      label: string;
      value: string;
      models: string[];
      onChange: (model: string) => void;
      disabled?: boolean;
    }

The workspace save mutation interface remains unchanged:

    await saveMutation.mutateAsync({
      workspaceId,
      haikuModel,
      sonnetModel,
      opusModel,
    });

## Revision Notes

2026-04-25 19:15Z: Initial plan created because the user reported two Settings sidebar Model Configuration issues: `Save settings` is active with no changes, and model picker dropdowns open at the first model instead of anchoring to the selected model.

2026-04-25 19:15Z: Implemented the renderer-only dirty-state and picker anchoring changes, skipped optional helper text to keep the sidebar minimal, and validated with `cd apps/desktop && bun run typecheck`.
