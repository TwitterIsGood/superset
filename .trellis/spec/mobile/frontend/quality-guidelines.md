# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after edits that affect source files.
- Run `bun run lint` before pushing; warnings fail CI.
- Run focused tests for touched packages and `bun run typecheck` for broad type changes.
- Keep tests co-located with logic-heavy components, hooks, parsers, stores, and utilities.
- When adding Bun tests under `apps/mobile`, keep the test file's Bun types local with `/// <reference types="bun-types" />` and ensure `bun-types` is a mobile dev dependency; the mobile tsconfig includes test files in typecheck.

## Review Checklist

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.
- Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.

## Mobile Visual Acceptance

- Current 2026-06-21 Terminal-first slice: opening a Workspace/Worktree must
  land on a real Terminal surface by default. The surface must use Codex iOS
  native chrome, native menu/sheet controls where practical, and a terminal-only
  bottom input/accessory area. ACP Chat can remain as a real sibling session
  surface, but it must not be the default entry or visually mix with Terminal.
- Codex iOS screenshots supplied with the task are the current visual
  acceptance reference for the mobile foreground shell. Home should use black
  native-feeling chrome, a centered product title, horizontal host chips,
  compact project/session rows, and a bottom floating search/chat capsule.
  Workspace detail should use circular back/utility controls, compact
  title/subtitle, a right-side compose/overflow capsule, top operation controls,
  one full-screen active surface, native sheets/popovers, and a floating bottom
  composer. Paseo remains a product information-architecture reference for
  one-surface-at-a-time behavior and real window/session switching, not the
  primary visual target when Codex screenshots are provided.
- Prefer native Expo/iOS controls for mobile chrome: `NativeTabs` instead of a
  custom authenticated footer, Stack-native route gestures for back navigation,
  native `TextInput` for chat/terminal entry, native segmented controls for
  sheet mode selection, and `expo-glass-effect` or a solid fallback for
  floating glass capsules. A custom control must justify why no native control
  fits the interaction.
- When the supplied Codex iOS reference uses platform chrome, mobile
  acceptance should prefer the matching native control over a hand-built React
  Native modal: organization/account switching should use the SwiftUI
  `BottomSheet` wrapper, simple single-choice actions such as model, agent,
  permission, more, and worktree-window selection should use `ActionSheetIOS`
  on iOS, and custom drawers/sheets should remain non-iOS fallbacks or
  genuinely custom interaction surfaces. A visually similar custom overlay is
  not enough when the native control can express the interaction.
- Detail-route runtime selectors must not become a persistent second header
  row. Codex-reference acceptance requires a compact single header row plus the
  right-side operation capsule; Agent, Model, Window/session, Stop/End, and
  permission responses should be reached through native iOS menus/action sheets
  or the matching fallback on non-iOS platforms.
- Terminal acceptance requires RootShell-style input ownership: the
  xterm/terminal surface owns typing, tapping the terminal focuses the helper
  input and shows the iOS keyboard, and the only bottom chrome is a compact
  keyboard accessory row above that keyboard. Reject separate command composer
  capsules, stacked bottom toolbars, black terminal form blocks, and any flow
  that converts Terminal into a chat-style input form.
- Codex-style ACP permission prompts should not become large dashboard cards on
  iOS. Surface a compact pending-permission affordance in the floating composer
  (for example the shield control used in the Codex reference) and open the
  native permission `ActionSheetIOS` from there. Non-iOS fallbacks may keep an
  inline card, but the iOS conversation body should stay focused on ACP
  messages and tool output.
- Reject mobile UI that still reads as a desktop/web dashboard translation:
  custom web-style tab bars, `Sessions` top headers for the project switcher,
  full-width composer form blocks, model/agent/access selectors crowded into
  the bottom input area, hard status badges in every row, stacked Chat and
  Terminal bodies, or desktop metadata panels above the conversation.
- Host-unavailable empty conversation states should render as one compact ACP
  state, not a dashboard-style stack of repeated notices. Do not show a disabled
  `No chat model` chip when the host is offline, relay-disconnected, or access
  is still blocked and no real chat model has been loaded.
- Workspace, worktree, task, task-detail, and agent/code-work mobile surfaces
  should use compact row-first layouts for dense workflow data. Prefer grouped
  rows with 8-12px horizontal padding, 36-48px practical row height, 12-14px
  metadata, small status dots, and inline pills over large dashboard-style
  cards. Use full card framing only when a section is a real detail panel,
  form, modal, or repeated item that benefits from a boundary.
- Keep mobile agent/code-work surfaces conversation-first: status, latest
  session context, composer, pending action state, and terminal fallback should
  be visible as compact controls. Raw terminal controls must not visually
  dominate the primary agent prompt/composer surface.
- Workspace/worktree detail should use mobile information architecture. Do not
  shrink the desktop workspace window into one phone viewport. In the current
  2026-06-21 slice, the default worktree screen is a real Terminal surface:
  compact top bar, left-top worktree window switcher, terminal body, and
  terminal-only bottom input/accessory controls. The switcher is a real worktree
  window list, not a generic tools menu: it may show persisted Chat/ACP sessions
  and host-discovered Terminal sessions, plus real new-terminal/new-conversation
  actions and the corresponding machine/host status. Do not put fake Tools,
  Changes, Files, Web, Search placeholders, or a Workspace-return row in this
  drawer/menu; route return should be handled by the iOS side-swipe/back
  gesture. Render one active surface at a time; a Chat/ACP window renders
  structured chat timeline, and a Terminal window renders terminal output/input.
  Only mark pane/session state as live when the backing host/cloud data is
  actually synced to mobile.
- Worktree conversation management must stay inside the real window switcher.
  Long-press multi-select and swipe-left deletion may apply to Chat sessions,
  but Terminal rows must not show delete affordances unless there is a real
  terminal lifecycle/delete contract. Gesture implementation must preserve
  route edge-swipe back and vertical list scrolling; a pass requires exercising
  long press, multi-select toggle/cancel/delete, single-row swipe delete, and a
  Terminal row non-delete case on the simulator.
- For Codex-reference iOS acceptance, use native controls as the first choice:
  `NativeTabs` for app tabs, SwiftUI/Expo `BottomSheet` for organization and
  file-style sheets, `ActionSheetIOS` for single-choice window/agent/model/more
  and permission actions, `Alert.prompt` for simple text prompts, native
  `TextInput` for Chat prompts, and xterm-owned Terminal input with a native
  keyboard accessory row. A custom drawer/sheet may exist as a non-iOS fallback,
  but it must not be the primary iOS path when a system control can express the
  interaction.
- Desktop pane sync must stay honest. Mobile can list cloud-persisted
  `chat_sessions` and host `terminal.listSessions` rows today. It cannot
  truthfully list already-open desktop Web/Changes/Diff/File panes until the
  Electron-local `v2WorkspaceLocalState.paneLayout` state is published through a
  mobile-safe host/cloud contract. Pending panes must say which contract is
  missing instead of rendering hard-coded preview data.
- Treat desktop-to-mobile pane translation as a blocking acceptance failure. A
  worktree detail screen must not start with a metadata dashboard, a grid of
  tool buttons, or several desktop windows/panes stacked into one viewport.
  Reference Paseo's mobile information architecture instead: compact row lists,
  a left-top worktree window switcher, one active conversation/tool surface, and a
  bottom input owned by the active surface.
- Secondary or pending window surfaces must be honest. Do not render hard-coded
  fake diff/file/web rows to make a feature look wired. Until real host/cloud
  data is available, show a compact pending state that names the missing
  contract, while keeping the current slice's Terminal-first default honest and
  showing Chat only as a real sibling surface when persisted/runtime data backs
  it.
- Any scrollable mobile screen with a bottom tab bar, floating action button,
  floating search button, sheet grab area, or other bottom overlay must reserve
  bottom scroll inset/padding for `safeAreaBottom + overlayHeight + at least
  16px`. The final list/card/worktree row must be fully visible and tappable
  after scrolling to the end.
- Do not rely on `contentInsetAdjustmentBehavior="automatic"` alone when a
  custom or native floating tab bar overlays content. Add explicit
  `contentContainerStyle.paddingBottom`, footer spacer, or equivalent layout
  compensation owned by the screen.
- Use `getBottomOverlayScrollPadding(safeAreaBottom)` from
  `apps/mobile/lib/layout.ts` for scrollable authenticated screens that sit
  under the native floating tab/search controls. This keeps the overlay height
  consistent across Home, Tasks, task detail, and workspace detail surfaces.
- Mobile acceptance screenshots for scrollable list/detail screens must include
  the bottom-of-list state. Reject the screen if the last row's title, metadata,
  status text, trailing action, or tap target is clipped or covered by the
  bottom navigation/search controls.
- Bottom mobile tab bars are functional controls, not visual chrome. Prefer a
  normal layout-positioned bottom bar so app content naturally stops above it.
  If a screen intentionally uses an overlay/floating tab bar, it must reserve
  explicit scroll inset and prove the final row remains fully visible. Tab bars
  must use at least a 42px practical touch target per icon button and be
  verified by tapping every tab in the active simulator. A pass must confirm the
  destination surface changes after tapping, for example `Sessions` -> `Tasks`
  renders real task rows and `Settings` renders account/settings content. Do not
  accept a screenshot where the icons look correct but taps silently leave the
  user on the previous tab.
- Verify this on the active iOS simulator device class used for the task
  before marking the UI slice done. For the current iOS client work, that means
  at least the iPhone 17 Pro simulator.

## Mobile Functional Acceptance

- Screenshots alone are not sufficient for mobile workflow acceptance. Any
  mobile feature that claims Chat, Terminal, Workspace, Task, sync, or host
  control support must be exercised from the active iOS simulator/dev-client
  against the running local API.
- Manual mobile passes must start and end on the expected product account for
  the task, not a convenience dev account. For this iOS client task, verify the
  simulator header shows `Biang` before exercising Workspace/Chat/Terminal
  flows, and restore the simulator back to `Biang` before ending the pass if a
  dev account such as `Local Admin` was used for setup or auth testing.
- Before validating a mobile host-control flow, confirm the simulator is pointed
  at the current worktree's API server. A protected procedure probe may return
  `UNAUTHORIZED` without cookies, but it must not return `No procedure found`.
  Reject the slice if the simulator or curl probe is hitting a stale API process
  from another checkout. For local port-based validation, record the API
  process cwd from `lsof -p <pid> | rg cwd` or an equivalent check.
- Relay is a product remote-control capability for Superset mobile, not a
  throwaway development switch. Before accepting Chat or Terminal on a
  relay-backed host, verify the target machine has Relay enabled or record the
  explicit Relay-unavailable state shown to the user.
- Workspace ACP Chat acceptance must include:
  - opening a real synced worktree,
  - creating/selecting a conversation,
  - sending a prompt through the composer,
  - confirming `chat.createSession`, `v2Workspace.sendChatMessage`, and
    `v2Workspace.getChatSnapshot` reach the API,
  - confirming the simulator renders the host ACP snapshot rather than only an
    optimistic user bubble or start-status card,
  - recording the actual outcome: message sent and snapshot updated, host
    offline, host access denied, relay failure, runtime failure, or another
    explicit backend error.
- Mobile ACP Chat rendering acceptance must include a structured tool-call
  response and a Markdown table response. Tool calls and tool results may share
  provider ids, so React keys must include the part type and position, not only
  the provider id. Markdown text must render common ACP output shapes such as
  paragraphs, inline code, bold spans, fenced code blocks, and GFM-style tables;
  table pipes must not be left as unreadable plain text. After send, the user
  bubble must remain visible while stale host snapshots catch up, and the
  native composer input must visibly clear rather than leaving the submitted
  text in the iOS TextInput buffer.
- Mobile GFM table rendering must keep all columns inside the chat viewport
  unless the design explicitly provides a discoverable horizontal scroller.
  Weather/log/status tables with 3-5 columns should use full-width table
  layout, content-based flex weights, `flexBasis: 0`, `flexShrink: 1`, compact
  dense-cell typography, and at most two display lines per cell. A screenshot
  where the rightmost column is clipped, table borders extend under the phone
  chrome/composer, or date/status columns wrap solely because another column
  has a fixed minimum width is a mobile Markdown failure.
- Mobile ACP tool rows must not show stale `RUNNING` states. A `tool_call` may
  render as `RUNNING` only when it belongs to the last visible assistant message
  and the host snapshot still reports an active run with no later assistant
  text/reasoning/progress-settling part. A matching `tool_result` hides the
  prior call row; an orphan call must render as completed once later assistant
  content exists, the message is persisted, or the user stops/ends the run.
  Simulator acceptance must cover both states: a live prompt can show
  `RUNNING`, but after assistant text appears or Stop disables the running
  state, visible tool rows must say `DONE`/failed or be replaced by results.
- Mobile acceptance screenshots must not be covered by React Native LogBox,
  RedBox, debug bridge warnings, or other development overlays. A warning that
  can surface in the app UI, such as duplicate React keys or terminal WebView
  bridge debug output, is a blocking acceptance failure even when the underlying
  API call succeeded.
- Scenario: mobile Metro watch boundaries during host-control validation.
  1. Scope / Trigger: applies when editing `apps/mobile/metro.config.js`,
     changing mobile dev scripts, or validating Chat/Terminal against a
     worktree-local host-service. Host/chat runtime files under
     `.superset/`, `.trellis/`, `superset-dev-data/`, `.expo/dev/logs`, SQLite
     `*.db*`/`*.sqlite*` files, and build/cache directories are not mobile
     source and must not trigger Fast Refresh while the agent is answering.
  2. Signatures: `apps/mobile/metro.config.js` owns
     `config.watchFolders`, `config.resolver.nodeModulesPaths`, and
     `config.resolver.blockList`.
  3. Contracts: keep Expo-discovered workspace source folders watchable, keep
     root `node_modules` resolvable, and block volatile runtime paths. Do not
     set `watchFolders` to the whole monorepo root unless the same config also
     excludes runtime data paths. Generic `dist`/`build` block rules must not
     match package internals under `node_modules`; Expo Router resolves entry
     files from `node_modules/.../expo-router/build/*`.
  4. Validation & Error Matrix: runtime DB/WAL/log write during Chat ->
     no `metro:bundling:started`; source file change -> normal Fast Refresh;
     `Refreshing...` overlay during Chat acceptance -> blocking failure;
     blocked app source path -> configuration failure; RedBox such as
     `Unable to resolve module expo-router/build/qualified-entry` after a
     Metro restart -> block list is too broad and is a configuration failure.
  5. Good/Base/Bad Cases: Good: Chat writes `superset-dev-data/*.sqlite-wal`
     while the simulator keeps rendering the conversation without a blue
     `Refreshing...` overlay. Base: editing a mobile source file still
     refreshes the dev bundle. Bad: Metro watches the full worktree and every
     host-service DB write reloads the iOS app.
  6. Tests Required: run a config probe that asserts runtime paths match
     `config.resolver.blockList`, a representative mobile source path does not,
     and `node_modules/.../expo-router/build/qualified-entry.js` does not;
     during simulator Chat validation, record that runtime files changed while
     Metro logs did not emit a new `bundling:started` entry.
  7. Wrong vs Correct: wrong is `config.watchFolders = [monorepoRoot]` with no
     runtime path block list; correct is retaining Expo workspace source
     folders and adding block rules for `.superset/`, `.trellis/`,
     `superset-dev-data/`, `.expo` logs, build/cache directories, and local
     database files.
- Worktree switcher acceptance must include opening the left-top drawer and
  confirming it has no fake Tools section, no hard-coded Changes/Files/Web rows,
  and no in-drawer Workspace return action. It must show real Chat/ACP sessions
  and any real host Terminal sessions returned by
  `v2Workspace.listTerminals`; selecting a Terminal row must render a terminal
  surface instead of converting terminal output into ACP chat messages. Confirm
  the detail route returns to the workspace list through side-swipe/back
  gesture.
- Worktree switcher delete acceptance must cover gesture behavior against real
  rows: long-press a Chat row, select/deselect multiple Chat rows, cancel,
  delete selected Chat sessions, swipe left on a Chat row and invoke delete,
  and confirm Terminal rows do not reveal delete. During the same pass, confirm
  list vertical scroll remains smooth and the route edge-swipe/back gesture
  still works outside the row gesture region.
- Terminal fallback acceptance must include creating or selecting a real
  Terminal session. Record whether `v2Workspace.createTerminal` or
  `v2Workspace.listTerminals` returns a terminal id, whether
  `v2Workspace.getTerminalSnapshot` renders output, and whether
  `v2Workspace.writeTerminalInput` accepts input, or record the explicit host
  offline/access/relay/runtime error.
- Mobile Terminal input acceptance must include xterm focus and RootShell-style
  keyboard behavior. Tapping the xterm WebView should keep focus across
  polling/state updates, disable iOS autocorrect, autocapitalization, spellcheck,
  and offscreen helper-textarea corruption, and send typed data directly through
  `v2Workspace.writeTerminalInput`. A separate native command input row is a
  rejection case. The virtual Enter key must send `\r`, not `\n`. Simulator
  validation must execute a real command and show both the command echo and
  command output in xterm, then verify at least one virtual key path such as
  Ctrl-C, Tab, arrows, or Backspace.
- Mobile Terminal input acceptance must include repeated identical PTY chunks.
  Run a command such as `printf 'STILL_LL_OK\n'` and reject the slice if either
  `L` is dropped. Also test a Backspace path such as `echo ABX`, Backspace,
  `C`, Enter and confirm the host renders `ABC`. Do not accept previous-input
  debounce/dedupe guards in the mobile write path; repeated letters, repeated
  Backspace, repeated arrows, and repeated Enter are valid terminal input.
- Scenario: mobile Terminal snapshot attach and replay.
  1. Scope / Trigger: applies when mobile attaches to an existing host Terminal
     session, renders `v2Workspace.getTerminalSnapshot`, or changes the
     `TerminalEmulator` / xterm WebView bridge. This is a functional
     readability gate, not a visual polish gate.
  2. Signatures: mobile uses `v2Workspace.listTerminals({ workspaceId })`,
     `v2Workspace.getTerminalSnapshot({ workspaceId, terminalId })`,
     `v2Workspace.resizeTerminal({ workspaceId, terminalId, cols, rows })`, and
     `v2Workspace.writeTerminalInput({ workspaceId, terminalId, data })`.
  3. Contracts: `getTerminalSnapshot.outputTail` is a bounded output tail, not a
     terminal screen buffer. When attaching to an existing session, record the
     first `outputTail` as the baseline and do not replay it into xterm. Append
     only a detected delta from later snapshots. Newly created mobile Terminal
     sessions may render their own output immediately because mobile owns the
     session from creation. After the first mobile size report, sync cols/rows
     to the host and send a best-effort redraw input such as Ctrl-L so TUIs can
     repaint for the phone viewport.
  4. Validation & Error Matrix: first attach snapshot with no previous raw tail
     -> no replay; later snapshot with suffix/prefix overlap -> append only the
     non-overlapping delta; no overlap -> do not append ambiguous old output;
     missing host resize route -> Terminal remains interactive and redraw is
     still attempted; write failure -> surface explicit input failure on user
     action, not by corrupting the Terminal display.
  5. Good/Base/Bad Cases: Good: attaching to a fullscreen TUI or previously
     used shell shows a clean xterm viewport after resize/redraw without stale
     history smeared through the screen. Base: a plain shell prompt attaches
     with no left-edge clipping and subsequent Enter/input appears as terminal
     output. Bad: replaying the whole `outputTail` into xterm on attach,
     converting Terminal bytes into ACP Chat messages, or rendering Terminal
     output with wrapped React Native text.
  6. Tests Required: keep a focused test that asserts existing Terminal attach
     uses replay suppression, raw-tail baseline storage, delta matching, resize,
     and redraw input; keep a Terminal emulator test that asserts xterm WebView
     rendering instead of React Native text; simulator validation must include a
     screenshot after attaching to a real Terminal and the actual
     `getTerminalSnapshot` / `writeTerminalInput` outcome.
  7. Wrong vs Correct: wrong is `terminal.write(snapshot.outputTail)` on every
     attach; correct is `previous = rawTailById.get(id)`, store the first tail
     as baseline, then write only the overlap-safe delta once a later snapshot
     proves new output.
- Workspace rows and detail headers must distinguish host network state from
  host-control permission. Showing `Online` is not enough to imply Chat or
  Terminal can start. If `v2_users_hosts` access is missing or still syncing,
  disable host-control actions and show the reason before the user sends a
  prompt or creates a terminal.
- Task list acceptance must cover Electric-unavailable behavior. If the local
  Electric proxy is down or a task-related shape is not ready, the Tasks tab must
  render cached task rows first, then a protected API snapshot fallback such as
  `task.list`/`task.statuses.list`, or a clear retryable error. It must not stay
  on skeleton rows indefinitely just because `tasks`, `task_statuses`,
  `v2_projects`, `v2_workspaces`, or `v2_hosts` are not all ready.
- For every mobile manual pass, attach or record the simulator screenshots for
  bottom-of-list layout, Chat send result, Terminal attach result, and any
  blocking host-control state. The final status must say which flows actually
  started and which are still blocked by backend authorization or relay/runtime
  issues.

## Examples

- `apps/mobile/app/(authenticated)/(home)/index.tsx`
- `apps/mobile/screens/(auth)/sign-in/SignInScreen.tsx`
- `apps/mobile/components/ui/button.tsx`
