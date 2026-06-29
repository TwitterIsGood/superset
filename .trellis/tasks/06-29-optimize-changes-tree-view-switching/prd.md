# Optimize Changes tree view switching

## Goal

Follow-up to large repo sidebar optimization: fix Changes internal Folders-to-Tree view switching lag on sailor/main without regressing lazy imports or Files/Changes tab switching.

## User Report

- In the large online `sailor/main` workspace, the outer `Files` / `Changes`
  tab switch is now better, but inside `Changes`, clicking from `Folders` to
  `Tree` still freezes/stutters.

## Context

- Prior task `06-29-optimize-files-changes-large-repo` fixed repeated
  `Files` / `Changes` tab switching by preserving lazy imports, threshold-gated
  warm tabs, and virtualizing `ChangesFoldersView`.
- That prior fix intentionally did not cover `ChangesTreeView`, so Tree mode
  can still build and render a large directory tree synchronously.
- Preserve the prior performance contract:
  - keep first-load lazy imports intact;
  - keep large-tab warm behavior scoped to `gitChangeCount >= 500`;
  - do not undo terminal close/auto-attach changes;
  - use real Desktop Automation measurement against `sailor/main`.

## Requirements

- Switching `Changes` from `Folders` to `Tree` in a large changeset must avoid
  a long main-thread freeze.
- Tree mode must preserve existing behavior: directory hierarchy, file rows,
  open/close folders, selected file state, expand/collapse controls, open diff,
  open file, open in editor, and staging/discard actions.
- The fix must be scoped to Changes tree rendering and derived tree state. Do
  not change git status semantics or query invalidation.
- The final implementation must have deterministic source/unit tests and a
  real desktop measurement artifact.

## Acceptance Criteria

- [x] `Folders -> Tree -> Folders -> Tree` on `sailor/main` has no obvious UI
      freeze after the first warm-up interaction.
- [x] Repeated cached Tree switch has no single interaction long task over
      `100ms` in the measured window, or records a materially improved result
      with explanation if the real workspace is noisier.
- [x] Tree mode renders a bounded number of visible rows for the large
      changeset instead of thousands of DOM nodes.
- [x] Folders mode remains virtualized and the prior `Files` / `Changes`
      switch performance behavior is not regressed. Note: the final measurement
      still shows a Folders cold-mount long task around `183ms`; this task only
      fixes the reported `Folders -> Tree` direction without replacing the prior
      Folders virtualization work.
- [x] Focused tests, `bun run lint`, `bun run typecheck --filter=@superset/desktop`,
      `git diff --check`, Trellis validate, and Desktop Automation artifacts
      are recorded before finish.

## Validation Notes

- Preserved visual-corruption scene and memory state under `artifacts/incident-*`
  and `artifacts/incident-2-*`.
- Rejected custom Tree rewrite after `artifacts/tree-switch-after.raw.txt`
  measured Tree long tasks around `205-208ms`, worse than the baseline
  `91-95ms`.
- Final approach keeps Pierre and starts large changesets collapsed.
- Final Desktop Automation measurement:
  - `artifacts/tree-switch-collapsed.raw.txt`
  - Tree long tasks: `87ms`, then `96ms`
  - Tree DOM nodes: roughly `924`
  - renderer console logs: `[]`
- Static checks:
  - `bun test ...ChangesFileList.virtualization.test.ts ...WorkspaceSidebar.lazy-tabs.test.ts`
  - `bun run typecheck --filter=@superset/desktop`
  - `bun run lint:fix`
  - `bun run lint`
  - `git diff --check`
  - `python3 ./.trellis/scripts/task.py validate .trellis/tasks/06-29-optimize-changes-tree-view-switching`

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
