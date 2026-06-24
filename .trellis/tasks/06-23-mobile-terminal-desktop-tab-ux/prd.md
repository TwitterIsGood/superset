# 修复移动端 Terminal 与桌面 Worktree 选项卡体验问题

## Goal

Fix two cross-device workflow regressions:

1. iPhone real-device Terminal input should feel responsive and must not cause the desktop Terminal viewport for the same PTY to become narrow.
2. Desktop workspace/worktree tab selection must be scoped per worktree. Switching from one worktree to another must restore that worktree's own selected tab instead of reusing the previous worktree's selected tab position.
3. Mobile workspace entry must reuse existing terminal tabs. Entering a
   worktree must select the newest live terminal if one exists, rather than
   racing terminal discovery and creating a new terminal tab.

The user value is predictable remote control: phone Terminal use should not damage the desktop session, and desktop context switching should return users to the exact place they left in each worktree.

## Confirmed Facts

- `TerminalEmulator` currently delays the first native input flush by 180ms and later flushes by 40ms before forwarding bytes to the host.
- Mobile Terminal resize messages are sent with `shouldClaim: true` during mount, output restore, and refresh. The mobile shell forwards these resize events to `v2Workspace.resizeTerminal` or the live terminal socket.
- Host-service treats a resize message as a real PTY resize and updates the shared session dimensions. A narrow iPhone xterm fit can therefore resize the same session observed by desktop.
- Desktop v2 pane layout is stored in `v2WorkspaceLocalState.paneLayout`, but the hook can subscribe before the per-workspace persisted layout is hydrated. A fast route switch can write an empty or wrong runtime snapshot back to the current workspace.
- The right workspace sidebar tab is stored in `v2WorkspaceLocalState.sidebarState.activeTab`; regression coverage should prove it remains workspace-scoped.
- Mobile terminal discovery is asynchronous. An auto-create effect that runs
  before the current workspace's `listTerminals` query returns can see an empty
  local `terminalSessions` array and create a duplicate terminal even though the
  host already has live tabs.

## Requirements

- Mobile Terminal input must forward every non-empty chunk in order with PTY byte fidelity. Repeated characters, repeated Backspace, Enter (`"\r"`), Tab, arrows, and Ctrl-C must not be debounced or deduplicated.
- Mobile Terminal must reduce native input buffering latency. The fix must not fake local echo; visible command text still comes from real PTY output.
- Mobile Terminal may locally fit its WebView/xterm for rendering, but it must not claim ownership of shared PTY resize for attached/observed sessions. Opening or typing in mobile must not shrink the desktop Terminal viewport for the same terminal.
- When mobile attaches to an existing terminal, it must render with the host PTY's `cols`/`rows` instead of reflowing the terminal buffer to the phone viewport. The phone viewport size may be remembered for future mobile-created terminals, but it must not replace the observed host grid.
- When mobile enters a worktree, it must wait for current-workspace terminal
  discovery before deciding whether to create a terminal. If any live terminal
  exists, it must select the newest one.
- Any redraw needed after mobile attach should remain best-effort and must not require changing shared PTY dimensions.
- Desktop v2 workspace pane state must hydrate from the selected workspace's own persisted row before runtime changes are written back. New workspace switches must not persist stale pane state from the previous workspace.
- Desktop right sidebar tab selection must remain stored per workspace and must not fall back to a global selected tab when switching worktrees.
- Add focused regression tests for both mobile terminal behavior and desktop workspace tab scoping.

## Acceptance Criteria

- [x] On mobile, typing a normal command starts forwarding input immediately or near-immediately; there is no 180ms first-character buffer.
- [x] On mobile, repeated-character and repeated-control input is preserved by source tests.
- [x] On mobile, WebView/xterm resize events no longer call the host resize path unless resize ownership is explicitly claimed. Current mobile terminal fit events do not claim resize ownership.
- [x] On mobile, attached remote terminals use host-reported `cols`/`rows` for local xterm rendering so fullscreen TUIs do not wrap or smear against the phone viewport.
- [x] On mobile, entering a worktree waits for terminal discovery and selects
      the newest live terminal before falling back to creating a new terminal.
- [x] On desktop, selecting a pane tab in workspace A, switching to workspace B, and switching back restores A and B independently.
- [x] Desktop pane layout persistence does not write an empty runtime state before the current workspace local state is ready.
- [x] Right workspace sidebar tab selection is covered by a regression test proving workspace A and B do not share the selected tab.
- [x] Focused tests, mobile typecheck where applicable, desktop focused tests, root lint, and root typecheck pass or any blocked command is recorded with a concrete reason.

## Notes

- Out of scope: fake local terminal echo, changing PTY-daemon protocol ownership, changing terminal lifecycle ownership, redesigning mobile terminal UI, or adding cloud-published desktop pane state.

## Validation

- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/utils/terminalTailDelta/terminalTailDelta.test.ts'`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/workspaceSidebarTabs.test.ts' 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/paneLayoutSync.test.ts'`
- `bun run --cwd apps/mobile typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint`
- `bun run typecheck`
- `git diff --check`
