# 根治移动端远程终端屏幕快照恢复

## Goal

Root-fix mobile remote Terminal attach/reconnect rendering by moving snapshot
ownership to the host terminal runtime. Mobile must no longer reconstruct a
fullscreen/TUI terminal by replaying an arbitrary raw `outputTail` into a new
xterm instance.

The user value is reliable cross-device Terminal viewing/control: a phone can
open a Terminal created on a desktop host without smearing Claude/Codex/TUI
output, without shrinking the desktop PTY, and without making the runtime heavy.

## Confirmed Facts

- The current host snapshot contract returns a bounded raw `outputTail`, not a
  terminal screen model.
- Current mobile attaches to existing terminals by storing the first raw tail as
  a baseline and appending overlap-safe deltas. This avoids some stale replay,
  but it cannot reconstruct the current TUI screen.
- Current WebSocket attach can replay host-service FIFO bytes through
  `replayBuffer`; those bytes are stateful PTY output, not an idempotent screen
  snapshot.
- `packages/host-service/src/terminal/terminal-mode-tracker.ts` already feeds
  every PTY output chunk into `@xterm/headless`, but it only tracks modes and
  preamble bytes. It does not serialize the screen.
- Desktop code already uses `@xterm/headless` plus `@xterm/addon-serialize` in
  `apps/desktop/src/main/lib/terminal/session.ts` and
  `apps/desktop/src/main/lib/terminal-host/headless-emulator.ts`.
- xterm SerializeAddon documents that serialized terminal data should be
  restored into a terminal of the same size it originated from, then resized
  only after if needed. Restoring raw tail data into a phone-sized xterm is less
  reliable than that recommended path.
- GoTTY/ttyd-style web terminals commonly treat PTY resize as a single shared
  window size problem or recommend tmux/screen for true multi-client sharing.
  Our product requirement is stricter: mobile should observe/control without
  stealing the desktop PTY size.

## Requirements

- Host-service must maintain a bounded headless terminal screen model per live
  terminal session.
- The screen model must be fed from the same byte-native PTY output path that
  already feeds mode tracking and renderer sockets.
- `terminal.getSnapshot` must return a new mobile-safe screen snapshot payload
  that includes:
  - serialized ANSI screen content,
  - `cols`,
  - `rows`,
  - snapshot byte/character size metadata,
  - enough format/version metadata for clients to branch safely.
- The existing `outputTail`/`bufferBytes` fields must remain for backward
  compatibility and debugging, but new mobile clients must prefer the screen
  snapshot.
- Mobile `TerminalEmulator` must apply host `cols`/`rows` before restoring a
  snapshot and must restore the host-provided serialized snapshot as one
  snapshot operation.
- Mobile must not claim/resize the shared host PTY when attaching to an existing
  remote terminal.
- Normal live output must continue to flow as binary WebSocket bytes / decoded
  text append on mobile. Full screen snapshots must not replace the hot path.
- Memory must be bounded:
  - one headless screen model per host terminal session,
  - finite scrollback for snapshot serialization,
  - no unbounded per-client screen copies.
- Network usage must be bounded:
  - full screen snapshot only on initial attach, reconnect, explicit refresh, or
    poll reconciliation,
  - normal live output remains incremental,
  - snapshot size cap should prevent pathological payloads from blocking mobile.
- Desktop UX must remain unchanged: mobile observer attach must not narrow or
  otherwise resize the desktop terminal.
- If screen snapshot generation fails, the app must degrade to current raw-tail
  behavior with an explicit code path, not a broken blank terminal.
- Add focused tests at host-service, cloud tRPC contract, and mobile rendering
  boundaries.

## Acceptance Criteria

- [x] Host-service exposes `screenSnapshot` from `terminal.getSnapshot` with
      stable format/version, `cols`, `rows`, and serialized ANSI content.
- [x] Host-service snapshot generation uses a bounded headless xterm model and
      does not mutate the real PTY dimensions.
- [x] `v2Workspace.getTerminalSnapshot` forwards `screenSnapshot` through relay
      and keeps legacy `outputTail` compatibility.
- [x] Mobile prefers `screenSnapshot` over `outputTail` on initial attach and
      reconnect.
- [x] Mobile applies host `cols`/`rows` before snapshot restore; no restore path
      writes host snapshot bytes into a phone-fit terminal first.
- [x] Existing mobile input latency and WebSocket input path remain intact.
- [x] Existing desktop tab/worktree state fixes in the parent task remain
      intact.
- [x] Focused tests cover:
      - host-service serialized screen snapshot after TUI-like cursor movement,
      - cloud relay payload type forwarding,
      - mobile screen snapshot preference over raw tail,
      - mobile restore-before-resize regression.
- [x] Root `lint`, relevant focused tests, and root `typecheck` pass or any
      blocked command is recorded with a concrete reason.
- [x] A new unsigned IPA is produced after validation so the user can sign and
      test on a real iPhone.

## Validation

- `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'`
- `bun test packages/host-service/src/terminal/terminal-screen-tracker.test.ts packages/host-service/src/terminal/terminal-mode-tracker.test.ts`
- `bun test packages/host-service/test/integration/terminal.integration.test.ts`
- `bun test packages/trpc/src/router/v2-workspace/v2-workspace.test.ts`
- `bun test packages/host-service/src/trpc/router/terminal/terminal.mobile-control.test.ts`
- `bun test packages/host-service/src/model-gateway/gateway.test.ts`
- `bun run --cwd apps/mobile typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run --cwd packages/host-service typecheck`
- `bun run lint`
- `bun run typecheck`
- `git diff --check`
- `HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 ALL_PROXY=socks5://127.0.0.1:7890 bun run --cwd apps/mobile build:ios:unsigned`
- iPhone 17 Pro simulator, iOS 26.2:
  - opened an authenticated workspace terminal,
  - sent `printf 'ZHONGWEN 中文宽字符测试 ABC ll 漢字 😀\n'`,
  - verified Chinese/wide characters, repeated letters, and emoji render in the
    correct columns,
  - restarted and re-entered the workspace terminal to verify it restores the
    current screen instead of replaying stale raw history.
- Verified the generated IPA by extracting it and checking that
  `Payload/Superset.app/main.jsbundle` and `Info.plist` were produced at the new
  build timestamp and that ATS keeps the `bj1.v.lhb.ink` HTTP exception.

Unsigned IPA:

- `/tmp/superset-mobile-ipa/Superset-unsigned.ipa`

## Notes

- Performance stance: this task must not introduce high-frequency full-screen
  replication. The headless model is a host-side state cache; serialized
  snapshots are recovery/attach artifacts only.
- Out of scope: building tmux-style independent panes, adding collaborative
  multi-cursor terminal editing, or changing pty-daemon binary framing unless a
  hard blocker appears during implementation.
