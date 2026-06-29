# Terminal And Host Runtime

## Package Boundaries
- `packages/pty-daemon` owns live PTYs and is standalone. It must not import from `@superset/host-service` or other workspace packages; host-service consumes protocol types through `@superset/pty-daemon/protocol`.
- `packages/host-service` is the local machine service. It owns Hono routes, SQLite state, git/runtime managers, event bus, terminal WebSocket routes, and daemon supervision.
- `apps/desktop/src/main` coordinates Electron windows and packaged services. Renderer code talks to Electron main through tRPC from `apps/desktop/src/lib/trpc` and to host-service through typed clients.

## IPC And Subscriptions
Desktop Electron IPC uses tRPC. For `trpc-electron`, subscriptions must return observables, not async generators.

```ts
import { observable } from "@trpc/server/observable";

publicProcedure.subscription(() =>
  observable<MyEvent>((emit) => {
    const handler = (event: MyEvent) => emit.next(event);
    emitter.on("event", handler);
    return () => emitter.off("event", handler);
  }),
);
```

Source: `apps/desktop/CLAUDE.md` and `apps/desktop/src/lib/trpc/routers/index.ts`.

## PTY Byte Fidelity
- PTY input and output bytes ride in the pty-daemon frame binary payload tail. Do not base64 encode them inside JSON.
- Do not decode output with per-chunk `chunk.toString("utf8")` in the data path. The host-service observer path uses `StringDecoder` only for string callback compatibility.
- Primary terminal WebSocket output is binary; renderer/xterm consumes `Uint8Array`. Control messages remain JSON.
- Current slow-renderer handling is bounded buffering, not protocol ACK flow control. The daemon broadcasts output without `ack-output`; host-service closes a renderer socket once its buffered amount exceeds the configured cap, then the renderer reconnects and replays the bounded terminal tail.
- PTY input bytes are semantic, including repeated identical chunks. Do not
  debounce or dedupe terminal input by comparing the previous `data` string;
  repeated characters (`ll`), repeated Backspace, repeated arrows, and repeated
  Enter are valid terminal input.

### Scenario: Terminal Byte Transport And Slow Renderer Handling

1. Scope / Trigger
- Applies when editing `packages/pty-daemon`, `packages/host-service/src/terminal`, or desktop terminal WebSocket transport.

2. Signatures
- Daemon protocol: `InputMessage { type: "input"; id }` plus binary payload tail.
- Daemon protocol: `OutputMessage { type: "output"; id }` plus binary payload tail.
- Renderer socket: binary output frames plus JSON control frames (`attached`, `error`, `exit`, `title`).

3. Contracts
- Input/output bytes must remain byte-native end to end.
- Daemon subscribe messages use `{ replay: boolean }`; do not add renderer ACK state unless the protocol and tests are deliberately reintroduced.
- Slow renderer recovery is reconnect + replay, not daemon-side PTY pause/resume.

4. Validation & Error Matrix
- Missing daemon session -> protocol `error` with the session id.
- Oversized daemon frame -> decoder throws and closes the socket.
- Renderer socket buffer over cap -> host-service closes that renderer socket; PTY session stays alive.

5. Good/Base/Bad Cases
- Good: `daemon.input(id, Buffer.from(bytes))` writes bytes through the payload tail.
- Base: no renderer attached means host-service stores bounded replay bytes.
- Bad: base64 in protocol JSON, per-chunk UTF-8 output decoding, or resurrecting `output-ack` without matching daemon/client tests.

6. Tests Required
- `packages/pty-daemon/test/no-encoding-hops.test.ts` for byte path regressions.
- `packages/pty-daemon/src/protocol/*` for frame shape changes.
- `packages/host-service/test/integration/terminal.integration.test.ts` for real daemon lifecycle behavior.

7. Wrong vs Correct
- Wrong: treat output as strings or require renderer ACKs to keep the PTY running.
- Correct: keep bytes in binary frames, bound slow sockets, and rely on reconnect replay.

### Scenario: Mobile Terminal Input Fidelity

#### 1. Scope / Trigger
- Applies when editing mobile Terminal input, terminal keyboard accessory
  buttons, xterm helper textarea bridging, `v2Workspace.writeTerminalInput`, or
  any write queue that forwards PTY bytes from mobile to a host terminal.

#### 2. Signatures
- Mobile component callback: `onInput(data: string) -> void`.
- Cloud route:
  `v2Workspace.writeTerminalInput({ workspaceId, terminalId, data })`.
- Accessory keys send raw PTY data such as `"\r"`, `"\u007f"`, `"\t"`,
  `"\u001b[A"`, and `"\u0003"`.

#### 3. Contracts
- Forward every non-empty input chunk in order through the write queue.
- Do not drop a chunk only because it equals the previous chunk or arrives
  within a short time window.
- Any duplicate suppression must happen at the event-source boundary, where the
  duplicate source can be proven, not at the PTY byte write boundary.
- Enter must send carriage return (`"\r"`), and Backspace must send DEL
  (`"\u007f"`).

#### 4. Validation & Error Matrix
- `printf 'STILL_LL_OK\n'` loses one `L` -> input fidelity failure.
- Repeated Backspace deletes only once -> input fidelity failure.
- Accessory Enter sends `"\n"` instead of `"\r"` -> PTY compatibility failure.
- The keyboard remains focused but output appears only after app reload ->
  mobile terminal rendering failure.

#### 5. Good/Base/Bad Cases
- Good: mobile sends `printf 'STILL_LL_OK\n'`, terminal renders
  `STILL_LL_OK`, and both `L` characters survive.
- Base: mobile sends `echo ABX`, Backspace, `C`, Enter, and terminal renders
  `ABC`.
- Bad: a `lastInput.data === data` guard drops the second `L` or repeated arrow
  key within a debounce window.

#### 6. Tests Required
- Focused mobile source test must assert the terminal write path has no
  previous-input debounce/dedupe guard.
- Simulator validation must include at least one repeated-character command and
  one Backspace/Enter path against a real relay-backed host terminal.

#### 7. Wrong vs Correct

Wrong:

```ts
if (lastInput?.data === data && Date.now() - lastInput.sentAt < 120) {
  return;
}
```

Correct:

```ts
terminalInputQueueRef.current = terminalInputQueueRef.current
  .catch(() => undefined)
  .then(() => writeTerminalInput(data));
```

## Daemon Lifecycle
- The daemon runs under Node 20+ via Electron's bundled Node. Bun is the build/test tool, not the production daemon runtime.
- The Unix socket file mode `0600` is the auth boundary; do not add ad hoc in-band tokens to the pty-daemon protocol.
- Protocol version negotiation happens with `hello` and `hello-ack` in `packages/pty-daemon/src/protocol/messages.ts`.
- Upgrade handoff preserves live sessions by passing PTY master fds to a successor process. Preserve tests in `packages/pty-daemon/test/handoff.node-test.ts` and `packages/host-service/src/terminal/terminal.adoption.node-test.ts` when changing adoption.
- In desktop development, Electron spawns host-service children per organization and terminates them on app quit. PTY survival across host-service restarts comes from `packages/pty-daemon` adoption and replay, not from host-service itself. Treat "Electron closed but background work continues indefinitely" as a separate product/runtime requirement unless a task explicitly implements durable background supervision.
- Any production-affecting change under `packages/pty-daemon/src/` must bump
  `packages/pty-daemon/package.json#version`. Host-service derives
  `EXPECTED_DAEMON_VERSION` from that package version; without a bump, packaged
  desktop apps can adopt an already-running old daemon and never execute the
  new code. `bun run lint` includes `scripts/check-pty-daemon-version-bump.ts`
  to guard this, but reviewers should still treat the version bump as part of
  the runtime contract, not as release bookkeeping.
- When investigating a packaged terminal failure, compare the observed error
  text/log schema with the new code path. If the installed app still emits an
  old diagnostic shape after a canary update, assume a stale host-service or
  stale pty-daemon process is being adopted until logs prove otherwise.
- macOS `node-pty` packaged runtime uses a `spawn-helper` executable next to the
  loaded native binding. If desktop packaging prunes `node-pty/build` and keeps
  only `prebuilds/darwin-${arch}`, the target prebuild's `spawn-helper` must be
  present and executable (`0755`). A packaged runtime validation that only checks
  `pty.node` exists is insufficient: `node-pty` can load the native binding and
  still fail every terminal open with `posix_spawnp failed` when the helper lacks
  execute permission.

### Scenario: Packaged Daemon Code Change And Version Handoff

#### 1. Scope / Trigger
- Applies when editing `packages/pty-daemon/src/**`,
  `packages/host-service/src/daemon/**`,
  `packages/host-service/src/terminal/**`, or desktop packaging that affects
  the daemon bundle.

#### 2. Signatures
- Version source:
  `packages/pty-daemon/package.json#version`.
- Host-service expectation:
  `EXPECTED_DAEMON_VERSION` from
  `packages/host-service/src/daemon/expected-version.ts`.
- Daemon runtime report:
  `hello-ack.daemonVersion` from the socket handshake.
- Packaged bundle:
  `apps/desktop/dist/main/pty-daemon.js`.

#### 3. Contracts
- Runtime daemon implementation changes require a daemon package version bump.
- Old daemons must be marked `updatePending=true` and either auto-updated or
  updated before opening a new session, using fd-handoff rather than killing
  live shells.
- Handoff validation must prove a stale daemon reports an old version before
  update and a successor reports the newly bundled version after update.
- A successful GitHub canary build only proves artifact production. It does not
  prove an installed desktop is no longer attached to a stale local daemon.

#### 4. Validation & Error Matrix
- `EXPECTED_DAEMON_VERSION` still equals the old package version after a code
  change -> release blocker.
- Packaged app emits the old error/diagnostic shape after installing a new
  canary -> inspect host-service logs, daemon manifest, and running daemon
  version before changing spawn logic again.
- `update()` fails during fd-handoff -> predecessor daemon must keep serving
  existing sessions; surface update failure and keep `updatePending=true`.
- `ensureCurrentBeforeOpeningSession()` skips a stale daemon -> terminal open
  can continue to fail with old runtime behavior.

#### 5. Good/Base/Bad Cases
- Good: edit `Pty.ts`, bump daemon version, focused tests show
  `EXPECTED_DAEMON_VERSION` is the new version, Node handoff tests show
  `0.0.1 -> newVersion`, and canary publishes from that commit.
- Base: docs/tests-only changes under `packages/pty-daemon` do not require a
  daemon version bump.
- Bad: edit daemon spawn behavior, publish canary, see GitHub green, but leave
  package version unchanged so users keep adopting the old daemon.

#### 6. Tests Required
- `bun --eval 'import { EXPECTED_DAEMON_VERSION } from "./packages/host-service/src/daemon/expected-version.ts"; console.log(EXPECTED_DAEMON_VERSION)'`
  or an equivalent assertion in the task notes.
- `bun test packages/host-service/src/daemon/DaemonSupervisor.test.ts packages/pty-daemon/src/Pty/Pty.test.ts`
- `bun run build:daemon` from `packages/pty-daemon` before real Node daemon
  tests.
- `bunx tsx --test packages/host-service/src/daemon/DaemonSupervisor.node-test.ts`
- `bun test packages/host-service/test/integration/terminal.integration.test.ts`
- `bunx tsx --test packages/host-service/src/terminal/terminal.adoption.node-test.ts`

#### 7. Wrong vs Correct

Wrong:

```text
The canary build passed, so users must be running the fixed daemon code.
```

Correct:

```text
The canary build passed, the daemon version changed, host-service expects the
new version, and handoff tests prove stale daemons converge before new PTYs open.
```

### Scenario: Workspace Terminal Session Discovery

#### 1. Scope / Trigger
- Applies when editing `terminal.listSessions`, `terminal.countBackgroundSessions`,
  remote workspace attach UI, daemon adoption, or anything that enumerates
  existing terminal sessions for a workspace.

#### 2. Signatures
- tRPC list:
  `terminal.listSessions({ workspaceId }) -> { sessions: TerminalSessionSummary[] }`.
- tRPC count:
  `terminal.countBackgroundSessions({ workspaceId, attachedTerminalIds }) -> { count: number }`.
- Daemon source:
  `DaemonSupervisor.listSessions(organizationId) -> SessionInfo[] | null`.
- SQLite source:
  `terminal_sessions.id`, `originWorkspaceId`, `status`, `createdAt`.

#### 3. Contracts
- Host-service memory (`listTerminalSessions`) is the best source for
  `attached`, title, and active renderer sockets when this process created or
  adopted the session.
- The pty-daemon is the source of truth for PTYs that stayed alive across a
  host-service restart or remote attach before any renderer websocket has
  adopted them.
- Workspace session discovery must merge memory sessions with daemon live
  sessions joined to active SQLite `terminal_sessions` rows.
- Listing/counting must not create a new PTY. It may probe the already
  supervised daemon, and it must fall back to memory-only results if daemon
  listing is unavailable.

#### 4. Validation & Error Matrix
- Daemon unavailable or no supervisor socket -> return memory sessions only.
- Daemon reports a live id with no SQLite row -> ignore it.
- SQLite row is `disposed`, `exited`, or has no `originWorkspaceId` -> ignore it.
- Session exists in both memory and daemon -> keep the memory summary.
- `attachedTerminalIds` contains a daemon-only session -> background count
  excludes it.

#### 5. Good/Base/Bad Cases
- Good: host-service restarted, daemon still owns a PTY, SQLite row is active;
  `terminal.listSessions({ workspaceId })` returns a detached attachable
  summary with the original `createdAt`.
- Base: daemon has no live sessions or is unreachable; existing local
  memory-backed terminal lists continue to work.
- Bad: list/count only reads the process-local `sessions` map, making remote
  clients see zero terminals until a websocket manually opens the terminal id.

#### 6. Tests Required
- Host-service integration test stubs daemon `SessionInfo[]`, seeds
  `terminal_sessions`, clears memory sessions, and asserts both
  `terminal.listSessions` and `terminal.countBackgroundSessions`.
- Resource-session join tests must cover active, disposed, exited, orphaned,
  unknown, non-live, and invalid-pid daemon rows.

#### 7. Wrong vs Correct

Wrong:

```typescript
sessions: listTerminalSessions({ workspaceId, includeExited: false });
```

Correct:

```typescript
const memorySessions = listTerminalSessions({ workspaceId, includeExited: false });
const daemonSessions = await getSupervisor().listSessions(ctx.organizationId);
// Merge daemon live ids through terminal_sessions before returning summaries.
```

## Local Startup And Runtime Gotchas

- Host-service local DB is per organization at `${SUPERSET_HOME_DIR}/host/<organizationId>/host.db`. The coordinator passes this as `HOST_DB_PATH`.
- In local development, host-service migrations come from `packages/host-service/drizzle`.
- Desktop's encrypted `auth-token.enc` is the Better Auth session recovery
  token. Do not overwrite it with a short-lived JWT: Better Auth
  `/api/auth/get-session` can return `null` for a relay/JWKS JWT even though
  relay and Electric accept that JWT. If the renderer refreshes a JWT for
  Electric or relay-backed host control, keep the desktop session token intact
  and sync the JWT only to the host/CLI runtime config or in-memory JWT state.
- Runtime native modules such as `better-sqlite3` should be exercised under the intended Node/Electron runtime. Bun is fine for repo scripts and tests, but it is not a substitute for the packaged host-service runtime when validating native SQLite behavior.
- If manual recovery is needed, inspect host-service logs and the SQLite DB directly before changing cloud rows. A cloud `v2Workspaces` row without a matching local `workspaces` row can still leave workspace-local panes unusable.
- Mastra persisted chat memory can store submitted user turns with role `signal`
  rather than `user`. Runtime restart/edit/resend logic should treat both roles
  as user-originated restart targets, and regression tests should cover the
  persisted `signal` shape.
- Electron-vite can split host-service modules into `apps/desktop/dist/main/chunks`.
  The bundled pty-daemon entry remains at `apps/desktop/dist/main/pty-daemon.js`,
  so daemon script resolution must check both the current bundle directory and
  one parent directory before falling back to `packages/pty-daemon/dist`.

## Bundled Runtime Path Resolution

- Treat `import.meta.url` in host-service code as the current compiled module
  location, not as the Electron main bundle root. Electron-vite can place
  imported host-service modules under `dist/main/chunks`, while sibling process
  entrypoints such as `pty-daemon.js` stay in `dist/main`.
- Runtime script resolvers should be small, pure, and unit-testable with an
  injectable base directory and existence check. Cover at least:
  - direct side-by-side bundle path
  - electron-vite `dist/main/chunks` path resolving one level up
  - source-running fallback path
  - explicit env override
- Terminal or agent-facing desktop acceptance must trigger the actual runtime
  path. For Claude/terminal changes, clicking a settings tab is not enough:
  create or attach a terminal/agent session, then verify host-service logs show
  the expected `pty-daemon.js` path and socket bootstrap.

## Scenario: Desktop Auth Token And Host Relay Runtime

### 1. Scope / Trigger
- Applies when editing desktop auth persistence, CLI auth config sync,
  host-service startup, relay tunnel registration, or mobile host-control
  acceptance.

### 2. Signatures
- Desktop session storage:
  `auth-token.enc -> { token: string; expiresAt: string }`.
- CLI/host runtime config:
  `config.json.auth -> { accessToken: string; expiresAt: number; refreshToken?:
  string }`.
- Renderer JWT refresh: `authClient.token() -> { token: string }`.
- Better Auth session probe: `GET /api/auth/get-session`.

### 3. Contracts
- `auth-token.enc` stores the desktop session token used by
  `authClient.useSession()` and sign-in recovery.
- Relay/Electric JWTs are short-lived derived credentials. They may be stored in
  the CLI/host runtime config or renderer memory, but must not replace the
  desktop session token.
- Host-service may mint or pass through JWTs for relay registration, but a
  stale or invalid desktop session token must surface as a re-login requirement
  rather than a raw `Provide a bearer JWT, x-api-key, or session` message.

### 4. Validation & Error Matrix
- `auth-token.enc` missing -> desktop remains on sign-in and host-service does
  not start.
- `auth-token.enc` invalid/expired -> desktop remains on sign-in; mobile
  host-control should show desktop sign-in/relay-unavailable guidance.
- Relay/JWKS JWT sent to `/api/auth/get-session` -> `200 null`; do not treat
  this as a recoverable desktop session.
- Cloud `v2_hosts.isOnline=true` but relay has no tunnel -> host-control route
  returns `Host is not online`; mobile must downgrade the runtime state.

### 5. Good/Base/Bad Cases
- Good: desktop session token remains persisted, renderer refreshes JWT for
  Electric/relay, host-service starts after authenticated desktop layout mounts.
- Base: desktop is signed out; mobile can list workspaces but Chat/Terminal are
  disabled with explicit host disconnected/sign-in guidance.
- Bad: replacing `auth-token.enc` with a JWT and then relying on
  `authClient.useSession()` to restore desktop login.

### 6. Tests Required
- Unit-test JWT expiry parsing helpers if renderer code derives JWT expiry.
- Focused mobile tests should assert raw host auth failures are converted to
  desktop sign-in/relay guidance.
- Manual validation must include a protected API probe that may return
  `UNAUTHORIZED` but not `No procedure found`, plus one real relay-backed
  host-control result.

### 7. Wrong vs Correct

#### Wrong

```ts
await persistToken({ token: jwt, expiresAt });
setAuthToken(null);
```

#### Correct

```ts
await persistToken({ token: sessionToken, expiresAt: sessionExpiresAt });
setAuthToken(sessionToken);
setJwt(jwt);
await syncCliAuthConfigWithToken({ token: jwt, expiresAt: jwtExpiresAt });
```

## Source Examples
- `packages/pty-daemon/README.md` documents runtime, layout, testing, and out-of-scope items.
- `packages/pty-daemon/src/protocol/framing.ts` and `messages.ts` define wire format.
- `packages/pty-daemon/src/Server/Server.ts` implements handshake, flow control, replay, and handoff.
- `packages/host-service/src/terminal/terminal.ts` bridges daemon sessions to workspace terminal WebSockets.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates packaged host-service lifecycle.
