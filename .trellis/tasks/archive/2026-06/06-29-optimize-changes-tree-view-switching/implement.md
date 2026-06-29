# Implementation Plan

## Phase 1: Context And Baseline

- Read desktop frontend specs and prior large sidebar performance contract.
- Inspect `ChangesTreeView` and related tests.
- Measure current `Folders -> Tree -> Folders -> Tree` behavior in
  `sailor/main`.

## Phase 2: Implement

- Rejected: converting `ChangesTreeView` to a custom flattened visible-row model
  using `FileRow` was measured and found slower/heavier than Pierre.
- Keep `ChangesTreeView` on Pierre.
- For large changesets, start Tree mode collapsed so switching into Tree does
  not eagerly expand the full directory model into visible rows.
- Preserve folder toggle, expand/collapse all, selection, and file actions.
- Add/adjust source tests so Tree mode remains Pierre-backed and large
  changesets start collapsed.

## Phase 3: Validate

- Focused tests for Changes Tree/Folders virtualization and sidebar lazy/warm
  guards.
- `bun run lint`
- `bun run typecheck --filter=@superset/desktop`
- `git diff --check`
- Desktop Automation measurement on `sailor/main`.
- Trellis validate.

## Incident Artifacts

The visual-corruption scene and memory state were preserved in:

- `artifacts/incident-electron-window.png`
- `artifacts/incident-2-electron-window.png`
- `artifacts/incident-2-process-memory.txt`
- `artifacts/tree-switch-baseline.raw.txt`
- `artifacts/tree-switch-after.raw.txt`
- `artifacts/tree-switch-collapsed.raw.txt`

## Risk Points

- Tree mode still builds a Pierre model from every changed path. If large closed
  trees still freeze, optimize pure tree/model construction without replacing
  Pierre rows with heavier product rows.
- Virtual row positioning must use the shared scroll container, not a nested
  scroll area, or sidebar scrolling will break.
- Do not regress Folders mode virtualization.
