# Implementation Plan

## Phase 1: Baseline

- Identify the online/dev large `sailor` workspace route and ensure the dev app is reachable.
- Add or reuse a Desktop Automation script to record:
  - first workspace entry long tasks and RAF delay,
  - preset click acceptance while sidebar/git data initializes,
  - repeated Changes view toggles in both directions,
  - DOM node count and console errors.

## Phase 2: Entry-path unblock

- Audit `WorkspaceGitStatusProvider`, `WorkspaceSidebar`, and `LazyChangesSidebarTab` mounting.
- Prevent inactive heavy Changes/File tab warm rendering from running on first route entry.
- Keep badges and active tab rendering correct.
- Add focused tests for warm-render gating if the logic changes.

## Phase 3: Folders switching optimization

- Optimize `ChangesFoldersView` cold mount by deferring/chunking derived rows for large file sets.
- Keep virtualized DOM count bounded.
- Add focused tests around grouping/row readiness behavior and empty/loading states.

## Phase 4: Verification and prevention

- Run focused tests, `bun run lint:fix`, `bun run lint`, desktop typecheck, and `git diff --check`.
- Run Desktop Automation measurements and compare baseline/final.
- Update `.trellis/spec/desktop/frontend/quality-guidelines.md` if the work produces a reusable rule.
- Archive task, record journal, commit, push, and trigger canary only after validation passes.
