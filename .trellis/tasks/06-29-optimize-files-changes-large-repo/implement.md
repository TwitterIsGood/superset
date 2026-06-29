# Implementation Plan

## Phase 1: Reproduce And Baseline

- Inspect current worktree desktop status.
- Prefer a disposable local large-change fixture for automation.
- If available without typing credentials, observe installed Canary on the
  user's existing online session and record `sailor` baseline.
- Capture:
  - screenshot before/after switching `Files` / `Changes`;
  - switch timing samples;
  - renderer console errors;
  - whether tab switching triggers git/list/status refetches;
  - whether terminal close can re-add a blank tab.

## Phase 2: Terminal Close Fix

- Add a pure auto-attach suppression helper or extend the existing terminal
  background marker module.
- Mark explicitly closed terminal ids as suppressed before auto-attach can see
  them as background candidates.
- Ensure intentional backgrounding and remote terminal auto-attach still work.
- Add focused tests:
  - suppressed live terminal is not auto-attached;
  - non-suppressed remote live terminal is auto-attached;
  - suppression can be cleared/expired.

## Phase 3: Sidebar Performance Fix

- [x] Add route-local keep-warm behavior for visited heavy sidebar tabs,
      limited to `Files` and `Changes` when `gitChangeCount >= 500`.
- [x] Keep first-load lazy imports intact.
- [x] Add a render boundary around `FilesTab` and `ChangesSidebarTab`.
- [x] Virtualize `ChangesFoldersView` with `@tanstack/react-virtual`.
- [x] Replace `display:none` warm hiding with absolute/inert hiding after
      measurement showed `display:none` still forced virtual row recreation on
      return to `Changes`.
- [x] Add focused tests for:
  - heavy tabs are not imported by the shell before first use;
  - visited `Files` / `Changes` keep-warm remains guarded and non-eager;
  - `ChangesFileList` owns the shared scroll container and folder rows are
    virtualized.

## Phase 4: Validation

- [x] Focused unit/source tests for touched modules:
  - `apps/desktop/src/renderer/lib/terminal/terminal-background-intents.test.ts`
  - `WorkspaceSidebar.lazy-tabs.test.ts`
  - `ChangesFileList.virtualization.test.ts`
  - `BackgroundTerminalsButton.utils.test.ts`
- [x] `bun run lint:fix`
- [x] `bun run lint`
- [x] `bun run typecheck --filter=@superset/desktop`
- [x] `git diff --check`
- [x] Desktop Automation screenshots:
  - `artifacts/sailor-main-before-final.png`
  - `artifacts/sailor-main-absolute-warm-final.png`
  - `artifacts/terminal-close-after-final.png`
- [x] Renderer performance measurement artifact:
  - `artifacts/sailor-main-switch-performance-final.json`
- [x] Terminal close desktop acceptance:
  - created a temporary terminal with `Meta,t`;
  - closed the tab once from the tab bar;
  - waited more than the auto-attach polling interval;
  - observed three close buttons again and no blank terminal reattached.

## Risk Points

- Keeping `Files` and `Changes` mounted can increase renderer memory for very
  large workspaces. Limit keep-warm to visited heavy tabs and validate memory if
  the measured fixture is large enough.
- Auto-attach suppression must not permanently hide remote terminals. Use
  workspace-scoped suppression and clear/expire it.
- Avoid changing git status semantics. This task should optimize rendering and
  lifecycle, not redefine what counts as a change.

## Outcome Summary

- Root cause category:
  - `Files` / `Changes`: performance issue from repeated heavy tab switching
    and thousands-row `Changes` folder rendering.
  - blank terminal close: lifecycle race between explicit tab close and
    remote/background terminal auto-attach.
- Preserved historical optimizations/features:
  - kept lazy imports from PR #19;
  - kept remote terminal auto-attach from `bce87902d`.
- Final repeated cached `sailor/main` switch result:
  - `Files`: max long task `52ms`;
  - `Changes`: max long task `52ms`;
  - virtualized `Changes` visible rows: about `46`.
