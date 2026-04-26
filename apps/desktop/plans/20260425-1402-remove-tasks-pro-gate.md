# Remove the Tasks Pro gate

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows the repository conventions from `AGENTS.md` and the desktop-specific conventions from `apps/desktop/AGENTS.md`.

## Purpose / Big Picture

普通用户现在点击桌面端侧边栏里的 Tasks 会被 Pro Features 付费墙拦住。完成本计划后，免费用户和付费用户一样可以从侧边栏进入 Tasks 页面，查看、搜索、筛选、创建和管理任务；Tasks 也不再出现在 Pro Features 弹窗的功能列表里。可见行为是：在 free plan 会话中点击 Tasks 导航项会直接打开 `/tasks`，不会弹出 Paywall。

## Assumptions

The affected product surface is the Electron desktop app under `apps/desktop`, not the web deep-link passthrough page under `apps/web/src/app/tasks/[slug]/page.tsx`. The web page only redirects browser links such as `/tasks/ABC-123` into the desktop app via `superset://tasks/ABC-123`, and it does not enforce the Pro gate.

The intended change is to remove Tasks from the Pro-gated feature set entirely, not merely to bypass one button. That means both desktop sidebar entry points should navigate directly to Tasks, and the Paywall catalog should stop describing Tasks as a Pro feature.

No database schema or migration is needed. The existing Tasks data model, Electric collections, task routes, and MCP task tools remain unchanged.

## Open Questions

There are no open questions at initial draft. The request is acceptance-oriented and specific: remove the Pro Features interception for Tasks so normal users can use it.

## Progress

- [x] (2026-04-25 14:02Z) Located the Tasks gate in the desktop renderer. `GATED_FEATURES.TASKS` is passed to `gateFeature` in both desktop sidebar headers.
- [x] (2026-04-25 14:02Z) Confirmed the Tasks route itself is not gated. `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/page.tsx` directly renders `TasksView`.
- [x] (2026-04-25 14:02Z) Confirmed the Paywall catalog still lists Tasks as a Pro feature in `apps/desktop/src/renderer/components/Paywall/constants.ts` and previews it through `FeaturePreview.tsx`.
- [x] (2026-04-25 14:18Z) Implemented the direct navigation changes in both sidebar headers while preserving the existing Tasks filter search parameters.
- [x] (2026-04-25 14:19Z) Removed Tasks from Paywall constants and preview component wiring.
- [x] (2026-04-25 14:24Z) Added a narrow Paywall constants/source regression test proving Tasks is not in the Pro catalog and the sidebar Tasks handlers do not call `GATED_FEATURES.TASKS` or `gateFeature`.
- [x] (2026-04-25 14:28Z) Ran targeted tests and typecheck successfully. `bun run lint` is blocked by pre-existing formatting/import issues in unrelated files, so changed-file Biome validation was run and passed.

## Surprises & Discoveries

- Observation: The Tasks route is directly accessible if the user reaches `/tasks` by URL or router navigation.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/page.tsx` renders `TasksView` without checking plan access.

- Observation: The interception happens only at sidebar click handlers found so far, not at the route boundary.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx` calls `gateFeature(GATED_FEATURES.TASKS, ...)` in `handleTasksClick`, and `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx` does the same.

- Observation: Tasks is also listed inside the Paywall modal as a Pro feature.
  Evidence: `apps/desktop/src/renderer/components/Paywall/constants.ts` included a `PRO_FEATURES` item with `id: "tasks"`, mapped `GATED_FEATURES.TASKS` to `"tasks"`, and `FeaturePreview.tsx` mapped `tasks` to `TasksDemo` before implementation.

- Observation: After removing the FeaturePreview import and mapping, the `TasksDemo` component only has self-contained index/component references plus this plan.
  Evidence: A repository-wide `Grep` for `TasksDemo` found no remaining production consumer outside `apps/desktop/src/renderer/components/Paywall/components/FeaturePreview/components/TasksDemo/` after removing `FeaturePreview.tsx` references.

- Observation: Full repository lint is currently blocked by unrelated pre-existing formatting/import issues.
  Evidence: `bun run lint` reported formatting diffs in `.claude/settings.json` and files under `apps/desktop/src/lib/trpc/routers/model-proxy/`, plus an import-order issue in `apps/desktop/src/main/index.ts`; targeted `bunx biome check` on the changed files passed.

- Observation: Desktop automation could not connect to a controllable app window.
  Evidence: `get_window_info` failed to fetch `http://127.0.0.1:9322/json/version` with an unable-to-connect error.

## Decision Log

- Decision: Remove the gate at the two Tasks navigation click handlers rather than changing `usePaywall.hasAccess` to special-case Tasks.
  Rationale: A hook-level special case would leave Tasks named as a gated feature and would make the Paywall API misleading. Direct navigation makes the behavior obvious and keeps other Pro gates unchanged.
  Date/Author: 2026-04-25 / Claude

- Decision: Remove Tasks from the Paywall catalog after removing the sidebar gates.
  Rationale: If free users can use Tasks, the Pro Features modal should not advertise Tasks with a PRO badge. This avoids inconsistent product messaging while preserving the remaining Pro gates such as Invite Members, Integrations, Cloud Workspaces, and Mobile App.
  Date/Author: 2026-04-25 / Claude

- Decision: Do not touch task data, task MCP tools, Electric SQL collections, billing plans, or server-side subscription logic.
  Rationale: The requested behavior is a desktop UI paywall removal. The discovered route and task backend paths are already usable once the user reaches the route.
  Date/Author: 2026-04-25 / Claude

- Decision: Leave the now-unreferenced `TasksDemo` component files in place.
  Rationale: The plan made deletion optional and recommended not deleting unless necessary. Removing the FeaturePreview mapping is sufficient to stop presenting Tasks in the Paywall, and leaving the unused demo avoids extra file deletion churn.
  Date/Author: 2026-04-25 / Claude

## Outcomes & Retrospective

Implemented. Both desktop sidebar Tasks handlers now navigate directly to `/tasks` with the existing preserved filter search object; neither imports Paywall nor references `GATED_FEATURES.TASKS`. The Paywall constants and FeaturePreview mapping no longer register Tasks as a Pro feature, so remaining paywall messaging covers the other Pro features only.

Automated validation completed for the new regression test, existing TasksView regression test, repository typecheck, and changed-file Biome check. Full `bun run lint` was attempted but failed on unrelated pre-existing formatting/import issues in `.claude/settings.json` and desktop model-proxy files; the changed files passed targeted Biome validation.

Manual desktop automation could not verify the UI because the desktop automation endpoint at `http://127.0.0.1:9322/json/version` was unavailable, indicating no controllable desktop app window was exposed to the automation tools in this session.

## Context and Orientation

This repository is a Bun and Turborepo monorepo. The affected app is `apps/desktop`, the Electron desktop application. Electron has a main process and a renderer process; this plan only touches the renderer process, which is the browser-like React UI under `apps/desktop/src/renderer`. No desktop IPC change is needed. IPC means inter-process communication between Electron's main process and renderer process; desktop-specific `apps/desktop/AGENTS.md` says IPC should use tRPC under `src/lib/trpc`, but this plan does not add IPC.

The Tasks page lives at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/page.tsx`. It defines a TanStack Router file route for `/_authenticated/_dashboard/tasks/` and renders `TasksView` from `./components/TasksView`. TanStack Router is the client-side routing library used by the desktop renderer; calling `navigate({ to: "/tasks", search })` changes the current screen without reloading the app.

The Tasks route layout lives at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/layout.tsx`. It validates optional search parameters: `tab`, `assignee`, and `search`. These values preserve the last Tasks filter state when a user re-enters the Tasks page.

There are two relevant sidebar header implementations. `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx` is the dashboard sidebar header used by the current authenticated dashboard UI. `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx` is another workspace sidebar header still present in the desktop renderer. Both compute the last Tasks filters from `useTasksFilterStore`, build a `search` object, and currently wrap navigation in `gateFeature(GATED_FEATURES.TASKS, ...)`.

The Paywall component lives under `apps/desktop/src/renderer/components/Paywall`. `usePaywall.ts` exposes `gateFeature`, which runs a callback only when `useCurrentPlan()` returns `"pro"` or `"enterprise"`; otherwise it opens the Paywall modal. `constants.ts` defines `GATED_FEATURES`, the `PRO_FEATURES` list shown in the modal, and `FEATURE_ID_MAP`, which maps a gated feature to the highlighted Pro feature. `Paywall.tsx` renders the modal and uses `FEATURE_ID_MAP` plus `PRO_FEATURES` to choose the highlighted feature. `components/FeaturePreview/FeaturePreview.tsx` maps each Pro feature id to a visual demo component, including the current `TasksDemo`.

The involved package outside `apps/desktop` is `@superset/shared`, imported by existing desktop code for billing and feature flag constants. This plan does not change shared packages such as `packages/db`, `packages/ui`, `packages/shared`, `packages/trpc`, `packages/mcp`, or `packages/local-db`.

## Plan of Work

First, edit `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`. Remove `GATED_FEATURES` and `usePaywall` from the Paywall import, remove the `const { gateFeature } = usePaywall();` line, and change `handleTasksClick` so it directly builds the existing `search` object and calls `navigate({ to: "/tasks", search })`. Keep the existing filter preservation behavior exactly the same: include `tab` only when `lastTab !== "all"`, include `assignee` only when `lastAssignee` is truthy, and include `search` only when `lastSearch` is truthy.

Second, edit `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx` the same way. Remove the Paywall import, remove `const { gateFeature } = usePaywall();`, and make `handleTasksClick` directly navigate to `/tasks` with the same preserved search parameters.

Third, edit `apps/desktop/src/renderer/components/Paywall/constants.ts`. Remove `HiOutlineClipboardDocumentList` from the icon imports if no remaining feature uses it. Remove `TASKS: "tasks"` from `GATED_FEATURES`. Remove the `PRO_FEATURES` object whose `id` is `"tasks"`. Remove `[GATED_FEATURES.TASKS]: "tasks"` from `FEATURE_ID_MAP`. The remaining `GATED_FEATURES` keys should still map to their remaining Pro feature ids. This makes the type `GatedFeature` no longer include Tasks, so TypeScript will catch any lingering Tasks gate references.

Fourth, edit `apps/desktop/src/renderer/components/Paywall/components/FeaturePreview/FeaturePreview.tsx`. Remove the `TasksDemo` import and remove the `tasks: TasksDemo` entry from `DEMO_COMPONENTS`. If the `TasksDemo` file becomes unused, leave deletion as optional only if a search confirms there are no references; do not delete it without confirming with `Grep` first. The functional requirement is that Paywall no longer presents Tasks as Pro.

Fifth, add a regression test in the most local reasonable existing test area. Prefer adding a small source-level test near the sidebar headers if an existing colocated test file exists; if none exists, create `apps/desktop/src/renderer/components/Paywall/constants.test.ts` or another colocated renderer test that reads relevant source files and asserts that `GATED_FEATURES.TASKS` no longer appears outside test text and that the Paywall constants do not include `id: "tasks"`. This repository already uses source-level regression tests for renderer wiring, such as `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`, so a source-level test is acceptable if direct component rendering would require heavy router and auth setup. Keep the test narrow: it should protect the requested gate removal, not test all Paywall behavior.

Finally, search the desktop renderer for `GATED_FEATURES.TASKS` and `id: "tasks"` under the Paywall constants. There should be no production references to `GATED_FEATURES.TASKS`, and the Paywall `PRO_FEATURES` array should not contain a Tasks item.

## Concrete Steps

Work from the repository root:

    cd /Users/biangwua/Documents/biang/小玩意/superset

Inspect the current gate locations before editing:

    # Use Grep, not shell grep, when using Claude Code tools.
    # Expected matches before implementation:
    # apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx
    # apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx

After editing, run targeted searches:

    # Expected after implementation: no production matches for GATED_FEATURES.TASKS.
    # If a test mentions the string, ensure it is asserting absence in source and is not production code.

Run the narrow tests first. If a new colocated test file is added, run that file directly with Bun from the repository root, for example:

    bun test apps/desktop/src/renderer/components/Paywall/constants.test.ts
    # Expected: all tests pass.

Then run the existing Tasks renderer tests because the change affects Tasks navigation and Paywall-adjacent UI wiring:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts
    # Expected: all tests pass.

Run desktop type checking and linting from the repository root:

    bun run typecheck
    # Expected: no TypeScript errors. In particular, no error should mention GATED_FEATURES.TASKS.

    bun run lint
    # Expected: no Biome lint or formatting errors.

For a manual desktop check, start the desktop development app using the project’s Apple Silicon-safe startup flow if running on an Apple Silicon machine:

    arch -arm64 bun --filter @superset/desktop dev
    # Expected: the desktop app opens. Sign in as or use a free-plan account, click Tasks in the sidebar, and observe that the Tasks page opens without a Pro Features modal.

If not on Apple Silicon or if the project scripts differ in the current branch, use the desktop package’s existing development command documented in its `package.json`, but keep the check focused on the same observable behavior: clicking Tasks should navigate to the Tasks page with no Paywall.

## Validation and Acceptance

Acceptance is user-visible. With a free-plan user, clicking the Tasks item in the expanded dashboard sidebar opens the Tasks screen. The Pro Features modal does not appear. The current Tasks filter state is preserved in the route search parameters, so if the stored tab is not `all`, the URL/search state includes that tab just as before.

The same behavior must hold for the collapsed dashboard sidebar button: clicking the Tasks icon opens Tasks without a Paywall. If the older workspace sidebar header is reachable in the app, clicking its Tasks item also opens Tasks without a Paywall.

The Paywall modal must no longer list Tasks as a Pro Feature. Trigger any remaining gated feature, such as Invite Members or Integrations, and observe that the Pro Features sidebar lists Team Collaboration, Integrations, Cloud Workspaces, and Mobile App as applicable, but not Tasks.

Automated validation should pass:

    bun test <new regression test file>
    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts
    bun run typecheck
    bun run lint

Success means there are no test failures, no TypeScript errors, no lint errors, and no production references to `GATED_FEATURES.TASKS` remain.

## Idempotence and Recovery

The edits are local renderer code changes and are safe to repeat. If a search still finds `GATED_FEATURES.TASKS` after the planned sidebar edits, inspect each match and either remove the gate if it blocks Tasks access or update the plan if the match is a test assertion. Do not change `usePaywall.hasAccess` globally because that would affect all gated features.

If removing `TASKS` from `GATED_FEATURES` causes TypeScript errors, treat each error as evidence of another Tasks gate call. Remove or rewrite that gate to direct navigation only if it is specifically about Tasks. Do not broaden free access to unrelated features.

If deleting the `TasksDemo` file is considered, first search for `TasksDemo` across the repository. Delete it only if there are no references after removing it from `FeaturePreview.tsx`; otherwise leave it in place. Leaving an unused demo file is less risky than deleting a file still imported elsewhere.

Rollback is straightforward: restore the removed Paywall import and `gateFeature(GATED_FEATURES.TASKS, ...)` wrappers in the two sidebar headers, restore `TASKS` in `GATED_FEATURES`, restore the Tasks item in `PRO_FEATURES`, restore the `FEATURE_ID_MAP` entry, and restore the `TasksDemo` mapping in `FeaturePreview.tsx`.

## Artifacts and Notes

Current gate shape in the dashboard sidebar before implementation:

    const handleTasksClick = () => {
      gateFeature(GATED_FEATURES.TASKS, () => {
        const search: Record<string, string> = {};
        if (lastTab !== "all") search.tab = lastTab;
        if (lastAssignee) search.assignee = lastAssignee;
        if (lastSearch) search.search = lastSearch;
        navigate({ to: "/tasks", search });
      });
    };

Target shape after implementation:

    const handleTasksClick = () => {
      const search: Record<string, string> = {};
      if (lastTab !== "all") search.tab = lastTab;
      if (lastAssignee) search.assignee = lastAssignee;
      if (lastSearch) search.search = lastSearch;
      navigate({ to: "/tasks", search });
    };

Current Paywall constants before implementation include:

    TASKS: "tasks"

    {
      id: "tasks",
      title: "Tasks",
      description: "Track and manage tasks synced from Linear. Stay on top of your work without leaving Superset.",
      ...
    }

Both should be absent after implementation.

## Interfaces and Dependencies

No public API, database schema, tRPC router, Electron IPC channel, or package dependency changes are required.

The relevant internal interface is the existing Paywall constants module:

    export const GATED_FEATURES = {
      INVITE_MEMBERS: "invite-members",
      INTEGRATIONS: "integrations",
      CLOUD_WORKSPACES: "cloud-workspaces",
      MOBILE_APP: "mobile-app",
    } as const;

    export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

    export const FEATURE_ID_MAP: Record<GatedFeature, string> = {
      [GATED_FEATURES.INVITE_MEMBERS]: "team-collaboration",
      [GATED_FEATURES.INTEGRATIONS]: "integrations",
      [GATED_FEATURES.CLOUD_WORKSPACES]: "cloud-workspaces",
      [GATED_FEATURES.MOBILE_APP]: "mobile-app",
    };

The sidebar click handlers should depend only on TanStack Router’s `navigate`, `useMatchRoute`, and the existing `useTasksFilterStore`. They should no longer depend on `renderer/components/Paywall` for Tasks navigation.

## Revision Notes

2026-04-25 14:02Z: Initial ExecPlan drafted after discovering the desktop sidebar gate locations, the ungated Tasks route, and the Paywall catalog entries. The plan removes the blocking behavior and cleans up product messaging so Tasks is no longer represented as Pro-only.

2026-04-25 14:20Z: Implementation started. The two sidebar Tasks click handlers now navigate directly to `/tasks` with the existing preserved `tab`, `assignee`, and `search` parameters, and the Paywall catalog/preview no longer includes Tasks.

2026-04-25 14:24Z: Added `apps/desktop/src/renderer/components/Paywall/constants.test.ts` as a narrow source-level regression test because rendering both sidebar variants would require heavier router/auth setup than needed for this gate-removal check.

2026-04-25 14:31Z: Completed validation notes. Targeted tests and typecheck passed; full lint is blocked by unrelated existing formatting/import issues, and desktop automation could not connect to an app window.
