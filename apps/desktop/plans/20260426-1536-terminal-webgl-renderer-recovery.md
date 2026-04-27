# Stabilize long-running v1 terminal WebGL rendering

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows the repository conventions in `AGENTS.md`, the desktop-specific guidance in `apps/desktop/AGENTS.md`, and the ExecPlan template used by `/create-plan`.

## Purpose / Big Picture

Superset Desktop's terminal can become visually corrupted after a long-running Claude Code session. Users report that the terminal starts normally, becomes garbled after sustained use, can sometimes be temporarily fixed by selecting all text with Command+A, and returns to normal after restarting the app. After this work, users should be able to keep WebGL terminal rendering enabled for performance while the app automatically refreshes or resets the xterm WebGL renderer before visual corruption becomes persistent.

The observable outcome is that a long-running terminal session using Claude Code's TUI output remains readable across tab switches, workspace switches, window focus changes, and sustained output. If corruption still occurs, the user or developer should be able to trigger a renderer reset that restores display without killing the PTY process, losing scrollback, or restarting the app.

## Assumptions

The affected app is `apps/desktop`, specifically the legacy v1 workspace terminal pane. The user confirmed the affected Canary URL is `#/workspace/...`, not `#/v2-workspace/...`, so the fix must target the v1 terminal implementation under `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/`. The terminal frontend is xterm.js: React renders a host `div`, v1 `helpers.ts` creates `new XTerm(...)`, and `terminal.open(wrapper)` mounts xterm into a wrapper managed by `v1-terminal-cache.ts`.

The underlying shell output is not corrupt. The evidence from the investigation was that the terminal history files are valid UTF-8, app restart can make the same conversation display correctly, and Command+A selection can temporarily repair light corruption by forcing a repaint. This points to renderer state, not PTY data, UTF-8 decoding, or ANSI parsing as the primary failure mode.

WebGL must remain enabled. Disabling `@xterm/addon-webgl` globally is not an acceptable fix because DOM or canvas rendering would increase CPU usage too much for this product's terminal workload.

The first implementation must target only the v1 terminal stack. Do not implement the first fix in the v2 `renderer/lib/terminal/*` runtime unless a separate v2 reproduction is confirmed later.

## Open Questions

No product decision blocks the first implementation. The thresholds for periodic maintenance are intentionally conservative defaults in this plan and should be adjusted after manual validation if they prove too aggressive or too weak.

One follow-up question remains for later tuning: should the renderer reset be exposed to users as a visible command, a context-menu item, or only as an internal developer hook? This does not block the automatic recovery work because the first implementation can expose a registry method and use it from internal call sites.

## Progress

- [x] (2026-04-26 15:36 local) Created the initial ExecPlan from the terminal rendering investigation and user feedback.
- [x] (2026-04-26 15:36 local) Confirmed the codebase has both v1 and v2 terminal paths using xterm.js and `@xterm/addon-webgl`.
- [x] (2026-04-26 15:36 local) Confirmed the currently affected Canary panel is v1 because the URL is `#/workspace/...`, not `#/v2-workspace/...`.
- [x] (2026-04-26 local) Added a v1 terminal renderer maintenance API that can refresh, clear the WebGL texture atlas, and recreate the WebGL addon without killing the terminal session.
- [x] (2026-04-26 local) Call the maintenance API when a terminal is reattached to a visible container and when the Electron window regains focus.
- [x] (2026-04-26 local) Added conservative output-volume and time-based maintenance for visible, active terminals.
- [x] (2026-04-26 local) Ran the existing focused lifecycle throttle test and desktop typecheck; no new direct WebGL unit test was added because xterm/WebGL is browser-renderer stateful and the existing test already covers the throttle retry behavior.
- [ ] Manually validate long-running Claude Code TUI sessions in the desktop app with WebGL enabled.
- [x] (2026-04-26 local) Filled in `Outcomes & Retrospective` after implementation and validation.

## Surprises & Discoveries

- Observation: The terminal stack is not a custom renderer; it is xterm.js in the renderer process with WebGL acceleration.
  Evidence: `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` creates `new XTerm(...)`, opens it into a wrapper, and loads addons through `loadAddons()`.

- Observation: The WebGL addon is currently hidden inside a closure, which prevents runtime-level recovery actions.
  Evidence: `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` declares `let webglAddon: WebglAddon | null = null` inside `loadAddons()` and only exposes `dispose` in `LoadAddonsResult`.

- Observation: The v2 terminal keeps xterm alive across React unmounts by parking the wrapper in a hidden container.
  Evidence: `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` defines `getParkingContainer()` and `detachFromContainer()` moves `runtime.wrapper` there instead of disposing xterm.

- Observation: User reports fit a renderer-state problem better than a data problem.
  Evidence: Restarting the app fixes existing content; Command+A sometimes clears corruption; a new terminal starts clean but can become corrupt later under similar workload.

- Observation: The legacy v1 terminal test already describes recovery as clearing a stale WebGL texture atlas, fitting the terminal, and forcing a full repaint.
  Evidence: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.test.ts` documents `clearTextureAtlas`, `fitAddon.fit()`, and `xterm.refresh()` as reattach recovery steps.

- Observation: The current v1 implementation no longer had a production `scheduleReattachRecovery` helper even though the test models one; the active attach path lives in `v1-terminal-cache.ts` and `helpers.ts`.
  Evidence: `useTerminalLifecycle.ts` calls `v1TerminalCache.attachToContainer(...)`, while `helpers.ts` owns the `WebglAddon` closure.

- Observation: `bun --filter @superset/desktop test <path>` did not treat the repository-root path as a file path for Bun's test filter, but running Bun from `apps/desktop` with a relative `./src/...test.ts` path executed the focused test.
  Evidence: The first command reported the filter did not match any test files; `bun --cwd .../apps/desktop test ./src/.../useTerminalLifecycle.test.ts` ran 3 passing tests.

## Decision Log

- Decision: Preserve WebGL rendering and add self-healing around it instead of disabling WebGL.
  Rationale: The user explicitly said WebGL performance is required and DOM/canvas fallback would burn too much CPU. The observed issue is intermittent long-running renderer corruption, so a targeted renderer reset is lower cost than changing the renderer permanently.
  Date/Author: 2026-04-26 / Claude

- Decision: Implement recovery in the v1 terminal cache/lifecycle layers.
  Rationale: The user confirmed the affected Canary URL is `#/workspace/...`, which maps to the legacy v1 workspace terminal rather than the v2 pane route. The v1 cache owns xterm reuse, addon cleanup, wrapper attachment, dimensions, and stream lifecycle, so it is the correct layer to refresh, clear the atlas, and recreate WebGL for the current bug.
  Date/Author: 2026-04-26 / Claude

- Decision: Use a three-level recovery ladder: repaint, clear atlas, recreate WebGL addon.
  Rationale: Command+A recovery suggests a repaint is enough for light corruption. Severe corruption that survives repaint may require `clearTextureAtlas()`. If the addon or WebGL context itself is bad, disposing and loading a fresh `WebglAddon` is still less disruptive than restarting the app or killing the PTY.
  Date/Author: 2026-04-26 / Claude

- Decision: Start with low-frequency triggers: visible reattach, window focus, and conservative active-output maintenance.
  Rationale: The issue appears after long use and tab/window lifecycle events. Frequent atlas clearing would undermine WebGL's glyph caching benefits, so the first implementation should avoid per-write or per-frame maintenance.
  Date/Author: 2026-04-26 / Claude

- Decision: Keep the implementation exclusively in the v1 terminal files and use the v2 runtime only as reference.
  Rationale: The affected Canary route was confirmed as `#/workspace/...`; adding the first fix to `apps/desktop/src/renderer/lib/terminal/*` would not address the reported v1 panel and would increase blast radius.
  Date/Author: 2026-04-26 / Claude

- Decision: Install one v1 window-focus listener from the cache module instead of one active listener per terminal instance.
  Rationale: Focus recovery should be global to visible cached v1 terminals and should not multiply with each mounted terminal React component.
  Date/Author: 2026-04-26 / Claude

## Outcomes & Retrospective

Implemented v1-only renderer recovery in `helpers.ts`, `v1-terminal-cache.ts`, `Terminal.tsx`, and `hooks/useTerminalStream.ts`. The WebGL addon remains enabled and is now wrapped by a small maintenance surface that can refresh, clear the texture atlas, recreate WebGL, coalesce/throttle requests, and run output-volume maintenance only after at least 10 minutes and 10 MB of visible terminal output.

Reattach now schedules a `clear-atlas` recovery after fitting the wrapper into the visible container. A single window-focus listener recovers visible cached v1 terminals. Active visible stream writes are counted for conservative atlas maintenance, while hidden/unmounted terminals continue receiving data without per-write clears.

Validation run: `bun --cwd /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop test ./src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.test.ts` passed 3 tests; `bun --filter @superset/desktop typecheck` passed. Manual long-running Canary/dev visual validation was not run in this coding pass.

## Context and Orientation

This work affects the desktop app only: `apps/desktop`. It does not require database changes, migrations, API app changes, or shared package changes. It is renderer-process work, meaning the code runs in Electron's browser-like renderer environment and must not import Node.js-only modules.

There are two terminal implementations in the desktop codebase. The legacy v1 terminal lives under `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/`. It uses `useTerminalLifecycle.ts`, `v1-terminal-cache.ts`, and tRPC terminal subscriptions. The v2 terminal lives under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/` and uses the shared runtime files in `apps/desktop/src/renderer/lib/terminal/`.

Before coding, verify which implementation the affected panel uses. In the running app, a v2 panel is rendered by the route containing `/v2-workspace/` and the React component `TerminalPane.tsx` calls `terminalRuntimeRegistry.mount(...)`. Its runtime creates a body-level parking container with DOM id `v2-terminal-parking`. A v1 panel uses the older `WorkspaceView/ContentView/TabsContent/Terminal` components and the `v1TerminalCache` APIs. If the garbled Canary panel is not on the v2 route or does not create/use `v2-terminal-parking`, stop and update this plan to target v1 or both implementations before making renderer recovery changes.

The terminal path currently assumed by this plan is the v2 workspace pane. `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx` renders the terminal pane. It imports `@xterm/xterm/css/xterm.css`, creates a container `div`, and calls `terminalRuntimeRegistry.mount(...)` to attach xterm to that container.

`apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts` owns renderer-side terminal entries. An entry combines a `TerminalRuntime`, a WebSocket transport, and link handlers. `mount()` creates or reuses the runtime, calls `attachToContainer()`, and then `TerminalPane` later calls `connect()` after the host-service session is ensured.

`apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` owns the actual xterm instance. It creates `FitAddon` and `SerializeAddon`, creates `new XTerm(...)`, opens it into a persistent `wrapper` div, loads optional addons, restores an initial buffer, and exposes `attachToContainer()`, `detachFromContainer()`, `updateRuntimeAppearance()`, and `disposeRuntime()`. `detachFromContainer()` persists serialized terminal state and moves the wrapper to a hidden body-level parking container instead of disposing it.

`apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` loads optional xterm addons. It loads clipboard, Unicode 11 width support, image rendering, search, progress, ligatures, and WebGL. WebGL is deferred with `requestAnimationFrame()` and uses `new WebglAddon()`. On context loss, the current code disposes the addon, sets the local variable to null, and refreshes the terminal. Because `webglAddon` is local to `loadAddons()`, other runtime code cannot currently call `clearTextureAtlas()` or recreate the addon.

`apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts` connects xterm to the host-service terminal session. Server messages of type `data` or `replay` call `terminal.write(message.data)`. User input flows in the other direction via `terminal.onData(...)`, which sends JSON `{ type: "input", data }` over the WebSocket.

The backend PTY uses `node-pty`; in the investigation, shell output was found to include many normal TUI control sequences from Claude Code. These include synchronized output markers, cursor movement, spinner redraws, color changes, and repeated repaint frames. Those are normal for a terminal UI and should be handled by xterm. The planned fix does not modify PTY data or the WebSocket protocol.

A glyph atlas is a GPU texture cache used by WebGL renderers. Instead of drawing every character from scratch on every frame, the renderer packs already-rendered glyphs into a texture and later draws cells by referencing pieces of that texture. If the atlas or the mapping from terminal cells to texture coordinates becomes stale or corrupt, text can appear as wrong fragments, colored blocks, or scrambled characters even though xterm's buffer still contains the correct text.

`clearTextureAtlas()` is a method on `@xterm/addon-webgl` that clears that glyph texture cache. It should not clear terminal content, kill the shell, reset scrollback, or modify the PTY. It forces WebGL to rebuild cached glyph textures on subsequent render. It is useful when the glyph cache is stale, but calling it too often reduces the benefit of caching.

## Plan of Work

First, confirm the affected panel path. Use the running app and code inspection to establish whether the panel is v2 or v1. Check whether the current route is under `/v2-workspace/`, whether the active terminal DOM is owned by a pane rendered from `TerminalPane.tsx`, and whether `document.getElementById("v2-terminal-parking")` exists after switching away from and back to a terminal. Also inspect pane data: v2 panes carry `TerminalPaneData` with `terminalId` and use `ctx.pane.id` as `terminalInstanceId`; v1 panes are older tab content managed by `WorkspaceView/ContentView/TabsContent/Terminal`. If this check shows the current Canary panel is v1, change the target files to the v1 cache/lifecycle files before implementing.

Second, change `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` so `loadAddons()` returns a small WebGL control surface in addition to `searchAddon`, `progressAddon`, and `dispose`. Keep the implementation local to this module so callers do not import `WebglAddon` directly. Add methods with object-style signatures where parameters are needed, following repository style. The control surface should include:

    type TerminalRendererResetLevel = "refresh" | "clear-atlas" | "recreate-webgl";

    interface TerminalRendererMaintenance {
      refresh(): void;
      clearTextureAtlas(): boolean;
      recreateWebgl(): boolean;
      maintain(options: { level: TerminalRendererResetLevel }): void;
    }

The exact exported shape can be adjusted during implementation, but it must let the runtime request a repaint, clear the atlas if WebGL is active, and recreate the WebGL addon if necessary. It should return `false` when WebGL is unavailable or skipped because the global `suggestedRendererType` is `"dom"`.

Second, make WebGL creation reusable inside `terminal-addons.ts`. Extract the current rAF body into a helper that attempts to construct `new WebglAddon()`, wires `onContextLoss`, loads it into the terminal, and stores the instance. `recreateWebgl()` should dispose the old addon if present, clear the local reference, and try the same helper again. If construction fails, keep the current behavior: set `suggestedRendererType = "dom"` and leave WebGL disabled for future runtimes.

Third, update `LoadAddonsResult` so `createRuntime()` can store the maintenance object on `TerminalRuntime`. Add a field such as `rendererMaintenance` to `TerminalRuntime` in `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`. Keep `_disposeAddons` for lifecycle cleanup. Do not expose raw addon instances outside the terminal runtime layer.

Fourth, add a throttled recovery scheduler in `terminal-runtime.ts`. It should be runtime-scoped, not global, because each terminal has its own xterm instance and WebGL addon. The scheduler should use `requestAnimationFrame()` so recovery happens after the wrapper is visible and layout is stable. It should coalesce multiple requests and avoid dropping a request that arrives inside the throttle window. This mirrors the lesson documented by the legacy v1 `useTerminalLifecycle.test.ts`: throttled recovery must schedule a retry after the remaining throttle duration rather than silently returning.

The recovery scheduler should support at least three levels. `refresh` calls `runtime.terminal.refresh(0, runtime.terminal.rows - 1)`. `clear-atlas` calls `clearTextureAtlas()` and then refreshes all visible rows. `recreate-webgl` disposes and reloads the WebGL addon if possible, then refreshes all visible rows. The scheduler should escalate to the strongest requested level when multiple calls are coalesced; for example, if `refresh` is queued and then `clear-atlas` is requested before the frame runs, the scheduled work should perform `clear-atlas`.

Fifth, call the scheduler from `attachToContainer()` in `terminal-runtime.ts`. After `container.appendChild(runtime.wrapper)` and `measureAndResize(runtime)`, schedule a `clear-atlas` recovery rather than only calling a synchronous refresh. This is the safest first automatic trigger because it runs when a terminal moves from the hidden parking container back to a visible DOM container. It directly targets stale renderer state after tab or workspace switches.

Sixth, wire a window focus trigger for mounted v2 terminals. The simplest implementation is in `terminal-runtime-registry.ts`: add a method such as `recoverVisibleTerminals(options: { level: TerminalRendererResetLevel })`, iterate entries, and schedule recovery only for runtimes whose container is visible. Then in `TerminalPane.tsx` or a registry module initialization path, add one `window.addEventListener("focus", ...)` listener that requests `clear-atlas` or `refresh` for visible terminals. Avoid adding one persistent listener per terminal if possible. If the listener is added in React, make sure cleanup removes it.

Seventh, add conservative active-output maintenance. Extend the transport or registry integration so the runtime is notified when data is written. The cleanest option is to add an optional callback to `connect(...)` in `terminal-ws-transport.ts` that receives the byte or string length for `data` and `replay` messages after `terminal.write(...)`. The registry can pass a callback that records bytes written on the runtime and schedules maintenance only when all of these are true: the runtime is visible, enough time has passed since the last atlas clear, and enough data has been written since the last atlas clear.

Use conservative initial thresholds to protect performance. A reasonable starting point is at least 10 minutes since the last atlas clear and at least 10 MB of terminal data written since the last atlas clear, only while the terminal is visible. Do not call `clearTextureAtlas()` on every `terminal.write()`, every spinner frame, every resize, or every second.

Eighth, add a manual internal reset entry point. Add a registry method such as `resetRenderer(terminalId: string, options: { level: TerminalRendererResetLevel }, instanceId?: string)`. This method should not kill the PTY, close the WebSocket, clear scrollback, or call `terminal.clear()`. It should only schedule renderer maintenance. This gives developers and future UI commands a way to recover a garbled terminal without app restart.

Ninth, keep the implementation intentionally narrow. Do not change terminal persistence, PTY spawning, WebSocket message formats, Claude Code behavior, or database state. Do not add visual corruption detection in the first pass. Pixel-level detection is likely brittle and can be revisited only after the manual and automatic reset paths exist.

## Concrete Steps

Work from the repository root:

    /Users/biangwua/Documents/biang/小玩意/superset

Inspect the current v2 terminal files before editing:

    grep -R "WebglAddon\|loadAddons\|attachToContainer\|terminalRuntimeRegistry" -n apps/desktop/src/renderer/lib/terminal apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace
    # Expected: references in terminal-addons.ts, terminal-runtime.ts, terminal-runtime-registry.ts, and TerminalPane.tsx

Edit `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` to expose renderer maintenance. Keep WebGL import usage contained in this file. Verify that disposal still cancels the deferred rAF and disposes any active WebGL addon.

Edit `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` to store the maintenance API, add the throttled scheduler, track last maintenance timestamps and bytes, and schedule recovery from `attachToContainer()`.

Edit `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts` to expose registry methods for visible-terminal recovery, manual reset, and output accounting.

Edit `apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts` if using the callback approach for data volume accounting. The transport should still write `data` and `replay` messages exactly once to xterm.

Edit `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx` only if the window-focus listener is most appropriate there. Prefer keeping renderer recovery lifecycle near the registry/runtime code if doing so avoids duplicated React listeners.

Add or update tests near the v2 terminal runtime. If direct xterm/WebGL testing is difficult in Bun, test the scheduler as a pure helper extracted from the runtime. The tests should prove that coalescing escalates to the strongest requested level, throttled requests are retried, and byte/time thresholds do not schedule maintenance too frequently.

Run focused desktop validation:

    bun --filter @superset/desktop test
    # Expected: desktop tests pass

    bun --filter @superset/desktop typecheck
    # Expected: TypeScript completes with no errors

Run repository-level validation before considering the work complete:

    bun run lint
    # Expected: no Biome lint errors

    bun run typecheck
    # Expected: no TypeScript errors across the monorepo

For desktop node-import validation, run the desktop script required by `apps/desktop/AGENTS.md` if present in the current branch:

    bun --filter @superset/desktop run lint:check-node-imports
    # Expected: no renderer Node.js import violations

If the script is not present in `apps/desktop/package.json`, note that in `Surprises & Discoveries` and rely on `bun --filter @superset/desktop typecheck` plus `bun run lint`.

## Validation and Acceptance

Functional acceptance is visual and must be validated in the desktop app with WebGL enabled. Start the desktop app using the Apple Silicon-safe startup flow for this environment, not a generic x64/Rosetta flow. If local memory guidance is available, follow it; otherwise run the desktop dev script from the repo root:

    bun --filter @superset/desktop dev
    # Expected: Electron desktop app opens in development mode

In the desktop app, open a v2 workspace terminal and run a Claude Code session or another TUI workload that produces frequent redraws, cursor movement, color changes, and mixed text. Keep the terminal active long enough to exercise sustained output, then switch to another tab, switch back, focus another app, refocus Superset, and verify that the terminal remains readable.

Acceptance criteria:

A terminal that has been parked and reattached should repaint cleanly without visible stale glyph fragments. Window focus recovery should not cause obvious repeated flicker. Sustained output should not trigger constant atlas clears. Manual `resetRenderer(..., { level: "clear-atlas" })` or equivalent developer hook should recover light corruption without killing the shell, closing the WebSocket, or clearing scrollback. If severe corruption persists, `recreate-webgl` should recover rendering without restarting the app.

Performance acceptance:

The fix must keep WebGL enabled for normal operation. Maintenance must be throttled and coalesced. It is acceptable to have a small one-frame repaint or brief atlas rebuild cost on tab reattach or window focus, but there should not be continuous CPU spikes caused by frequent cache clearing.

Safety acceptance:

The fix must not modify PTY data, strip ANSI sequences, change WebSocket protocols, or alter terminal history persistence. It must not call `terminal.clear()` as part of renderer recovery. It must not kill host-service terminal sessions.

## Idempotence and Recovery

The implementation is idempotent because renderer maintenance can be requested multiple times and should coalesce into one scheduled action. Calling `refresh`, `clear-atlas`, or `recreate-webgl` repeatedly should not change terminal content. If WebGL is not available, `clearTextureAtlas()` and `recreateWebgl()` should fail safely and leave xterm using its existing fallback renderer.

If the recovery scheduler introduces flicker or performance problems, reduce automatic triggers before reverting all work. The safest rollback path is to keep the manual registry reset method and disable only the output-volume trigger. The next safest rollback is to keep reattach/window-focus refresh and remove periodic atlas clearing.

If recreating the WebGL addon causes exceptions, catch those exceptions inside `terminal-addons.ts`, set `suggestedRendererType = "dom"` only when construction truly fails, and refresh the terminal so the fallback renderer can draw the buffer.

## Artifacts and Notes

Implementation distinction:

    v1 terminal:
      apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/
      -> useTerminalLifecycle.ts
      -> v1-terminal-cache.ts
      -> createTerminalInWrapper(...)

    v2 terminal:
      apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/
      -> terminalRuntimeRegistry.mount(...)
      -> apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts

Current v2 terminal render path:

    TerminalPane.tsx
      -> terminalRuntimeRegistry.mount(...)
      -> createRuntime(...)
      -> new XTerm(...)
      -> terminal.open(wrapper)
      -> loadAddons(terminal)
      -> attachToContainer(...)

Current data path:

    node-pty output
      -> host-service terminal session
      -> WebSocket message { type: "data", data }
      -> terminal-ws-transport.ts terminal.write(message.data)
      -> xterm buffer and WebGL renderer

Recommended recovery ladder:

    refresh:
      terminal.refresh(0, terminal.rows - 1)

    clear-atlas:
      webglAddon.clearTextureAtlas()
      terminal.refresh(0, terminal.rows - 1)

    recreate-webgl:
      webglAddon.dispose()
      webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
      terminal.refresh(0, terminal.rows - 1)

Do not implement this as:

    terminal.write(data)
    webglAddon.clearTextureAtlas()

That would clear the cache on every output batch and defeat the purpose of WebGL glyph caching.

## Interfaces and Dependencies

Use the existing xterm dependencies already declared in `apps/desktop/package.json`:

- `@xterm/xterm` for the terminal instance.
- `@xterm/addon-webgl` for WebGL rendering and `clearTextureAtlas()`.
- `@xterm/addon-fit` for fitting columns and rows to the visible container.
- `@xterm/addon-serialize` for existing buffer persistence.

No new dependency is required.

The runtime-level interface should make these operations available without exposing raw WebGL addon instances to React components:

    export type TerminalRendererResetLevel =
      | "refresh"
      | "clear-atlas"
      | "recreate-webgl";

    export interface TerminalRendererMaintenance {
      maintain(options: { level: TerminalRendererResetLevel }): void;
      recordWrite(options: { bytes: number }): void;
      dispose(): void;
    }

The registry-level interface should let callers recover one terminal or all visible terminals:

    resetRenderer(
      terminalId: string,
      options: { level: TerminalRendererResetLevel },
      instanceId?: string,
    ): void;

    recoverVisibleTerminals(options: { level: TerminalRendererResetLevel }): void;

The transport-level interface, if changed, should be additive:

    connect(
      transport: TerminalTransport,
      terminal: XTerm,
      wsUrl: string,
      options?: { onWrite?: (info: { chars: number }) => void },
    ): void;

Existing callers can omit `options`. The callback should be invoked only after data is written for `data` and `replay` messages.

## Revision Notes

- 2026-04-26 15:36 local: Created this plan from the investigation into long-running Superset Desktop terminal corruption. The plan focuses on preserving WebGL while adding repaint, atlas clear, and WebGL recreation recovery paths because user feedback showed restart and Command+A can restore display without changing terminal data.
- 2026-04-26 local: Revised implementation target from the original v2 runtime steps to the legacy v1 terminal stack after the affected Canary URL was confirmed as `#/workspace/...`. Implemented the recovery API in the v1 `helpers.ts` WebGL closure and exposed only maintenance methods through the v1 cache.
