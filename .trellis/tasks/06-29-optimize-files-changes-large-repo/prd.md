# Optimize Files and Changes large repo switching

## Goal

Make the v2 workspace sidebar usable on large repositories, especially the
online `sailor` workspace where switching between `Files` and `Changes` is
noticeably slow. Also fix the related v2 workspace tab lifecycle bug where
closing a terminal tab can leave an empty `Terminal` tab that requires a second
close.

The user value is direct: large workspaces should feel responsive and tab close
should be deterministic. This must be proven with real desktop behavior, not
only source inspection.

## User Reports

- In the `sailor` workspace, switching between `Files` and `Changes` is very
  laggy, especially when the repo has thousands of changed files.
- Closing a terminal tab sometimes does not close it. The tab remains visible
  as a blank `Terminal` panel and must be closed again.

## Confirmed Evidence

- `WorkspaceSidebar` lazy-loads and renders only the active sidebar tab content.
  Switching tabs unmounts the previous heavy tab and mounts the next one.
- The lazy sidebar tab boundary came from `da56ec625` / PR #19
  (`Desktop performance architecture overhaul`). It is a startup/render
  performance optimization, not an accidental implementation detail. This task
  must preserve lazy import and first-load behavior.
- `FilesTab` builds and updates a Pierre file tree and pushes git status through
  `model.setGitStatus(...)`.
- `Changes` builds grouped/folder/tree render state synchronously from
  `ChangesetFile[]`; folders and tree modes sort and render large sets on mount.
- Existing source has a lazy-tabs guard test, so any fix must preserve improved
  first-load behavior while avoiding repeat tab-switch work.
- V2 workspace tabs use `@superset/panes`, not the legacy `useTabsStore` panel
  state.
- Closing a terminal tab removes it from the local pane store, then terminal
  cleanup happens through pane registry `onAfterClose`.
- `useAutoAttachBackgroundTerminal` auto-attaches the newest live terminal
  session when no matching pane is attached. During close, the renderer can
  briefly have no attached terminal while the host terminal session has not yet
  been killed, so a just-closed terminal may be auto-attached again and then
  disposed, producing a blank terminal tab.
- The auto-attach hook came from `bce87902d`
  (`fix(desktop): harden remote canary host sync`). It is a remote/cross-device
  host-sync feature and must not be disabled globally to fix the close race.

## Requirements

### Files / Changes Performance

- Switching between `Files` and `Changes` in a large repo must avoid repeated
  heavy synchronous work on the renderer main thread.
- Preserve existing sidebar features: file selection, reveal, search button,
  git decorations, change filters, folder/tree/list view modes, open diff, open
  file, open in editor, refresh, branch selector, counts, and PR/review surfaces.
- Preserve initial route performance. Do not eagerly run every heavy tab hook on
  first workspace load unless it is guarded by a measurable threshold and proven
  not to regress startup.
- Avoid extra git/status fetches caused only by switching sidebar tabs.
- For large changesets, it is acceptable to render progressively, keep cached
  derived data, or keep expensive tab state warm, as long as the visible result
  remains complete and interactions keep working.

### Terminal Tab Close Reliability

- A user-initiated close of a terminal pane/tab must not be undone by
  auto-attach.
- Auto-attach must continue to work for genuinely background/remote-created
  terminals that are not attached locally.
- The fix must distinguish explicit close from intentional backgrounding and
  workspace switching.
- Closing a tab with one terminal pane should remove the tab in one click and
  should not leave an empty terminal panel.

### Measurement / Regression Gates

- Add deterministic source tests for pure state decisions where possible.
- Add a desktop acceptance path that exercises the real v2 workspace UI.
- Add a performance-oriented desktop measurement for sidebar tab switching:
  click action duration, frame delay/long-task evidence, and DOM churn/layout
  movement should be captured in task artifacts.

## Acceptance Criteria

- [ ] On a large-change workspace, switching `Changes -> Files -> Changes`
      renders the target panel without obvious blanking or long freeze.
- [ ] Repeated cached tab switches do not trigger avoidable `git.getStatus`,
      `git.listBranches`, `git.listCommits`, or filesystem tree reloads.
- [ ] Cached/repeated sidebar switch target: usable UI within 250 ms, with no
      single interaction long task over 100 ms in the measured window. If the
      real `sailor` workspace is noisier, record the measured baseline and show
      a material improvement.
- [ ] First opening `Changes` on a large workspace may show a lightweight
      loading/progressive state, but the app remains interactive and eventually
      shows all changes.
- [ ] Closing a single terminal tab removes it in one close action and does not
      re-add a blank `Terminal` tab.
- [ ] Auto-attach still surfaces a remote/background terminal session when the
      workspace has no attached live terminal and the session was not just
      explicitly closed locally.
- [ ] `bun run lint`, `bun run typecheck`, focused unit tests, and desktop
      automation/performance artifacts are recorded before finish.

## Notes

- This is complex and has two independently verifiable deliverables:
  1. large-repo `Files` / `Changes` sidebar responsiveness;
  2. deterministic v2 workspace terminal tab close.
- Do not use production database writes for reproduction.
- Prefer a disposable dev/perf fixture for automated gates. Real online Canary
  observation can be used as additional evidence when a signed-in session is
  already available.

## Final Validation Notes

- Target validated in dev: online `sailor/main`
  (`#/v2-workspace/a560f567-a50f-4a0e-897b-799922429b09`), showing `4637 files`
  and `+889270`.
- Final repeated cached switch measurements:
  - `Files`: max RAF delay `42.02ms`, max long task `52ms`.
  - `Changes`: max RAF delay `44.86ms`, max long task `52ms`.
- Final `Changes` folder mode renders about `46` virtual rows instead of
  thousands of changed file rows.
- First switch after a renderer reload still pays a one-time warm-up cost; this
  is recorded separately from cached switch acceptance.
- Terminal close acceptance: created a temporary terminal tab with `Cmd+T`,
  closed it once, waited more than one auto-attach polling interval, and no
  blank terminal tab was re-added.
- Artifacts:
  - `artifacts/sailor-main-switch-performance-final.json`
  - `artifacts/sailor-main-absolute-warm-final.png`
  - `artifacts/terminal-close-after-final.json`
  - `artifacts/terminal-close-after-final.png`
