# Refine workspace model settings UI and provider model editing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from repository `AGENTS.md`, desktop `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is `apps/desktop`. Electron interprocess communication, meaning renderer-to-main-process calls, must continue to use tRPC from `apps/desktop/src/lib/trpc`.

## Purpose / Big Picture

After this change, the right sidebar's model configuration area will feel like a compact Settings panel rather than a technical proxy/debug panel. Users will not see proxy URLs or file paths during normal use. They will only see a simple searchable “Model Configuration” form with three model pickers for Haiku, Sonnet, and Opus. Saving the form silently writes the current workspace's `.claude/settings.local.json` with the required proxy URL, token, and model env vars.

Settings > Models will also become easier to use. Provider model IDs will be edited as tag chips with delete buttons and a small inline Add field instead of a large textarea. This reduces visual weight and matches the user's mental model that each model name is a discrete item.

## Assumptions

The already-implemented provider/proxy foundation remains in place. This plan refines UI and small helper behavior only; it does not replace the model proxy, provider storage, or workspace settings tRPC APIs.

The current right sidebar tab labeled `Models` should be renamed to `Settings`, because the panel is becoming a workspace settings surface. If there are other workspace settings later, they can be added to this tab, but this first refinement only includes model configuration.

The app already has reusable UI primitives for a custom searchable dropdown. Use `@superset/ui` Command and Popover primitives, following `apps/desktop/src/renderer/routes/_authenticated/settings/appearance/components/AppearanceSettings/components/FontSettingSection/components/FontFamilyCombobox/FontFamilyCombobox.tsx`, rather than native `<select>`.

Model grouping should use the model-name prefix before the first hyphen. For example, `gpt-5.5` and `gpt-5.3-codex` are grouped under `gpt`; `claude-sonnet-4-6` is grouped under `claude`; `deepseek-v4-pro` is grouped under `deepseek`. This is intentionally simple and local to the UI.

Within each prefix group, model names should sort in descending natural order. The goal is that newer-looking version names like `gpt-5.5` appear above older-looking names like `gpt-5.3-codex`. Use `localeCompare` with `{ numeric: true }` and reverse order unless implementation discovery finds an existing natural-sort helper.

## Open Questions

There are no open product questions. The user explicitly requested a Settings tab, minimal model configuration form, no proxy/file-path noise in normal use, provider-empty prompt to jump to Settings > Models, grouped searchable model dropdowns, and tag-style provider model editing.

## Progress

- [x] (2026-04-25 17:30Z) Reviewed current implementation state after provider/proxy feature landed.
- [x] (2026-04-25 17:30Z) Confirmed the app has Command and Popover UI primitives and an existing combobox example in `FontFamilyCombobox.tsx`.
- [x] (2026-04-25 17:30Z) Confirmed current `ModelsPanel.tsx` exposes proxy URL and settings file path, which this plan will hide for normal users.
- [x] (2026-04-25 17:30Z) Confirmed current `ModelsSettings.tsx` edits provider models through a textarea, which this plan will replace with tag chips and an inline Add input.
- [x] (2026-04-25 18:10Z) Rename the right sidebar tab from Models to Settings and update persisted tab handling safely.
- [x] (2026-04-25 18:10Z) Replace workspace Models panel content with a minimal searchable Model Configuration form.
- [x] (2026-04-25 18:10Z) Add provider-empty state with a call to open Settings > Models.
- [x] (2026-04-25 18:10Z) Add grouped searchable model picker with selected-model check state and natural descending group sort.
- [x] (2026-04-25 18:10Z) Replace provider model textarea with chip/tag list plus inline Add model input.
- [x] (2026-04-25 18:10Z) Add focused tests for model grouping/sorting and provider model list editing helpers.
- [x] (2026-04-25 18:25Z) Run typecheck, focused tests, and manual desktop e2e.

## Surprises & Discoveries

- Observation: `@superset/ui` already exposes `Command`, `CommandInput`, `CommandGroup`, `CommandItem`, `CommandList`, and `Popover`, which are enough to build a custom searchable grouped dropdown.
  Evidence: `packages/ui/src/components/ui/command.tsx` and `packages/ui/src/components/ui/popover.tsx` exist and are imported by the desktop font combobox.

- Observation: The desktop app already has a combobox implementation that combines Popover and Command and shows the selected item with a checkmark.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/appearance/components/AppearanceSettings/components/FontSettingSection/components/FontFamilyCombobox/FontFamilyCombobox.tsx` uses `Popover`, `Command`, `CommandInput`, `CommandGroup`, `CommandItem`, and `CheckIcon`.

- Observation: The current workspace model panel shows implementation details the user does not want in the main UI.
  Evidence: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx` renders “Proxy URL”, the proxy base URL, settings-file creation/update text, and the full `.claude/settings.local.json` path.

- Observation: The current provider form uses a textarea for model IDs.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` stores `modelsText` and renders `Textarea placeholder="Model IDs, one per line"`.

- Observation: Root lint is currently blocked by unrelated local environment/setup issues.
  Evidence: `bun run lint` fails because `.claude/worktrees/agent-a3d92e7b/biome.jsonc` is detected as a nested Biome root config and `scripts/check-git-ref-strings.sh` cannot find `rg` on PATH.

## Decision Log

- Decision: Rename the workspace right sidebar tab to `Settings` while keeping the underlying feature focused on workspace model configuration for this iteration.
  Rationale: The user said the current Models panel should become Settings because users do not care about proxy URL or the settings-file implementation detail.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Hide proxy URL and settings-file path from the normal workspace panel.
  Rationale: The app should update `.claude/settings.local.json` invisibly; proxy/file details are implementation details unless there is a problem.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Show a provider-empty prompt only when no providers or no aggregated models are configured, with an action that navigates to Settings > Models.
  Rationale: The user only wants an interruption when there is no service provider configuration to choose from.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Use custom Command/Popover dropdowns for model selection rather than native selects.
  Rationale: The user wants a better contact-list-like selector, and the codebase already has the necessary UI primitives and combobox example.
  Date/Author: 2026-04-25 / planning agent.

- Decision: Group model names by the prefix before the first hyphen and sort models inside each group descending with numeric-aware string comparison.
  Rationale: This matches the user's model-vendor grouping request and keeps newer version names like `gpt-5.5` above older ones like `gpt-5.3-codex`.
  Date/Author: 2026-04-25 / user and planning agent.

- Decision: Replace provider model textarea with chips and an inline Add input.
  Rationale: The user said textarea is visually and cognitively heavy for discrete model IDs; chips make removal and scanning easier.
  Date/Author: 2026-04-25 / user and planning agent.

## Outcomes & Retrospective

Implemented. The right sidebar now shows a `Settings` tab with a compact workspace `Model Configuration` section, hides proxy URL and `.claude/settings.local.json` details in the normal workspace panel, and provides a Settings > Models action when no aggregated models are available or the local model service needs attention. Haiku, Sonnet, and Opus now use a Command/Popover grouped searchable picker with model IDs grouped by prefix and naturally sorted descending inside each group. Settings > Models now edits provider model IDs as removable chips with an inline Add input and Enter-to-add behavior.

Validation completed on 2026-04-25: `bun test apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel`, `bun test apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/utils.test.ts`, and `cd apps/desktop && bun run typecheck` passed. Manual desktop automation on the running app verified Settings > Models shows model chips for CPAMeiguo, the right sidebar tab label is `Settings`, the workspace panel shows Model Configuration without proxy/file-path text, grouped picker text contains `gpt-5.5` before `gpt-5.3-codex`, and Save settings succeeds. Root `bun run lint` is blocked by unrelated local issues noted in Surprises & Discoveries.

## Context and Orientation

The affected app is `apps/desktop`, the Electron desktop app. The renderer process is the React UI under `apps/desktop/src/renderer`. The main process owns local provider storage, proxy lifecycle, and filesystem writes, exposed through tRPC routers under `apps/desktop/src/lib/trpc/routers`. tRPC is the type-safe IPC path used in this repository for renderer-to-main communication.

The existing provider/proxy feature added shared model types in `apps/desktop/src/shared/model-proxy.ts`, model proxy tRPC routes under `apps/desktop/src/lib/trpc/routers/model-proxy/`, a Settings > Models provider form in `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`, and a workspace right sidebar panel in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`.

The current workspace panel is too technical. It displays proxy URL and `.claude/settings.local.json` file status. The desired behavior is that saving is invisible and only the human decision remains: choose three model names for Haiku, Sonnet, and Opus. The tRPC `workspaceModelSettings.save` API should still write all required keys, including `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`, but the UI should not foreground those details.

The right sidebar tab currently has `Changes`, `Files`, and `Models`. The tab state is persisted through `apps/desktop/src/renderer/stores/sidebar-state.ts`. Because persisted local state may still contain the old string value `models`, implementation should safely map old `models` state to the new Settings tab instead of leaving users with an invalid tab.

Settings > Models remains the global provider management surface. Its model list editor should become a chip/tag list. A chip is a small rounded label with an `x` button that removes the model ID from the provider form. Adding a model should use one horizontal input and an Add button.

## Plan of Work

First, update right sidebar tab naming. In `apps/desktop/src/renderer/stores/sidebar-state.ts`, rename or add the enum value for the workspace model/settings tab. Prefer `RightSidebarTab.Settings = "settings"`. If any persisted state or old code may still set `"models"`, add a small migration or normalization in the store so old persisted `models` becomes `settings`. Then update `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx` to render the tab label `Settings`, choose an appropriate settings icon already imported or available, and show the existing model settings panel under that tab.

Next, rename or wrap the panel component so the UI reads as workspace settings. Either rename `ModelsPanel` to `SettingsPanel` if that is a manageable file move, or keep the file name for a smaller diff while changing rendered text to “Settings” and “Model Configuration”. Do not expose proxy URL, settings-file path, or “Existing settings file will be updated” text in the normal panel.

Then implement a reusable grouped model picker component colocated with the panel, for example `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/SettingsPanel/components/GroupedModelPicker/GroupedModelPicker.tsx` or the equivalent path if the panel file is not renamed. The picker should use `@superset/ui/button`, `@superset/ui/popover`, and `@superset/ui/command` like `FontFamilyCombobox.tsx`. It should show the selected model in the trigger, open to a searchable command list, group models by prefix before the first hyphen, sort groups alphabetically, sort models inside each group descending with numeric-aware comparison, and show a checkmark beside the currently selected model.

Add a small pure utility for grouping and sorting model IDs, colocated with the picker or panel. It should accept a string array and return groups shaped like `{ prefix: string; models: string[] }`. It must deduplicate model IDs. Add tests for examples such as `gpt-5.5`, `gpt-5.3-codex`, `claude-opus-4-6`, and `deepseek-v4-pro`.

Update the workspace panel behavior. It should query `modelProviders.listAggregatedModels`, `modelProxy.status`, and `workspaceModelSettings.read` as today. If no aggregated models are available, show a compact empty state explaining that no model providers are configured and provide a button that navigates to `/settings/models`. If proxy status is stopped or there is no base URL/token state, show a compact warning that the local model service is not initialized and provide a Settings > Models button. If models exist, render a single section titled “Model Configuration” with three grouped model pickers labeled Haiku, Sonnet, and Opus and a Save button. Saving must still call `workspaceModelSettings.save`, which writes `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `API_TIMEOUT_MS`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, and the three model env vars. After save, invalidate the read query and show a short success toast.

Update Settings > Models provider model editing. Replace `modelsText` in `ModelsSettings.tsx` with a `models: string[]` form field and a `newModelId` local field or reducer. When editing an existing provider, populate `models` from `provider.models.map((model) => model.id)`. Render current models as `Badge` or rounded chip buttons, each with a small `X` icon button to remove it. Render an inline input and Add button. Pressing Enter in the input should add the model without submitting the whole provider form. Add should trim whitespace, ignore empty values, and avoid duplicates. Saving the provider should send the `models` array directly.

Keep provider fetch behavior compatible. When the user clicks Fetch Models, fetched models should replace or merge into the provider's saved model list according to the current main-process behavior. After refresh, clicking Edit should show fetched models as chips. Do not expose provider API secrets in the UI.

Finally, run validation and do a manual e2e. Because this is desktop work on Apple Silicon, validate with the known arm64 startup command or the existing running desktop dev process using `DESKTOP_AUTOMATION_PORT=9322`. Use MCP/puppeteer to verify: Settings > Models can add CPAMeiguo with a model chip list, Fetch Models updates chips, the right sidebar Settings tab shows grouped searchable pickers, saving writes workspace settings, and no proxy URL/settings path is visible in the normal workspace panel.

## Concrete Steps

From the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Read the current files before editing:

    apps/desktop/src/renderer/stores/sidebar-state.ts
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx
    apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx
    apps/desktop/src/renderer/routes/_authenticated/settings/appearance/components/AppearanceSettings/components/FontSettingSection/components/FontFamilyCombobox/FontFamilyCombobox.tsx
    packages/ui/src/components/ui/command.tsx
    packages/ui/src/components/ui/popover.tsx

Implement the tab rename and safe persisted-state handling. Then implement the grouped model picker and utility tests. Then refactor the workspace panel UI. Then refactor Settings > Models provider model editing.

Run focused tests:

    bun test apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel

If the final test paths differ because the panel is renamed, run the colocated test files directly.

Run desktop typecheck:

    cd apps/desktop
    bun run typecheck
    # Expected: route/icon generation completes and TypeScript reports no errors.

Run feature-focused e2e against the current dev app or restart it with:

    cd apps/desktop
    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun run dev'

Expected dev output should include:

    DevTools listening on ws://127.0.0.1:9322/...
    [window-loader] Successfully loaded: http://localhost:5173/#/workspace/...

## Validation and Acceptance

Workspace sidebar acceptance: the right sidebar tab label is `Settings`, not `Models`. Opening it shows a compact panel with a title such as “Settings” and a section titled “Model Configuration”. The panel does not show `Proxy URL`, the proxy base URL, `.claude/settings.local.json`, or “Existing settings file will be updated” during normal configured use.

Provider-empty acceptance: when there are no configured providers or no aggregated models, the Settings tab shows a concise empty state and an action to open Settings > Models. It should not show disabled native selects or technical file/proxy details.

Model picker acceptance: each of Haiku, Sonnet, and Opus uses a custom searchable dropdown. Opening the dropdown shows grouped model names by prefix, such as `gpt`, `claude`, and `deepseek`. Inside the `gpt` group, `gpt-5.5` appears above `gpt-5.3-codex`. Searching filters model names. The currently selected model remains visible in the trigger and has a checkmark when the dropdown is open.

Save acceptance: selecting models and saving writes the same required env keys as before through `workspaceModelSettings.save`. The workspace `.claude/settings.local.json` preserves unrelated top-level keys and unrelated `env` keys. `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are still written even though the UI no longer displays them.

Settings > Models acceptance: provider model IDs are displayed as removable chips/tags instead of a textarea. The user can type a model ID in a horizontal input and click Add or press Enter. Empty input is ignored. Duplicate model IDs are ignored. Clicking a chip's remove control removes that model. Editing an existing provider shows its fetched/manual models as chips and still keeps the secret field blank.

Validation commands must pass:

    cd apps/desktop
    bun run typecheck

Focused tests for grouping/sorting and model chip helper behavior must pass. Full `bun run lint` may still be blocked by unrelated local environment issues already recorded in the previous ExecPlan; if so, record the exact blocker and do not hide it.

Manual e2e should verify with the current CPAMeiguo test provider, without printing API keys.

## Idempotence and Recovery

The tab rename should tolerate existing persisted sidebar state. If a user has `rightSidebarTab` persisted as `models`, the app should map it to `settings` on load rather than showing no panel or defaulting unexpectedly.

The grouped model picker is read-only over aggregated model IDs; it should not mutate provider state. If model aggregation is empty, the panel should guide the user to Settings > Models.

Provider model chips should preserve model IDs across edit/save cycles. Adding the same model repeatedly should not create duplicates. Removing a chip only changes the form until Save provider is clicked.

If this UI refinement fails, rollback is limited to renderer files and tests. It should not require changes to provider storage, proxy routing, or workspace settings tRPC code.

## Artifacts and Notes

Example grouping:

    input: ["gpt-5.3-codex", "gpt-5.5", "claude-sonnet-4-6", "deepseek-v4-pro"]
    output:
      claude:
        claude-sonnet-4-6
      deepseek:
        deepseek-v4-pro
      gpt:
        gpt-5.5
        gpt-5.3-codex

Example Settings tab normal state:

    Settings
    Model Configuration
    Haiku      [gpt-5.5        v]
    Sonnet     [claude-sonnet-4-6 v]
    Opus       [claude-opus-4-6   v]
    [Save settings]

Example provider model editor:

    Models
    [gpt-5.5 x] [gpt-5.3-codex x] [deepseek-v4-pro x]
    [Add model ID...] [Add]

Do not print or log provider API keys in e2e output.

## Interfaces and Dependencies

The grouped picker component should have a minimal interface:

    interface GroupedModelPickerProps {
      label: string;
      value: string;
      models: string[];
      onChange: (model: string) => void;
      disabled?: boolean;
    }

The grouping utility should be pure and testable:

    interface ModelGroup {
      prefix: string;
      models: string[];
    }

    function groupModelIds(modelIds: string[]): ModelGroup[];

The provider form should use an array model field instead of text:

    type ProviderForm = {
      id?: string;
      name: string;
      protocol: ModelProviderProtocol;
      baseUrl: string;
      secret: string;
      enabled: boolean;
      models: string[];
    };

No new main-process API is expected. Continue to use existing tRPC procedures:

    modelProviders.list
    modelProviders.create
    modelProviders.update
    modelProviders.fetchModels
    modelProviders.listAggregatedModels
    modelProxy.status
    workspaceModelSettings.read
    workspaceModelSettings.save

## Milestones

### Milestone 1: Tab rename and workspace panel simplification

This milestone changes the workspace right sidebar from Models to Settings and removes proxy/file implementation details from the normal panel. At completion, users see only a Settings panel with Model Configuration or a provider-empty prompt.

Acceptance:

    cd apps/desktop
    bun run typecheck

Manual check: the right sidebar tab reads `Settings`, and the panel no longer shows proxy URL or `.claude/settings.local.json` during normal configured use.

### Milestone 2: Grouped searchable model picker

This milestone adds the custom model picker and grouping/sorting utilities. At completion, Haiku, Sonnet, and Opus use searchable Command/Popover dropdowns grouped by model prefix with selected-item checkmarks.

Acceptance:

    bun test <grouped model picker utility test file>
    cd apps/desktop && bun run typecheck

Manual check: opening the dropdown shows `gpt` models grouped and sorted with `gpt-5.5` above `gpt-5.3-codex`.

### Milestone 3: Provider model chips

This milestone replaces the Settings > Models textarea with model chips and an inline Add model field. At completion, provider model editing is compact, duplicate-safe, and easier to scan.

Acceptance:

    bun test <provider model form helper test file if helpers are extracted>
    cd apps/desktop && bun run typecheck

Manual check: adding, deleting, editing, fetching models, and saving a provider works without displaying saved API keys.

### Milestone 4: E2E verification and plan closeout

This milestone validates the whole refined flow in the running desktop app. At completion, CPAMeiguo can be configured, models can be fetched, workspace model settings can be saved, and the UI stays non-technical.

Acceptance:

    Use desktop automation on DESKTOP_AUTOMATION_PORT=9322 to verify Settings > Models and the right sidebar Settings tab.

Expected result: no API keys are printed, no proxy/file path details appear in the normal workspace panel, and workspace `.claude/settings.local.json` contains updated required env keys while preserving unrelated settings.

## Revision Notes

2026-04-25 17:30Z: Initial plan created from user feedback after the first provider/proxy implementation. The plan focuses on hiding implementation details, renaming the workspace panel to Settings, improving model selection with grouped searchable dropdowns, and replacing provider model textarea editing with chips.
