# Design

## Scope

This task targets v2 workspace renderer behavior:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAutoAttachBackgroundTerminal`
- `packages/panes`

No database schema changes are expected.

## Large Repo Sidebar Performance

### Historical Intent

`WorkspaceSidebar` lazy tab imports were introduced by `da56ec625`
(`Desktop performance architecture overhaul`) to reduce startup and base shell
cost. They are intentionally preserved. The bug was not "lazy loading exists";
the bug was that large `Files` / `Changes` surfaces paid repeat mount/render
cost on every tab switch.

### Current Shape

`WorkspaceSidebar` builds `Files`, `Changes`, `Review`, and `Models` tab
definitions but only renders `activeTabDef.content`. Heavy tab components are
lazy imported. This improves initial load but means every `Files` / `Changes`
switch can remount the heavy tab.

`Changes` does expensive mount-time work:

- derive `ChangesetFile[]` from git status and against-base data;
- group files by source kind;
- in folder mode, group by folder and sort groups/files;
- in tree mode, build directory shapes, Pierre status, and reset Pierre paths.

`Files` has its own Pierre model and pushes live git status into it. Repeated
mounts can rebuild model state and re-run directory bridge setup.

### Final Direction

Use a measured, layered fix that preserves first-load lazy imports:

1. Instrument the switching path in desktop automation so we can compare before
   and after.
2. Keep visited `Files` and `Changes` mounted only for large changesets
   (`gitChangeCount >= 500`). `Review` and `Models` remain lazy/unmounted.
3. Do not hide warm heavy tabs with `display: none`; virtualizers then lose
   container measurement and recreate visible rows on return. Instead, keep
   warm tabs in an `absolute inset-0` layer, mark inactive layers
   `invisible pointer-events-none`, and set both `aria-hidden` and `inert`.
4. Virtualize `ChangesFoldersView` rows with `@tanstack/react-virtual` using
   the shared `data-changes-scroll-container` scroll parent.
5. Memoize the `FilesTab` and `ChangesSidebarTab` component boundary so parent
   active-tab changes do not force avoidable re-renders of heavy tab hooks.

### Trade-Off

Keeping visited heavy tabs mounted uses more renderer memory than unmounting
them on every switch, but it avoids repeated main-thread work. The scope should
be limited to `Files` and `Changes` and only after a tab has been opened, so
workspace initial load stays light.

For `sailor/main`, the final hidden warm-tab strategy keeps about 46 virtualized
`Changes` rows in the DOM while `Files` is active. This is an intentional,
bounded memory/DOM trade-off: it avoids recreating the Radix-heavy visible rows
on every switch while avoiding the original thousands-row DOM cost.

## Terminal Tab Close Reliability

### Historical Intent

`useAutoAttachBackgroundTerminal` was introduced by `bce87902d`
(`fix(desktop): harden remote canary host sync`) so host machines can surface
remote-created or daemon-survived terminal sessions. It is product behavior, not
a bug. The fix must preserve auto-attach for real background/remote sessions.

### Current Shape

`Workspace` from `@superset/panes` handles close:

1. `closeTab` awaits `onBeforeCloseTab`.
2. `store.removeTab(tabId)` removes the tab and updates `activeTabId`.
3. A `useEffect` observes removed panes and calls `registry[pane.kind].onAfterClose`.
4. Terminal `onAfterClose` disposes the runtime and calls
   `workspaceTrpc.terminal.killSession`.

Separately, `useAutoAttachBackgroundTerminal` watches terminal sessions. When
there are no attached live terminals, it calls `focusOrAddTerminalPane(...)` for
the newest live background terminal.

This creates a race for explicit closes: after the tab is removed from local
state but before host-service marks the terminal exited, auto-attach can see the
same terminal as a background candidate and add it back. Then cleanup kills or
disposes the runtime, leaving an empty terminal tab.

### Final Direction

Introduce an explicit-close suppression path for auto-attach.

- Extend the existing terminal background marker module with a local
  "suppressed auto-attach" marker keyed by `workspaceId + terminalId`.
- When a terminal pane is closed normally, mark its terminal id suppressed
  before removing the pane/tab. This is wired through terminal pane
  `onBeforeClose`, tab close guard, and the `CLOSE_TAB` hotkey path so close
  entry points share the same boundary.
- `useAutoAttachBackgroundTerminal` passes suppressed ids into
  `getAutoAttachBackgroundTerminalId`.
- Clear suppression when the terminal session disappears/exits or after a short
  TTL. Avoid indefinite suppression of a future session if terminal ids can be
  reused.

This preserves existing behavior:

- intentional backgrounding still uses `markTerminalForBackground` and
  `consumeTerminalBackgroundIntent`;
- remote-created terminals still auto-attach when not suppressed;
- workspace unmount still releases runtimes without treating everything as
  user-close suppression.

## Validation Design

### Unit / Source Tests

- Add a regression test for auto-attach suppression:
  a terminal id in the suppressed set must not be selected even when it is the
  only live background session.
- Add a focused test for close/auto-attach ordering if the hook can be factored
  into a pure decision helper.
- Add tests for any extracted `Changes` grouping/tree utilities and caching
  helpers.

### Desktop Acceptance

Use worktree-local desktop startup:

```bash
bun run dev:worktree:start
bun run dev:worktree:status
```

Run Desktop Automation against the worktree `DESKTOP_AUTOMATION_PORT`.

Acceptance paths:

- open a v2 workspace with a large changeset fixture;
- switch `Files -> Changes -> Files -> Changes`;
- capture visual-stability report and screenshots;
- capture performance measurement from renderer `performance.now()` / RAF /
  long-task observer around tab switching;
- create/open a terminal tab, close it once, verify no blank `Terminal` tab
  remains and no terminal pane with the same id is auto-added.

If the real online `sailor` workspace is available in a signed-in Canary session,
use it as additional manual evidence, but do not make production account state
the only regression gate.

## Rollback

Changes should be isolated to v2 workspace sidebar and pane lifecycle. If a
large keep-alive approach regresses memory, it can be disabled while keeping the
terminal auto-attach suppression fix.
