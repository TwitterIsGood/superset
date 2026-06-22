# Mobile Development Workflow

## Scope

Use this guide when building or reviewing `apps/mobile` product surfaces. It is
especially important for Workspace, Worktree, Task, Chat, Terminal, host-control,
and any screen that is being adapted from the desktop app.

## Product Shape

- Design from the phone workflow first. Do not begin by translating desktop
  panes, sidebars, dashboards, or multi-panel workspaces into a smaller viewport.
- Current 2026-06-21 slice: authenticated user sees Workspaces, opens a
  Workspace or Worktree, lands on a real host Terminal surface, and can
  create/attach/read/input through Superset relay/host-service. ACP Chat is a
  later sibling surface for this slice and must not be the default Worktree
  destination unless the task explicitly resets scope again.
- Treat the Codex iOS client screenshots supplied in the task as the current
  visual and control reference: black native-feeling chrome, centered app title
  on Home, horizontal host chips, compact project/session rows, round header
  controls, glass/capsule action areas, native sheets/popovers, and a floating
  bottom composer. Paseo remains useful for the product rule that one phone
  screen shows one active conversation or tool surface at a time, backed by real
  host/session data.
- When a task calls for mobile UI replacement, update the whole foreground
  product shell for the affected flow. A single restyled widget inside an old
  Superset dashboard/card screen is not acceptable. The result should read like
  a native iOS workflow client, not a web dashboard squeezed into React Native.
- Do not copy Paseo daemon, runtime, auth, or request code into Superset mobile.
  Superset mobile must use Better Auth, active organization state, Electric /
  TanStack DB collections, cloud tRPC, relay, and host-service contracts.
- Treat Relay as a first-class Superset remote-control feature, not as a
  development-only workaround. Mobile host-control UI may depend on Relay being
  enabled for the target machine, but user-facing states must explain Relay
  reachability as part of the product flow rather than exposing debug wording.
- For the current Terminal-first slice, Terminal is the primary Worktree
  destination. It must render as Terminal and use real host terminal routes,
  not ACP Chat messages or fake React Native terminal text. Web, Changes, Files,
  Diff, and ACP Chat stay secondary or deferred unless backed by real data.
- The left-top worktree window switcher is for real worktree windows and the
  corresponding machine/host status. It may show cloud-persisted ACP Chat
  sessions and host-discovered Terminal sessions. Do not put fake Tools,
  Changes, Files, Web, Search placeholders, or a "back to Workspace" row in this
  drawer. Return to the workspace list through the route's iOS side-swipe/back
  gesture.
- Conversation management belongs in that worktree window switcher. Chat
  sessions may support long-press multi-select deletion and swipe-left
  single-row deletion. Terminal rows are real host PTY sessions and must not
  expose delete affordances unless a real terminal lifecycle contract exists.
  Row gestures must be implemented with native/gesture-handler primitives that
  do not steal the route edge-swipe back gesture or vertical list scrolling.
- Do not show several desktop windows or tools stacked on one phone screen.
  Render one active surface at a time and navigate between surfaces.
- Prefer native Expo/iOS controls where the route allows it: `NativeTabs` for
  authenticated tabs, Stack-native back gestures and headers/toolbars where they
  fit, native `TextInput` for composers and terminal command entry, native
  segmented controls for sheet mode switches, and `expo-glass-effect` glass
  containers with safe fallbacks for floating action/composer chrome. Hand-built
  controls are acceptable only when the native control cannot express the
  required product interaction.
- Codex-reference iOS selectors should use system controls before custom
  overlays: organization/file-style panels use SwiftUI/Expo sheets, simple
  window/agent/model/more/permission choices use `ActionSheetIOS`, simple task
  titles use `Alert.prompt`, and custom React Native drawers remain fallbacks
  for non-iOS or interactions the system controls cannot represent.

## Implementation Flow

- Keep Expo route files under `apps/mobile/app/` thin. Put UI, hooks, local
  state, mappers, and business logic under the matching `apps/mobile/screens/`
  tree.
- Start each mobile slice by identifying the real backend source of truth:
  Electric row, cloud tRPC route, relay-host route, host-service runtime, or an
  intentionally pending contract.
- Use cache-first collection rendering. Existing Electric / TanStack DB rows
  stay visible while readiness flags catch up.
- Task list screens must not wait on every related Electric collection before
  leaving skeleton state. If no cached task rows exist and Electric is not ready,
  load a protected tRPC snapshot such as `task.list` plus `task.statuses.list`
  and render that snapshot with a compact "live sync unavailable" notice. If the
  snapshot fails too, render an explicit error with retry instead of an
  indefinite skeleton.
- If the screen needs host control, separate host network state from user host
  permission. Online host does not mean the current account can control it.
- Workspace/worktree detail screens that combine Electric rows with protected
  API fallback snapshots must scope fallback rows to the current route id before
  rendering or granting host control. Never reuse a previous route's
  `fallbackWorkspace`, `fallbackHost`, or host access assumption for the next
  worktree. While the relay-aware `host.list` snapshot is idle, loading, or
  belongs to another host id, Chat/Terminal must stay blocked in a
  checking/offline state instead of loading agents/models. Only a loaded
  fallback host matching the current `workspace.hostId` may grant host control;
  fall back to Electric host/access state only when the protected API snapshot
  fails.
- Do not treat cloud `v2_hosts.isOnline` as proof that mobile Chat or Terminal
  is relay-controllable. That row can be stale after desktop sign-out, host
  crash, or relay disconnect. Host-control screens may show the cached online
  hint, but the first real relay-backed request (`listAgents`, `listChatModels`,
  `getChatSnapshot`, `createTerminal`, or `listTerminals`) must be allowed to
  downgrade the UI to a `Host disconnected`/relay-unavailable state and disable
  sending or terminal attach until the desktop app signs in and reconnects.
- Keep pending surfaces honest. If Changes, Files, Web, Diff, or pane sync is
  not wired to a real host/cloud contract yet, render an explicit pending state
  that names the missing contract. Do not ship mock rows that imply real sync.
- Prefer compact rows and inline metadata for Workspace, Worktree, Task, and
  conversation lists. Large cards are reserved for forms, modals, or true detail
  panels.
- Keep Home, Workspace/Worktree detail, Tasks, and Task detail visually
  coherent. They should feel like one mobile client, not unrelated screens
  sharing only backend data.
- Home should follow the Codex project/session list model: a compact title
  area, horizontally scrollable host chips, project rows with folder affordance,
  plain session/worktree rows, and a bottom floating search/chat capsule. Do not
  reintroduce large project cards, table-like metadata grids, or a top title
  that says `Sessions` when the product surface is the Superset/Codex-style
  project switcher.
- Workspace detail should follow the Codex native screen model: a circular
  native back control, compact title/subtitle, right-side action capsule, native
  operation menus/sheets, one full-screen content surface, and bottom chrome
  owned by the active surface. In the current Terminal-first slice this means
  xterm owns typing and the only bottom chrome is a RootShell-style keyboard
  accessory row; there is no native command TextInput and no Chat composer on
  the Terminal surface. It must not show Chat and Terminal bodies together or
  place model/agent/status controls inside the bottom input/accessory area.
- The Codex reference rejects persistent second-row runtime chips on the detail
  route. Agent, model, window/session, stop/end, and permission actions belong
  in the header operation capsule or native iOS action sheets/popovers. Keep the
  body and bottom input focused on the active surface.
- Terminal controls should feel like a native input accessory: compact terminal
  keys above the iOS keyboard while xterm itself owns text input. Do not ship
  stacked black toolbars, full-width form blocks, separate command capsules, or
  any terminal flow that blurs/dismisses the keyboard after every command.
- If the host is offline, relay-disconnected, or not controllable by the
  current account, render that as a single compact conversation state. Hide
  unavailable model chips until a real model list or model error exists; a
  disabled `No chat model` chip in an offline empty conversation is a false
  affordance.
- When creating local optimistic state, show it immediately in navigation
  controls, then reconcile it when Electric or tRPC state arrives.
- Chat timelines that combine local optimistic sends with
  `v2Workspace.getChatSnapshot` must merge snapshots into the current timeline
  instead of replacing the whole message array. A stale host snapshot can arrive
  before the server-persisted user message; the mobile UI must keep any
  `mobile-*` pending user message until the snapshot contains an equivalent
  user message or later assistant output for that send. Sending a prompt should
  also follow the ScrollView to the bottom so the new user bubble is visible
  immediately in long conversations.
- The workspace composer must expose the active runtime explicitly. The Chat
  surface is ACP-style rendering backed by the host chat runtime, but mobile UI
  must not present `ACP Chat` as a backend agent name. Show the real/default
  chat backend label such as `Claude Code`, and let the user pick a chat model
  from `v2Workspace.listChatModels`. Terminal agents such as Claude Code and
  Codex are Terminal-surface choices and must show `Host default` for model
  state because their model and flags are owned by the host agent configuration.
  Do not hard-code a single `Codex ACP` label in the composer or make the send
  button depend only on Chat availability.

## Validation Flow

- A visual screenshot is not enough for mobile host-control work.
- Before simulator validation, confirm Metro and the API are running from the
  current worktree, not a stale checkout.
- Confirm the target host has Superset Relay enabled or record the explicit
  Relay-unavailable state. Passing Chat or Terminal by bypassing Relay is not a
  valid mobile acceptance path when the selected host is remote-controlled
  through Relay.
- For Chat, exercise the flow in the iOS simulator and record actual outcomes
  for `chat.createSession`, `v2Workspace.sendChatMessage`, and
  `v2Workspace.getChatSnapshot`.
- UI validation must compare Home and Workspace detail against the supplied
  Codex iOS screenshots. Reject the pass if the authenticated tab bar is still a
  custom web-style footer, if Home still uses the old `Sessions` header/card
  treatment, if the bottom composer is a full-width form block instead of a
  floating native capsule, or if model/agent/access selection appears as
  crowded bottom-composer controls rather than top operation controls or native
  sheets/popovers.
- Chat validation must open the composer Agent sheet and confirm it shows the
  real/default Chat backend label, not `ACP Chat` as an agent name. It must open
  the Model sheet and confirm Chat shows real chat models while Terminal
  surfaces show `Host default`.
- Chat validation must include a long conversation case: send a new prompt
  while older content is above the composer, confirm the user bubble remains
  visible after the input clears, and confirm the next snapshot/assistant update
  does not remove the bubble or leave a stale "Agent could not start" timeout
  error after host output is visible.
- Chat validation must include a structured tool-call response and a Markdown
  table response. Reject the slice if duplicate React keys trigger LogBox, if a
  tool result replaces the user bubble, if table pipes remain plain text, or if
  the native composer keeps showing the submitted prompt after send.
- Chat validation must confirm the selected Chat model id is sent
  through `metadata.model`. Terminal agent prompts must dispatch through
  `v2Workspace.runAgent` rather than Chat model metadata.
- For the worktree switcher, exercise the left-top control in the iOS simulator
  and reject the slice if it shows tool entries or an in-drawer Workspace return
  action. Confirm left-edge side-swipe returns to the workspace list.
- Worktree switcher conversation-management validation must exercise gestures,
  not just visual affordances: long-press a Chat row to enter multi-select,
  toggle at least two Chat rows, cancel selection, delete selected rows, swipe
  left on a single Chat row to reveal the destructive action, and confirm a
  Terminal row never exposes that delete action. After each gesture pass,
  confirm vertical scrolling still works inside the switcher and the detail
  route still returns to the workspace list through the left-edge back gesture.
- For Terminal fallback, exercise its dedicated tool entrypoint when that
  entrypoint exists, press Attach Terminal, and record the actual
  `v2Workspace.createTerminal` result.
- Terminal validation must exercise real input, not only terminal attachment.
  Tap the xterm area and confirm it stays focused across at least one polling
  interval, type into the focused terminal surface, and confirm xterm renders
  the command echo, command output, and next prompt. The virtual Enter key must
  send carriage return (`\r`), and at least one virtual control key such as
  Ctrl-C, Tab, arrow, or Backspace must be tested. Reject the slice if iOS
  autocorrect or candidate text corrupts terminal input, if a separate command
  input row appears, or if Terminal output only appears after a manual app
  reload.
- A terminal surface stuck on `等待终端输出...` is not enough evidence that the
  host terminal is empty or disconnected. Compare the active mobile terminal
  session with a relay/host `v2Workspace.getTerminalSnapshot` or host-service
  `terminal.getSnapshot` result. If the host snapshot contains prompt/output
  bytes, mobile must render them in xterm and must not leave the waiting overlay
  visible over an otherwise usable terminal surface. If snapshot polling,
  relay attach, host permission, or host-control reachability fails, mobile must
  hide the waiting overlay and render the explicit error/offline state instead
  of looking like it is still waiting for terminal bytes.
- For list/detail screens under floating tab/search controls, capture the
  bottom-of-list state and reject the slice if the final row is clipped.
- For Tasks, validate the Electric-unavailable path by stopping or omitting the
  local Electric proxy (`EXPO_PUBLIC_ELECTRIC_URL`, commonly port 3012) and
  confirming the page renders an API snapshot or explicit retryable error
  instead of staying on skeleton rows.
- A green host dot on a workspace row is not enough validation. For any
  selected worktree, record the actual relay-backed outcome from at least one
  host-control route. If relay returns `Host is not online` while
  `v2_hosts.isOnline` is true, mark the manual pass as blocked by stale cloud
  presence and require the UI to show `Host disconnected` or equivalent.
- Run `bun run --cwd apps/mobile typecheck` for mobile changes. Run root
  `bun run lint` before finishing source changes, and root `bun run typecheck`
  when shared types, tRPC, auth, or runtime contracts change.

## Reject Patterns

- A Worktree detail screen that opens to a metadata dashboard, button grid, or
  desktop pane replica.
- A "Paseo-inspired" patch that leaves Home, Tasks, or detail screens using the
  old large-card Superset mobile layout.
- A Chat/Terminal claim validated only by screenshots or optimistic UI.
- Hard-coded fake diffs, file trees, browser previews, or terminal output.
- Hiding cached rows because `isReady` is false.
- Importing host-only packages into the mobile bundle.
