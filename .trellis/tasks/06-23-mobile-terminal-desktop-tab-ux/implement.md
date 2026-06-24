# Implementation Plan

## Checklist

1. Update mobile terminal input flushing:
   - remove the long first-character delay;
   - preserve `terminalInputNormalization` behavior and repeated byte fidelity;
   - add/update focused tests.
2. Update mobile resize ownership:
   - make mobile WebView resize requests non-claiming by default;
   - only invoke `onResize` for claimed resize events;
   - stop mobile shell from writing phone dimensions to the host PTY;
   - preserve redraw/snapshot best-effort behavior.
3. Harden desktop pane layout hydration:
   - extract small pure helpers if needed for testability;
   - gate persistence until the current workspace snapshot has hydrated;
   - cover workspace A/B active tab restore with tests.
4. Add sidebar tab scoping regression coverage.
5. Validate:
   - `bun test apps/mobile/.../TerminalEmulator.test.ts`
   - `bun test apps/mobile/.../WorkspaceMobileShell.test.ts`
   - `bun test apps/mobile/.../terminalInputNormalization.test.ts`
   - focused desktop tests added/updated for pane layout/sidebar tab state
   - `bun run --cwd apps/mobile typecheck`
   - `bun run --cwd apps/desktop typecheck` or root `bun run typecheck` if shared types are affected
   - `bun run lint:fix`
   - `bun run lint`

## Rollback Points

- Mobile input constants can be reverted independently if immediate flushing exposes a real iOS composition bug.
- Mobile resize ownership is isolated to `TerminalEmulator` and `WorkspaceMobileShell`; rollback should restore host resize only if an explicit mobile-owned PTY use case is added.
- Desktop pane layout hydration can be reverted without touching persisted data because it only controls when existing `paneLayout` rows are read/written.

## Acceptance Notes

Desktop Automation CLI is not the primary gate for this task because the tab leak and mobile resize ownership are cheaper and more deterministically covered by source tests. If the final change touches Electron startup, routing, or host-service runtime ownership directly, add a real desktop smoke before finishing.

## Validation Results

- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/terminalInputNormalization.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'` — 57 pass.
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/paneLayoutSync.test.ts' 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/workspaceSidebarTabs.test.ts'` — 5 pass.
- `bun run --cwd apps/mobile typecheck` — pass.
- `bun run --cwd apps/desktop typecheck` — pass.
- `bun run lint:fix` — pass after formatting.
- `bun run lint` — pass.
- `bun run typecheck` — pass.
- `SUPERSET_MOBILE_PROFILE=online-canary bun apps/mobile/scripts/build-ios-unsigned.ts --profile online-canary ...` — archive succeeded and produced unsigned iOS app bundle.
- Manual IPA verification for `artifacts/mobile/unsigned/ats-20260623150952/Superset-unsigned-standard.ipa` — pass: zip root contains `Payload/Superset.app`, and `Info.plist` contains ATS HTTP exception for `bj1.v.lhb.ink`.
- `bun run --cwd apps/mobile typecheck` — pass after unsigned IPA packaging script fix.
- `bun run lint` — pass after unsigned IPA packaging script fix.
- `bun run typecheck` — pass after unsigned IPA packaging script fix.
- Real-device logging check — blocked at the moment: `xcrun devicectl list devices` only shows the iPhone/CoreDevice entry as `unavailable`, so live package logs cannot be captured until the phone is connected/unlocked/trusted on this Mac.
- Mobile Terminal input latency follow-up:
  - Root cause found in source: Terminal input was sent through per-chunk `v2Workspace.writeTerminalInput` tRPC mutations and serialized through `terminalInputQueueRef`; the existing live terminal WebSocket was used only for output. On real device/public relay this turns each typed chunk into a full HTTP relay round trip, so host echo can arrive seconds later.
  - Fix: WebView `input` messages now forward to `onInput`, and `WorkspaceMobileShell` sends terminal input through the attached live WebSocket first, falling back to the existing serialized tRPC mutation only when the socket is unavailable.
- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/terminalInputNormalization.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'` — 57 pass after live-input fix.
- `bun run --cwd apps/mobile typecheck` — pass after live-input fix.
- `bun run lint` — pass after live-input fix.
- `bun run typecheck` — pass after live-input fix.
- `git diff --check` — pass after live-input fix.
- Mobile Terminal remote-grid follow-up:
  - Root cause found from real-device screenshot: mobile stopped claiming host PTY resize, but local xterm still refit to the phone viewport while the real PTY/Claude TUI continued emitting output for the desktop host `cols`/`rows`. Fullscreen TUI output then wrapped/smeared on the phone.
  - Fix: host-service terminal list/snapshot/WebSocket attach now expose session `cols`/`rows`; mobile stores host terminal dimensions on the active terminal run; `TerminalEmulator` forwards those dimensions to the WebView; the WebView runtime pins xterm with `terminal.resize(cols, rows)` instead of refitting observer sessions to the phone width. Phone-local fit dimensions are still recorded separately for new mobile-created terminals.
- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/terminalInputNormalization.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'` — 59 pass after remote-grid fix.
- `bun test packages/host-service/test/integration/terminal.integration.test.ts` — 8 pass after remote-grid fix.
- `bun test packages/trpc/src/router/v2-workspace/v2-workspace.test.ts` — 16 pass after remote-grid fix.
- `bun run --cwd apps/mobile typecheck` — pass after remote-grid fix.
- `bun run lint:fix` — pass after remote-grid fix; formatted source/test files.
- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/terminalInputNormalization.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'` — 59 pass after formatting.
- `bun test packages/host-service/test/integration/terminal.integration.test.ts` — 8 pass after formatting.
- `bun test packages/trpc/src/router/v2-workspace/v2-workspace.test.ts` — 16 pass after formatting.
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/paneLayoutSync.test.ts' 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/workspaceSidebarTabs.test.ts'` — 5 pass after formatting.
- `bun run --cwd apps/mobile typecheck` — pass after formatting.
- `bun run lint` — pass after formatting.
- `bun run typecheck` — pass after formatting.
- `git diff --check` — pass after formatting.
- `SUPERSET_MOBILE_PROFILE=online-canary bun scripts/build-ios-unsigned.ts --profile online-canary --skip-prebuild --output-dir artifacts/mobile/unsigned/remote-grid-20260623-182908` — pass after remote-grid fix. Produced `/Users/bichengyu/Documents/toolProject/superset/artifacts/mobile/unsigned/remote-grid-20260623-182908/Superset-unsigned.ipa` (14 MB, sha256 `1972d97666dd25bf50e5f405ee1d997bbc1c0a450b5c2767bfcfee48eeaf14db`) and opened it in Finder for signing.
