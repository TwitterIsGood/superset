# Fix workspace tab navigation flicker

## Goal

Fix the visible screen flicker that happens when navigating away from a Workspace worktree/tab detail view to top-level dashboard surfaces such as Workspaces, Automations, or Tasks & PRs.

The transition should feel stable: the app may change route content, but it must not briefly flash an empty/white/reset surface, remount the whole dashboard shell unnecessarily, or drop the persistent sidebar/chrome for a frame.

## Requirements

- Reproduce the flicker in the desktop app from a Workspace worktree/tab route to:
  - Workspaces
  - Automations
  - Tasks & PRs
- Identify whether the flicker is caused by route-level pending UI, auth/dashboard shell remounting, data readiness gating, view transition behavior, or layout state resets.
- Fix the root cause in the smallest relevant desktop renderer surface.
- Preserve normal route navigation behavior, selected sidebar item state, and existing loading/empty states.
- Do not mask real loading by adding fake delays or optimistic UI that lies about data readiness.
- Keep changes local to desktop navigation/layout unless reproduction proves a shared component is responsible.

## Acceptance Criteria

- [x] Navigating from a Workspace worktree/tab detail page to Workspaces no longer flashes the whole viewport or dashboard shell.
- [x] Navigating from a Workspace worktree/tab detail page to Automations no longer flashes the whole viewport or dashboard shell.
- [x] Navigating from a Workspace worktree/tab detail page to Tasks & PRs no longer flashes the whole viewport or dashboard shell.
- [x] Persistent app chrome/sidebar remains mounted and visually stable during these transitions.
- [x] Existing data loading states remain honest and do not regress cache-first rendering.
- [x] Focused desktop validation records before/after evidence with screenshot or automation output.
- [x] Focused tests/typecheck/lint relevant to changed files pass, with any broader skipped checks documented.

## Notes

- User report: starting from Workspace Work tree tabs, switching to Workspaces, Automations, or Tasks & PRs causes a visible flicker.
- This is a desktop UX bug, not a backend or data migration task.

## Implementation

- Root cause: `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` added or removed `ReactDndBoundary` based on the current route. Leaving `/v2-workspace/...` removed the wrapper and remounted `CollectionsProvider -> LocalHostServiceProvider -> DashboardLayout -> Outlet`, which produced a whole-shell flash.
- Fix: keep `ReactDndBoundary` mounted for the authenticated shell at all times. The boundary uses the existing singleton `dragDropManager`, so route changes no longer change the wrapper identity.
- Regression test: `apps/desktop/src/renderer/routes/_authenticated/authenticated-layout-dnd-boundary.test.ts` asserts the layout imports `ReactDndBoundary` directly, returns the stable wrapper, and does not reintroduce route-gated DnD wiring.

## Validation

- Focused source regression: `bun test apps/desktop/src/renderer/routes/_authenticated/authenticated-layout-dnd-boundary.test.ts`
- Desktop typecheck: `bun run --cwd apps/desktop typecheck`
- Desktop acceptance startup/status: `bun run dev:worktree:status` with `desktop-online-lite`, automation port `3268`, and online API/Electric/relay probes passing.
- Real desktop route acceptance used `DESKTOP_AUTOMATION_PORT=3268 bun run desktop:automation -- ...` after signing into the dev desktop window.
- From `#/v2-workspace/d417b8e5-563b-4cb9-bdc2-bf9bd4fce3e1`, a MutationObserver tracked the authenticated shell marked with `data-flicker-probe="stable-shell"`.
- Workspaces transition result: `markerStillMounted=true`, `removedCount=0`; screenshot `artifacts/03-to-workspaces.png`.
- Automations transition result: `markerStillMounted=true`, `removedCount=0`; screenshot `artifacts/04-to-automations.png`.
- Tasks & PRs transition result: `markerStillMounted=true`, `removedCount=0`; screenshot `artifacts/05-to-tasks.png`.
- Renderer console logs after acceptance: `[]`.
