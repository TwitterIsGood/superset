# Design: unblock workspace entry from Changes initialization

## Problem

Large repositories make the v2 workspace feel frozen during first entry and while switching the Changes sidebar between Folders and Tree. The previous Tree-specific optimization reduced `Folders -> Tree` long tasks, but `Tree -> Folders` still measured around 183ms. Users also report that preset Agent CLI buttons in the center pane are unclickable for several seconds while the right sidebar initializes.

## Root-cause hypothesis

The current render graph lets right-sidebar git work land on the same renderer critical path as the center workspace:

- `WorkspaceGitStatusProvider` starts `useGitStatus` whenever the right sidebar is open.
- `WorkspaceSidebar` derives `gitChangeCount` and can keep `files` and `changes` warm for large changesets.
- `LazyChangesSidebarTab` mounts a full Changes tab, including base branch, commits, branches, diff files, totals, header, toolbar, and one of the heavy file views.
- `ChangesFoldersView` does synchronous grouping, basename sorting, folder sorting, row construction, and virtualizer setup on cold mount.
- `ChangesTreeView` does synchronous path extraction, file maps, tree shape, git status entries, and Pierre model updates.

That means a user can pay Changes initialization cost just by entering a worktree with the right sidebar open, before they explicitly interact with Changes.

## Approach

1. Measure first, then change
   - Use Desktop Automation against the large `sailor` workspace.
   - Measure route entry, preset click latency during sidebar readiness, and repeated Folders/Tree toggles.
   - Save artifacts under this task.

2. Remove heavy inactive warm work from the entry path
   - Keep warm mounting bounded and avoid mounting the inactive Changes tab solely because a large git status exists.
   - Preserve active tab behavior and status badges.
   - If a tab needs warm state, defer warm rendering until after initial interaction/idle instead of during route entry.

3. Make Folders cold mount cheaper
   - Keep virtualized rendering.
   - Move file grouping/sorting/row building behind a deferred or idle-ready boundary when the file count is large.
   - Render a lightweight loading shell inside Changes instead of blocking the main workspace commit.
   - Preserve fold state and toolbar semantics.

4. Isolate main-pane interactions
   - Ensure preset execution does not depend on Changes content readiness.
   - Avoid unnecessary parent re-renders from sidebar-only git data.

## Non-goals

- Replacing Pierre with a custom tree.
- Changing Git status backend semantics.
- Changing preset execution behavior or terminal lifecycle semantics.
- Hiding real loading state with fake optimistic UI.

## Risks

- Deferring work can create visible late content shifts inside the sidebar. Keep placeholders constrained to the sidebar and avoid moving center-pane controls.
- Over-aggressive unmounting can regress fast Files/Changes switching. The fix must be measured on both first-entry and tab-switch cases.
- `requestIdleCallback` availability differs across Electron versions; use a small React-compatible abstraction with timeout fallback if needed.
