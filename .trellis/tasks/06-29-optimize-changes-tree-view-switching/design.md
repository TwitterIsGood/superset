# Design

## Scope

This task is limited to the desktop v2 workspace `Changes` tab internals:

- `ChangesTreeView`
- `ChangesFileList`
- tests and task artifacts/spec notes needed to guard the behavior

It must not change git queries, status semantics, workspace tab lifecycle, or
terminal auto-attach behavior.

## Root Cause Hypothesis

The prior task virtualized `ChangesFoldersView`, but `ChangesTreeView` still
builds a full directory model and renders rows recursively. On a workspace like
`sailor/main`, Tree mode can touch thousands of files/directories in one render
and create a large DOM subtree when the user switches view mode.

## Direction

1. Measure the current `Folders -> Tree -> Folders -> Tree` path on
   `sailor/main` with RAF delay, long-task data, visible row count, total DOM
   count, screenshot, and console logs.
2. Inspect `ChangesTreeView` and identify whether the dominant cost is:
   - tree construction;
   - recursive DOM rendering;
   - expand/collapse state reset;
   - row component weight.
3. Preserve complete tree semantics while bounding DOM:
   - build a flattened visible-row model from the tree;
   - virtualize visible rows using the same shared
     `data-changes-scroll-container` parent;
   - keep folder expand/collapse state by directory path;
   - retain expand-all / collapse-all support through the existing
     `foldSignal`.
4. Keep the prior `ChangesFoldersView` virtualization and warm-tab behavior.

## Incident: Rejected Custom Tree Rewrite

During implementation, a custom `@tanstack/react-virtual` Tree rewrite replaced
Pierre rows with the existing `FileRow` component. That approach is rejected.

- `FileRow` is a heavy row surface: it wires Radix context menus, tooltip,
  dropdown, discard dialog plumbing, tRPC mutation hooks, click-policy hooks,
  and path actions.
- Real measurement regressed from Tree long tasks around `91-95ms` and roughly
  `957` DOM nodes to Tree long tasks around `205-208ms` and roughly `1805` DOM
  nodes.
- The regression also coincided with a visually corrupted renderer state and a
  macOS memory-pressure dialog reporting Superset Dev at multi-GB footprint.

The safer fix keeps Pierre's lightweight shadow/virtualized row implementation
and only changes large changeset initial expansion behavior.

## Trade-Offs

- Tree construction may still be O(number of changed files), but the DOM render
  must be O(visible rows). If tree construction alone remains expensive after
  virtualization, add memoization around pure tree build helpers.
- Virtualized Tree rows need stable keys to preserve interaction state and avoid
  churn when toggling directories.
- Hidden warm tabs must remain `inert` and `aria-hidden` per the prior
  performance/accessibility contract.

## Validation

- Focused source/unit tests should guard that Tree mode uses virtualization and
  the shared scroll container.
- Real desktop measurement must use the online `sailor/main` route that exposed
  the problem.
- Console logs must be captured after the interaction.
