# Design

## Mobile Terminal Input

`TerminalEmulator` already normalizes mobile text input before calling `onInput(data)`. The bug is not the byte mapping itself; it is the extra input flush buffering in front of the real host write. Replace the long first-character delay with immediate scheduling and keep the existing delta normalization path so repeated characters and control bytes remain real PTY input.

The terminal must not render fake local echo. User-visible terminal text continues to arrive from host PTY output through snapshots/live output.

## Mobile Resize Ownership

Mobile has two different resize needs:

- Local rendering: xterm in the WebView should fit the phone viewport.
- PTY ownership: host-service should resize the shared PTY only when a client intentionally owns the terminal viewport.

Current mobile resize messages conflate the two by sending `shouldClaim: true` and then calling `onResize`, which writes the phone dimensions back to the host. The mobile fix keeps local fit messages but sets them to non-claiming and only invokes `onResize` for bridge resize messages that explicitly claim ownership.

`WorkspaceMobileShell.handleTerminalResize` becomes a redraw/snapshot helper rather than a PTY resize writer for mobile observer surfaces. This prevents an iPhone viewport from narrowing desktop terminal panes while preserving best-effort redraw after mobile attaches.

For existing remote/desktop-created terminal sessions, mobile must also preserve the host PTY grid locally. Host-service includes `cols`/`rows` in terminal list, snapshot, and WebSocket `attached` frames. `WorkspaceMobileShell` stores those dimensions on the active terminal run, and `TerminalEmulator` forwards them to the xterm WebView. The WebView runtime treats supplied dimensions as a fixed observer grid and calls `terminal.resize(cols, rows)` instead of refitting to the phone width. Phone-local fit dimensions are still recorded separately through `onLocalResize` so newly created mobile terminals can start with a sensible phone-sized PTY.

## Desktop Worktree Tab State

`useV2WorkspacePaneLayout` owns the route-local pane store. It should:

- create a separate volatile pane store for each `workspaceId`;
- hydrate that store from the matching `v2WorkspaceLocalState` row;
- avoid writing runtime pane state back until the current workspace has been hydrated or the collection is ready and confirmed empty;
- ignore stale snapshots from a previous workspace switch.

This keeps cached TanStack DB rows visible, follows the cache-first rule, and avoids using ad hoc `localStorage`.

The right sidebar already reads/writes `sidebarState.activeTab` by `workspaceId`; add focused tests or pure helpers so the contract is guarded.

## Validation Strategy

Use source/unit tests for the exact regressions:

- Mobile `TerminalEmulator`: immediate input flush and non-claiming resize messages.
- Mobile shell resize: bridge resize from mobile does not call host resize APIs/socket writes.
- Desktop pane layout helper/hook: hydration gate prevents stale/empty writes and restores per-workspace `activeTabId`.
- Desktop sidebar state: selected tab is scoped by workspace id.

Manual follow-up after packaging should include real-device iPhone typing and opening the same Terminal on desktop to confirm desktop cols/rows do not shrink.

## Risks

- Immediate native input flushing could expose iOS TextInput composition noise. Keep existing normalization and backspace noise handling; only remove avoidable waiting.
- If a future mobile-created terminal needs PTY ownership, it should introduce an explicit ownership signal rather than silently reusing observer fit events.
- Desktop pane layout changes can affect startup hydration. Keep the change small and cover empty-ready, persisted, and switch scenarios in tests.
