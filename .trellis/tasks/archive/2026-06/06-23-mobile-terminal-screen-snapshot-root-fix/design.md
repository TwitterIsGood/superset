# Technical Design

## Architecture

Add a host-service terminal screen snapshot layer next to the current mode
tracking layer.

Current data flow:

```text
pty-daemon output bytes
  -> host-service TerminalSession.buffer outputTail
  -> host-service modeTracker
  -> WebSocket renderer sockets
  -> mobile xterm raw replay / append
```

Target data flow:

```text
pty-daemon output bytes
  -> host-service TerminalSession.buffer outputTail (legacy/debug)
  -> host-service screenTracker (@xterm/headless + SerializeAddon)
  -> host-service modeTracker
  -> WebSocket renderer sockets
  -> mobile xterm live append

terminal.getSnapshot
  -> screenTracker.serialize()
  -> { format: "xterm-serialize-ansi", version: 1, cols, rows, content }
  -> cloud v2Workspace relay
  -> mobile TerminalEmulator snapshot restore
```

## Host-Service Boundary

Introduce a small terminal screen tracker module under
`packages/host-service/src/terminal/`.

Responsibilities:

- Own `@xterm/headless` and `@xterm/addon-serialize` setup.
- Feed PTY bytes synchronously or flush before serialization so snapshot reads
  are consistent.
- Resize only when the real host PTY resize occurs.
- Serialize with bounded scrollback.
- Expose a narrow payload:

```ts
type TerminalScreenSnapshot = {
  format: "xterm-serialize-ansi";
  version: 1;
  cols: number;
  rows: number;
  content: string;
  contentBytes: number;
  scrollback: number;
};
```

The `TerminalSessionSnapshot` response keeps:

```ts
{
  outputTail: string;
  bufferBytes: number;
  screenSnapshot?: TerminalScreenSnapshot;
}
```

`outputTail` remains for older clients and diagnostic fallback.

## Mobile Boundary

Mobile `WorkspaceMobileShell` should treat screen snapshots as authoritative for
initial attach/reconnect. Raw tail delta logic remains only as fallback when
`screenSnapshot` is absent.

`TerminalEmulator` should accept an explicit snapshot restore payload that
includes dimensions. The WebView runtime already supports snapshot operations
with optional `rows` and `cols`; the React bridge must pass them together, not
send restore then resize as separate operations.

Expected order:

```text
mount xterm
-> fixed resize to host cols/rows
-> restore serialized snapshot in same snapshot operation
-> append future live output deltas
```

## Performance And Resource Budget

| Area | Design Choice | Expected Impact |
| --- | --- | --- |
| Host CPU | Feed one headless xterm per terminal session on output | Similar class to existing `modeTracker`, bounded by terminal output volume |
| Host Memory | One screen model plus finite scrollback per terminal | O(cols * rows + scrollback), no per-client copies |
| Client Memory | Mobile holds current rendered xterm plus output state | Prefer snapshot content over ever-growing initial raw replay |
| Network | Snapshot only on attach/reconnect/poll, live bytes remain incremental | No high-frequency full-screen sync |
| Desktop UX | Mobile observer never sends claiming resize | Desktop terminal size remains stable |
| Mobile UX | Attach shows coherent current screen instead of stale/smeared raw tail | Better first paint; live typing remains WebSocket fast path |

Guardrails:

- Snapshot serialization should have a conservative scrollback cap.
- If serialized content grows too large, cap scrollback or omit nonessential
  history before returning a snapshot.
- Do not push snapshots through the live WebSocket every output frame.

## Compatibility

- Existing desktop terminal behavior should not change.
- Existing mobile clients without `screenSnapshot` support can continue using
  `outputTail`.
- If an older host lacks `terminal.getSnapshot.screenSnapshot`, cloud/mobile
  fallback should preserve the current behavior.

## Risks And Mitigations

- **Risk: SerializeAddon is not currently a host-service dependency.**
  Mitigation: add it to `packages/host-service` dependencies using the same
  pinned beta version already used by desktop.
- **Risk: xterm writes are async.**
  Mitigation: use the same internal synchronous write path pattern already used
  by `terminal-mode-tracker`, or flush before snapshot reads.
- **Risk: large scrollback snapshots are expensive.**
  Mitigation: serialize a bounded scrollback count and expose metadata for
  observability.
- **Risk: fallback raw tail still smears.**
  Mitigation: new clients prefer `screenSnapshot`; fallback is explicitly legacy
  only.

## Rollback

The rollback point is the optional `screenSnapshot` field. If the new tracker
causes runtime trouble, remove mobile preference and host snapshot generation
while keeping existing `outputTail` behavior.
