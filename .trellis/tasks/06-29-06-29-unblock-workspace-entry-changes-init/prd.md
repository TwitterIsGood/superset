# Unblock workspace entry from changes initialization

## Goal

Fix large-worktree UX stalls where Changes initialization and Folders/Tree switching block the renderer, including preset Agent CLI buttons being unclickable before the right sidebar finishes git changes setup.

## Requirements

- Entering a large workspace/worktree must keep the center workspace pane responsive while the right sidebar and git changes data initialize.
- Preset Agent CLI controls in the center pane must accept clicks promptly even if the right sidebar is open and Changes data is still loading or rendering.
- Changes `Folders <-> Tree` switching must meet the same responsiveness budget in both directions on large repositories; fixing `Folders -> Tree` alone is not sufficient.
- Changes rendering must avoid heavy synchronous work on the route-entry critical path. Expensive grouping, tree shaping, sorting, warm mounting, and derived totals should be deferred, memoized, chunked, or scoped to active UI.
- Keep existing behavior intact: terminal auto-attach, preset execution, Files/Changes lazy imports, status badges, diff/file opening, staging/discard actions, and large-tree default collapsed behavior.
- Do not reintroduce the rejected custom Tree rewrite. Pierre remains the tree renderer unless measurement proves otherwise.

## Acceptance Criteria

- [ ] Desktop Automation captures baseline and final measurements for a large `sailor` workspace/worktree, including screenshots, long-task samples, DOM node counts, and console errors.
- [ ] On first workspace entry, clicking a visible preset/Agent CLI button during sidebar/git initialization is accepted within the responsiveness budget and does not wait on Changes rendering.
- [ ] `Folders -> Tree -> Folders -> Tree` repeated switching stays under the agreed long-task budget in both directions, or any remaining over-budget path is explicitly blocked with measured root cause.
- [ ] The right sidebar may show lightweight loading/deferred content, but the main workspace, tab bar, preset bar, and terminal interactions must remain usable.
- [ ] Focused tests cover the new scheduling/memoization behavior, and desktop lint/typecheck pass.
- [ ] The task record includes the root cause and a prevention note so future performance fixes do not optimize one direction while leaving the opposite direction broken.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

## Validation Notes

- Desktop dev launched on isolated ports `3255/3268` against the online Docker
  backend ports `43000/43001/43012/43013`.
- Sign-in page smoke passed with screenshot/report:
  - `artifacts/dev-sign-in-smoke.png`
  - `artifacts/dev-sign-in-smoke.json`
- Direct shell login to `http://localhost:43001/api/auth/sign-in/email`
  succeeded. Renderer login failed because the desktop dev CSP allows
  `http://127.0.0.1:*` but not arbitrary `http://localhost:*`; the dev bundle
  still resolved `NEXT_PUBLIC_API_URL` to `http://localhost:43001`. Because of
  that validation-environment issue, this run did not complete real `sailor`
  account Desktop Automation measurements.
