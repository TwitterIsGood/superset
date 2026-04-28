# Redesign Android device preview for scrcpy-like performance

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the repository root `AGENTS.md`, the desktop-specific `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. This is desktop app work, so the plan lives in `apps/desktop/plans/`. The package manager is Bun. Electron work must respect the split between the main process, which can use Node.js and spawn subprocesses, and the renderer process, which is a browser-like environment and must not import Node.js modules. The current device bridge package uses Electron IPC, which means messages passed between the main process and renderer process.

## Purpose / Big Picture

Superset Desktop has a Devices panel that can mirror and control Android devices. Today, Android preview becomes unstable under load: when an external Detox automation test runs against the same physical Android device, the Devices panel can appear frozen, and after many swipes the mirrored image can become corrupted or glitchy. This matters because the Devices panel is meant to be a reliable live control surface while tests or agents operate the device, not another source of device pressure.

After this work, a user can run Android Detox tests in `/Users/biangwua/Documents/biang/小玩意/mrnForTestify` while keeping Superset Desktop open on the Devices panel. The panel should remain responsive, device discovery should not pile up repeated ADB commands, Android swipes should not spawn redundant tap commands, and the mirrored image should recover cleanly instead of staying corrupted. The implementation should move the Android design closer to scrcpy: scrcpy is an open-source Android mirroring tool that uses a persistent device-side server, a persistent video stream, and a separate persistent control channel instead of repeatedly spawning `adb shell input` commands during interaction.

This plan does not solve the problem by increasing the polling interval. A longer interval would hide some symptoms but leave the architecture fragile. The plan first stabilizes the current implementation and measures the remaining failure modes, then evaluates replacing or augmenting it with a scrcpy-backed Android transport.

## Assumptions

The affected app is `apps/desktop`, and the affected shared package is `packages/device-bridge`. The current Desktop app registers the device bridge from `apps/desktop/src/main/windows/main.ts`, exposes it through `apps/desktop/src/preload/index.ts`, consumes it in `apps/desktop/src/renderer/lib/device-bridge/`, and renders it in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/`.

The external Detox project is not part of this repository. It uses Android devices through ADB, the Android Debug Bridge. ADB is a host-side tool and daemon used to list Android devices, execute shell commands, forward ports, and communicate with Android apps and instrumentation. Because ADB is shared process-wide on the developer machine, Superset Desktop and Detox can compete for the same ADB server and physical device.

The word “scrcpy-like” in this plan means three concrete things. First, device discovery and control should not require repeated expensive commands for every user-visible update. Second, live video should have a robust frame lifecycle with backpressure and recovery when decode falls behind or the stream changes. Third, user input should travel over a persistent path separate from the video stream, or at minimum be coalesced and reduced so it cannot overwhelm the same ADB transport used by video.

This plan assumes we can make near-term improvements without bundling scrcpy immediately, but that the current `adb exec-out screenrecord` design is not a good long-term base for heavy interactive mirroring. `screenrecord` is Android’s built-in screen recording command. In this repository it emits a raw H.264 byte stream over ADB. H.264 is a compressed video format made of NAL units, which are low-level chunks of encoded video. Raw `screenrecord` lacks scrcpy’s richer framing, timestamps, rotation handling, and control socket.

## Open Questions

One unresolved question is whether Superset Desktop should eventually bundle a scrcpy binary, require users to install scrcpy separately, or implement a small Superset-owned Android server inspired by scrcpy. This impacts the long-term Plan of Work and packaging validation. The initial decision placeholder is in the Decision Log as “Decision pending: long-term Android backend.”

The question of first-pass iOS discovery behavior has been resolved for this stabilization pass. The implementation keeps the existing combined device-list IPC shape, but Android and iOS discovery now run as independently cached refreshes in the main process so a slow iOS refresh does not block returning the latest Android result. A future visible platform filter may still be useful, but it is no longer required for this stabilization milestone.

A third unresolved question is whether the preview should intentionally cap Android mirror resolution or bitrate to the visible panel size. scrcpy commonly supports maximum-size and bitrate controls because decoding full physical-device resolution at high bitrate inside a sidebar can be wasteful. This impacts video quality and validation. The initial decision placeholder is in the Decision Log as “Decision pending: default Android stream size and bitrate.”

## Progress

- [x] (2026-04-28 08:22Z) Inspected the current Android device bridge files and identified the device listing, live streaming, renderer decoding, and input injection paths.
- [x] (2026-04-28 08:22Z) Compared the current implementation with scrcpy’s design principles: persistent server, persistent sockets, encoded video framing, control channel, and low-latency decode.
- [x] (2026-04-28 08:22Z) Created this initial ExecPlan in `apps/desktop/plans/20260428-0822-android-device-stream-performance.md`.
- [ ] Add instrumentation around Android discovery, stream chunks, packetizer output, decoder queue size, and input command latency.
- [x] (2026-04-28) Stabilized device discovery without increasing the polling interval: `DevicesPanel` now skips overlapping refreshes and only updates React state when the returned device list differs.
- [x] (2026-04-28) Made device discovery non-blocking across platforms: the main-process device bridge now keeps independent Android and iOS list refreshes and returns cached per-platform results so a slow iOS refresh does not block Android updates.
- [x] (2026-04-28) Stabilized Android gestures locally: renderer pointer handling now defers action until pointer-up, so a click emits one tap and a drag emits one swipe with measured duration.
- [x] (2026-04-28) Hardened the current H.264 renderer path: Android startup buffers bounded early chunks until packetizer initialization, decoder timestamps use configured FPS, queue overload enters keyframe recovery, SPS/PPS recovery caches only parameter-set NALs, and the packetizer avoids full pending-buffer copies on every append.
- [x] (2026-04-28) Added Android stream lifecycle recovery: unexpected `screenrecord` exits now emit status, the main process restarts the Android live stream for the active session, and the renderer resets its decoder and packetizer when restart begins.
- [x] (2026-04-28) Ran independent code audit with the plan and scoped Android diff; audit returned PASS WITH FINDINGS and the objective fix-now findings were addressed.
- [x] (2026-04-28) Validated targeted code paths with `bun test packages/device-bridge`, `bunx biome check` on scoped files, and `bun run --filter "@superset/device-bridge" typecheck`.
- [ ] Prototype a scrcpy-backed Android backend and record evidence for the long-term backend decision.
- [ ] Validate under the target scenario after restarting the Electron main process: Superset Desktop Devices panel open while Detox runs against the same Android device.

## Surprises & Discoveries

- Observation: Android live preview currently does not use scrcpy, ffmpeg, or a device-side Superset server.
  Evidence: `packages/device-bridge/src/android/live.ts` starts `adb exec-out screenrecord --output-format=h264 --bit-rate ... --size ... -` and forwards stdout chunks.

- Observation: Every Android tap, swipe, text, home, and back action currently spawns a new ADB subprocess.
  Evidence: `packages/device-bridge/src/android/input.ts` calls the shared `run("adb", ...)` helper for `shell input tap`, `shell input swipe`, `shell input text`, and `shell input keyevent`.

- Observation: A single drag gesture currently sends a tap on mouse down and a swipe on mouse up.
  Evidence: `packages/device-bridge/src/renderer/device-stream.ts` calls `forwardTap` in `onMouseDown`, then calls `forwardSwipe` in `onMouseUp` if movement exceeds the drag threshold.

- Observation: The device list poll can overlap because the interval is 5 seconds but Android device listing has an 8 second timeout.
  Evidence: `DevicesPanel.tsx` uses `setInterval(refreshDevices, 5000)`, while `packages/device-bridge/src/android/devices.ts` calls `adb devices` with `{ timeout: 8_000 }`.

- Observation: The renderer subscribes to Android stream chunks before it creates the H.264 packetizer, so early chunks can be dropped.
  Evidence: `packages/device-bridge/src/renderer/device-stream.ts` registers `onAndroidLiveChunk`, then awaits `androidLiveStart`, then creates `new AnnexBPacketizer(...)`.

- Observation: Decode backpressure currently drops encoded access units without a recovery mode that waits for the next keyframe.
  Evidence: `packages/device-bridge/src/renderer/h264-decoder.ts` returned early when `VideoDecoder.decodeQueueSize > maxQueue`, then later resumed decoding arbitrary later units before this plan's implementation.

- Observation: The independent audit found that recovery initially cached whole access units containing SPS/PPS, which could prepend stale IDR data to a future keyframe.
  Evidence: `packages/device-bridge/src/renderer/h264-decoder-queue.ts` now uses `extractNalTypes(data, new Set([7, 8]))` and has a regression test named `caches only parameter sets from mixed access units`.

- Observation: The independent audit found that the plan's packetizer allocation-pressure item was marked complete before the packetizer was actually changed.
  Evidence: `packages/device-bridge/src/renderer/annex-b-packetizer.ts` now keeps chunk buffers and scans them without combining the full pending buffer on every append; `annex-b-packetizer.test.ts` covers start codes split across chunks.

- Observation: Android preview can freeze even after device discovery and decoder backpressure improvements if `adb exec-out screenrecord` exits and leaves the renderer showing the last decoded frame.
  Evidence: `packages/device-bridge/src/android/live.ts` now reports Android live stream close reasons even when stderr is empty, and `packages/device-bridge/src/register.ts` restarts the active Android live session after unexpected stream end.

## Decision Log

- Decision: Do not treat a longer poll interval as the primary fix.
  Rationale: The user explicitly rejected interval lengthening, and the evidence shows the deeper issue is repeated ADB work, lack of in-flight protection, fragile H.264 stream handling, and per-gesture ADB subprocesses. A longer interval would reduce symptoms but keep the same failure modes.
  Date/Author: 2026-04-28 / Claude

- Decision: The near-term implementation should stabilize the existing `screenrecord` path before replacing it.
  Rationale: The current code is already wired through the Devices panel and can be improved incrementally. Stabilization gives immediate value and creates instrumentation that will also help judge a scrcpy-backed prototype.
  Date/Author: 2026-04-28 / Claude

- Decision pending: long-term Android backend.
  Rationale: The options are to bundle or discover scrcpy, implement a Superset-owned Android server, or continue hardening `screenrecord`. This decision should be made only after a small scrcpy-backed prototype measures packaging cost, UI embedding cost, latency, and stability under Detox.
  Date/Author: Pending

- Decision: Keep the existing combined device-list IPC shape, but make Android and iOS refresh independently in the main process.
  Rationale: This preserves the current renderer API while avoiding the plan's blocker where slow iOS discovery delays Android updates. A visible platform filter can still be considered later, but it is not required to stop Android refreshes from being blocked by iOS work.
  Date/Author: 2026-04-28 / Claude

- Decision: Automatically restart the current Android live stream when `screenrecord` exits unexpectedly.
  Rationale: The user reported that after Detox manipulates the Android device, the physical device continues changing but the Desktop preview stays stuck on an old frame. The current raw `screenrecord` backend has no persistent server like scrcpy, so the safest near-term recovery is to treat unexpected stream end as a recoverable session event, restart the active stream, and reset renderer decoder state before feeding new H.264 chunks.
  Date/Author: 2026-04-28 / Claude

- Decision pending: default Android stream size and bitrate.
  Rationale: Full device-resolution H.264 at 30 Mbps inside a sidebar can waste CPU, memory bandwidth, and IPC bandwidth. scrcpy-like tools expose quality knobs. The default should be chosen based on measured visual quality and responsiveness.
  Date/Author: Pending

## Outcomes & Retrospective

The first stabilization pass is implemented and independently audited. The code now prevents overlapping renderer refreshes, avoids unchanged device-list state updates, makes Android and iOS discovery refresh independently in the main process, emits one input command per tap or swipe gesture, buffers early Android stream chunks until packetizer initialization, uses configured FPS for decoder timestamps, waits for clean keyframes after queue overload, caches only SPS/PPS NALs for recovery, reduces packetizer allocation pressure by avoiding a full pending-buffer copy on every append, and restarts the active Android live stream when `screenrecord` exits unexpectedly.

Validation passed for the targeted code paths: `bun test packages/device-bridge` passed with 26 tests, scoped `bunx biome check` passed after formatting, and `bun run --filter "@superset/device-bridge" typecheck` exited with code 0. The attempted command `bun --filter "@superset/device-bridge" run typecheck` failed with `No packages matched the filter`; this was a command-form issue, and the corrected Bun workspace filter command passed. After the Android stream restart changes, scoped formatting, `bun test packages/device-bridge`, and `bun run --filter "@superset/device-bridge" typecheck` passed again.

Remaining gaps are manual and strategic. The target Detox scenario has not yet been manually exercised after restarting the Electron main process, and the scrcpy-backed spike remains open. Instrumentation from Milestone 1 is also still open; the implementation focused on removing known pressure points and adding stream-exit recovery rather than adding full timing/status logs.

## Context and Orientation

This work affects the Desktop app and the shared device bridge package. The Desktop app is an Electron application. Electron has a main process, which is a Node.js process that can spawn `adb`, and a renderer process, which renders React UI and browser APIs like Canvas and WebCodecs. WebCodecs is a browser API that can decode compressed video frames. The bridge between main and renderer is Electron IPC, which means sending typed messages between the two processes.

The current Devices panel UI is in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/DevicesPanel.tsx`. The preview canvas is in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/components/DevicePreview/DevicePreview.tsx`. The picker for Android and iOS devices is in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/DevicesPanel/components/GroupedDevicePicker/GroupedDevicePicker.tsx`.

The renderer hook is `apps/desktop/src/renderer/lib/device-bridge/use-device-stream.ts`. It creates a `DeviceStream` from `packages/device-bridge/src/renderer/device-stream.ts`. `DeviceStream` owns the canvas, starts and stops live video, converts mouse coordinates to device coordinates, and sends tap or swipe commands through the IPC client.

The main process registers handlers from `packages/device-bridge/src/register.ts`. Android device listing is implemented in `packages/device-bridge/src/android/devices.ts` by running `adb devices`. Android live streaming is implemented in `packages/device-bridge/src/android/live.ts` by running `adb exec-out screenrecord --output-format=h264 ... -`. Android input is implemented in `packages/device-bridge/src/android/input.ts` by running `adb shell input ...` commands.

The H.264 renderer pipeline is in `packages/device-bridge/src/renderer/annex-b-packetizer.ts`, `packages/device-bridge/src/renderer/h264-utils.ts`, and `packages/device-bridge/src/renderer/h264-decoder.ts`. An Annex B stream is a form of H.264 byte stream where NAL units are separated by start codes. The packetizer groups raw NAL units into access units, which are the chunks passed to WebCodecs as `EncodedVideoChunk`s. A keyframe, also called an IDR frame in H.264, is a frame the decoder can use as a clean restart point. Delta frames depend on previous frames, so dropping arbitrary delta frames can produce corruption until the next keyframe.

scrcpy differs from this design. scrcpy pushes a device-side server to Android, starts it through ADB once, creates persistent sockets through `adb reverse` or `adb forward`, streams encoded video with metadata, and sends control messages over a separate control socket. Input does not spawn a new `adb shell input` process for every gesture. Video and control have independent lifecycles, and the stream has more explicit framing and reset behavior than raw `screenrecord` output.

## Plan of Work

Start by adding measurement, because the goal is performance and stability rather than cosmetic cleanup. In `packages/device-bridge/src/android/devices.ts`, record how long `adb devices` takes and whether it times out. In `packages/device-bridge/src/android/live.ts`, count stdout chunks, bytes per second, and stream close reasons. In `packages/device-bridge/src/android/input.ts`, record latency for tap, swipe, text, home, and back. In `packages/device-bridge/src/renderer/h264-decoder.ts`, record decoder queue size, dropped units, decode errors, and whether the dropped unit was a keyframe. The initial implementation can log to existing status callbacks or console in development mode. Do not add a broad analytics system.

Next, make device discovery safe without making it slower. In `DevicesPanel.tsx`, add an in-flight guard so a new refresh does not start while a previous refresh is unresolved. Cache the last `DeviceListResult` and only call `setDevices` when Android devices, iOS devices, or error strings actually changed. This prevents redundant React renders. Then change the main-process listing behavior in `packages/device-bridge/src/register.ts` so Android and iOS listing can complete independently. A slow iOS discovery should not block an Android list update. If the existing IPC shape must remain stable, return the last known iOS result while Android refreshes and schedule iOS discovery separately. Do not use a hidden compatibility flag.

Then fix the Android gesture semantics. In `packages/device-bridge/src/renderer/device-stream.ts`, do not send tap immediately on mouse down. Store the pointer-down position and time. On pointer up, if movement is below the tap threshold, send one tap. If movement exceeds the drag threshold, send one swipe with the measured duration. This makes one user swipe produce one Android command instead of a tap plus a swipe. Prefer pointer events over mouse-only events if this can be done locally without widening scope; pointer events support mouse, trackpad, and stylus-like inputs in the browser environment. Keep coordinate mapping tied to the canvas intrinsic dimensions.

After that, harden the current video stream. In `packages/device-bridge/src/renderer/device-stream.ts`, create the decoder and packetizer before chunks can be appended, or buffer early chunks until the packetizer exists. A valid implementation is to have the chunk listener append to a small bounded `Uint8Array[]` pending queue before `androidLiveStart` returns, then flush that queue after decoder initialization. Do not allow the pending queue to grow unbounded. In `packages/device-bridge/src/renderer/h264-decoder.ts`, use the configured `fps` instead of hardcoded 60 FPS for timestamps. When the decode queue is over the limit, enter a recovery mode: drop delta frames until the next IDR keyframe and include SPS/PPS configuration NALs when available. This prevents resuming decode in the middle of an invalid dependency chain. If WebCodecs reports a decode error, close and recreate the decoder on the next keyframe rather than continuing in a corrupted state.

Also harden Android stream lifecycle in `packages/device-bridge/src/android/live.ts`, `packages/device-bridge/src/register.ts`, and `packages/device-bridge/src/renderer/device-stream.ts`. If `adb exec-out screenrecord` exits for any reason other than an intentional stop, report the exit code, signal, and stderr through Android live status. The main process should keep an Android live session number so stale stream chunks cannot be delivered after a stop or restart. When the active stream ends unexpectedly, restart it after a short delay for the same device id. When the renderer receives the restart status, reset the H.264 decoder, packetizer, and pending chunk buffer so new bytes from the restarted stream are not decoded through stale state.

Reduce unnecessary copying in `packages/device-bridge/src/renderer/annex-b-packetizer.ts`. The current implementation allocates a new combined buffer on every append. Replace it with a small chunk queue or ring-buffer-like accumulator that only copies when emitting an access unit. Keep existing packetizer tests and add tests for chunk boundaries that split start codes across chunks, SPS/PPS followed by an IDR, and recovery after dropped delta frames. This milestone is important because H.264 streams at high bitrate create sustained allocation pressure.

Evaluate whether Android input should keep using `adb shell input` for the near term or move to a persistent shell. A persistent shell means starting one `adb shell` process and writing `input tap ...` or `input swipe ...` commands to its stdin. This still uses Android’s shell `input` tool, so it is not as good as scrcpy’s control socket, but it avoids a new host-side ADB process per input. Implement this only if measurement shows input subprocess startup is a major contributor. If implemented, put it behind the existing Android input module, not a UI feature flag, so callers still use the same IPC channels.

Create a scrcpy-backed spike as a separate milestone. The spike should not replace production behavior immediately. It should answer whether Superset Desktop can either consume scrcpy’s video stream without showing scrcpy’s own SDL window, or launch scrcpy as a helper for Android mirroring and control in a way that fits the Devices panel. The spike must measure latency, CPU, memory, packaging friction on macOS, and behavior while Detox is running. If the spike is clearly better and packaging is acceptable, record a decision to adopt scrcpy as the Android backend. If embedding scrcpy is awkward, record a decision to implement a small Superset-owned server following scrcpy’s architecture rather than continuing to stretch raw `screenrecord` indefinitely.

Finally, update UI behavior in the Devices panel only where it exposes real state. If discovery is paused because an in-flight refresh is running, do not show a frozen spinner forever. If the video decoder enters recovery mode, show a short status like “Recovering video stream…” and clear it when the next keyframe renders. Avoid adding noisy logs or large status panels.

## Milestones

### Milestone 1: Measure the current failure mode

This milestone adds lightweight timing and queue instrumentation without changing behavior. At completion, a developer can run Superset Desktop, start Android preview, run Detox, and see whether freezes correlate with slow `adb devices`, repeated input commands, decoder queue growth, or stream decode errors.

Scope includes timing `adb devices` in `packages/device-bridge/src/android/devices.ts`, timing input commands in `packages/device-bridge/src/android/input.ts`, tracking Android stream chunk and byte rates in `packages/device-bridge/src/android/live.ts`, and tracking decoder drops and errors in `packages/device-bridge/src/renderer/h264-decoder.ts`.

Acceptance is that the app still starts, Android preview still connects, and logs/status clearly show ADB list latency, input latency, stream chunk rate, and decoder drop count during a manual session.

### Milestone 2: Make discovery non-piling and non-blocking

This milestone makes device discovery safe under ADB stalls without increasing the interval. At completion, a refresh cannot overlap another refresh, unchanged results do not re-render the panel, and slow iOS discovery does not block Android device updates.

Scope includes `DevicesPanel.tsx`, possibly `GroupedDevicePicker.tsx` for memoized derived lists, and `packages/device-bridge/src/register.ts` if per-platform list results are split or cached.

Acceptance is that running Detox while the Devices panel is open does not create multiple concurrent `adb devices` processes from Superset Desktop. A developer can verify this by observing instrumentation logs and, if needed, checking process lists during Detox.

### Milestone 3: Make gestures one command per gesture

This milestone fixes the current tap-then-swipe behavior. At completion, a click sends exactly one tap, and a drag sends exactly one swipe. A swipe no longer sends an extra tap on mouse down.

Scope is primarily `packages/device-bridge/src/renderer/device-stream.ts`, with tests added if the gesture logic is extracted into a small pure helper. Do not refactor unrelated canvas code.

Acceptance is that manual clicks still tap Android UI elements, manual drags still scroll Android UI, and instrumentation shows one Android input command per user gesture.

### Milestone 4: Harden the raw H.264 path

This milestone makes the existing `screenrecord` backend recover instead of staying corrupted or frozen. At completion, early chunks are not silently lost during stream startup, timestamps use configured FPS, decode backpressure waits for keyframes before resuming, packetizer allocation pressure is reduced, and an unexpected Android `screenrecord` exit restarts the active live session instead of leaving the canvas stuck on the last frame.

Scope includes `packages/device-bridge/src/android/live.ts`, `packages/device-bridge/src/register.ts`, `packages/device-bridge/src/renderer/device-stream.ts`, `packages/device-bridge/src/renderer/annex-b-packetizer.ts`, `packages/device-bridge/src/renderer/h264-decoder.ts`, and associated tests in `packages/device-bridge/src/renderer/*.test.ts`.

Acceptance is that repeated swipes in the Devices panel no longer permanently corrupt the image. If frames are dropped under load, the panel should recover at the next keyframe or restart the decoder cleanly. If Detox or Android itself causes `screenrecord` to exit, the Desktop logs should report the Android live stream close reason, then the preview should reconnect for the same active device without requiring the user to manually stop and start live preview.

### Milestone 5: Scrcpy-backed spike and backend decision

This milestone compares the stabilized current backend against a scrcpy-backed backend. At completion, the Decision Log has evidence for adopting scrcpy, implementing a Superset-owned scrcpy-like server, or keeping the stabilized `screenrecord` backend temporarily.

Scope should be isolated. Do not rewrite production streaming before the spike proves the approach. A prototype can live under `packages/device-bridge/src/android/scrcpy-spike/` or another clearly temporary location if necessary, but production code should only call it through a deliberate interface after the decision is made.

Acceptance is a short recorded transcript in this plan showing how the spike was launched, what latency and CPU looked like, whether it worked while Detox ran, and whether it can fit inside the existing Devices panel UX.

## Concrete Steps

Run commands from the repository root unless stated otherwise.

First, inspect and run the existing package tests before changing code:

    bun test packages/device-bridge
    # Expected: parser and H.264 utility tests pass.

    bun run typecheck
    # Expected: TypeScript completes without errors, or unrelated pre-existing errors are documented before implementation continues.

During implementation, use targeted tests after each renderer or Android bridge change:

    bun test packages/device-bridge/src/renderer
    # Expected: packetizer and H.264 utility tests pass, including any new recovery tests.

    bun test packages/device-bridge/src/android
    # Expected: Android device parser tests pass, plus any new input helper tests if gesture logic is extracted.

Run desktop-specific validation after the code changes:

    cd apps/desktop
    bun run lint:check-node-imports
    # Expected: no renderer file imports Node.js modules.

Return to the repository root and run full validation:

    bun run lint
    # Expected: Biome reports no lint errors.

    bun run typecheck
    # Expected: no type errors.

    bun test
    # Expected: all tests pass.

For manual validation, start Superset Desktop with the Apple Silicon startup flow used for this project rather than a generic desktop command. If the exact command is not known in the current shell history, read `/Users/biangwua/.claude/projects/-Users-biangwua-Documents-biang-----superset/memory/desktop-dev-startup.md` before running the app. Open the Devices panel, select an Android device, verify live preview appears, click and swipe several times, then run the Detox test in the external project from its app directory. The expected observation is that the Devices panel remains responsive, Android preview either stays clean or briefly recovers with a status message, and logs do not show overlapping discovery calls or repeated tap-plus-swipe pairs for one gesture.

## Validation and Acceptance

The most important acceptance test is user-visible. With Superset Desktop open to the Devices panel and an Android device selected, start a Detox Android test that uses the same device. While Detox runs, Superset Desktop should still allow switching sidebar tabs, the Devices panel should not visually freeze, and the Android preview should not become permanently corrupted after repeated swipes.

A second acceptance test is process behavior. Superset Desktop must not start overlapping `adb devices` calls. Input should be reduced so one human swipe produces one Android input action, not an extra tap plus a swipe. Instrumentation should show this clearly.

A third acceptance test is video recovery. If the decoder falls behind, the system should prefer dropping until a clean keyframe over displaying corrupted frames. If a WebCodecs decoder error occurs, the stream should recover by resetting the decoder at a safe point or restarting the Android stream, not by remaining in a broken visual state. If `screenrecord` exits unexpectedly, Android live status should include the close reason and the active session should restart without accepting stale chunks from a previous session.

All code validation should pass:

    bun run lint
    bun run typecheck
    bun test

For desktop-specific renderer safety, this should also pass from `apps/desktop`:

    bun run lint:check-node-imports

If a validation failure is unrelated and pre-existing, record the exact command, exact failure, and why it is unrelated in `Outcomes & Retrospective` before proceeding.

## Idempotence and Recovery

All changes should be safe to retry. Instrumentation must not create persistent files or require cleanup. If a stream subprocess gets stuck during manual testing, stop live preview from the UI or close the Desktop window; `registerDeviceBridge` already disposes tracked processes when the window is destroyed.

Avoid destructive actions. Do not kill all ADB processes as a routine recovery step because Detox and other developer tools may be using ADB. If ADB is truly wedged during manual testing, ask the user before running a command like `adb kill-server`.

If the scrcpy spike installs or downloads anything, ask before doing it and record the exact artifact and location. Do not add a binary dependency to the repository until the backend decision is recorded and packaging implications are understood.

If the H.264 hardening introduces worse behavior, it should be easy to revert because the work is localized to `packages/device-bridge/src/renderer/` and `packages/device-bridge/src/android/`. Keep each milestone in a small commit-sized patch during implementation, though this plan does not require creating git commits.

## Artifacts and Notes

Current Android stream command in `packages/device-bridge/src/android/live.ts`:

    adb [-s DEVICE_ID] exec-out screenrecord --output-format=h264 --bit-rate 30000000 --size WIDTHxHEIGHT -

Current Android input commands in `packages/device-bridge/src/android/input.ts`:

    adb [-s DEVICE_ID] shell input tap X Y
    adb [-s DEVICE_ID] shell input swipe X1 Y1 X2 Y2 DURATION
    adb [-s DEVICE_ID] shell input text TEXT
    adb [-s DEVICE_ID] shell input keyevent 3
    adb [-s DEVICE_ID] shell input keyevent 4

Current discovery command in `packages/device-bridge/src/android/devices.ts`:

    adb devices

Known issue in current gesture flow from `packages/device-bridge/src/renderer/device-stream.ts`:

    onMouseDown sends tap immediately.
    onMouseUp sends swipe if movement is large enough.
    Therefore one drag sends two Android commands.

Relevant scrcpy references for the spike and design comparison:

    https://github.com/Genymobile/scrcpy/blob/master/doc/develop.md
    https://github.com/Genymobile/scrcpy/blob/master/README.md

## Interfaces and Dependencies

Use existing modules first. The current IPC channel constants live in `packages/device-bridge/src/ipc-channels.ts`, and the preload bridge lives in `packages/device-bridge/src/preload/index.ts`. Do not add new Electron IPC channels unless the existing channels cannot express the required behavior. If new channels are needed, define them in the device bridge package and update the preload and renderer IPC client together.

Keep Android command execution inside `packages/device-bridge/src/android/`. Renderer files in `packages/device-bridge/src/renderer/` and `apps/desktop/src/renderer/` must not import Node.js APIs. The main process can spawn `adb`; the renderer can only send IPC requests and use browser APIs such as Canvas and WebCodecs.

Add or keep these internal interfaces by the end of the stabilization work:

    type AndroidInputGesture =
      | { type: "tap"; x: number; y: number }
      | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; duration: number };

This type can live near gesture handling if gesture logic is extracted for tests. It should not be exposed as public API unless needed.

The H.264 decoder should expose enough status for recovery and validation without leaking WebCodecs details into React UI. A small status callback is acceptable:

    type DecoderStatus =
      | { type: "queue-drop"; waitingForKeyframe: boolean }
      | { type: "decode-error"; message: string }
      | { type: "recovered" };

Use this only if it simplifies implementation. Do not build a broad event bus.

For the scrcpy spike, do not commit to a dependency until the Decision Log is updated. The spike may use the developer’s installed `scrcpy` binary for exploration, but production adoption must decide how the binary is discovered, bundled, notarized on macOS, and versioned.

## Revision Notes

2026-04-28: Initial plan created. The plan records that the current implementation uses raw `adb exec-out screenrecord` plus WebCodecs rather than scrcpy, identifies ADB command pressure and H.264 recovery gaps as root causes, and proposes staged stabilization plus a scrcpy-backed spike instead of increasing the polling interval.

2026-04-28: Updated after implementation and independent audit. The plan now records completed stabilization work, the audit finding around stale SPS/PPS recovery data, the packetizer allocation-pressure fix, per-platform discovery caching, and targeted validation results. Manual Detox validation and the scrcpy-backed spike remain open.

2026-04-28: Updated after Android freeze follow-up. The plan now records the additional `screenrecord` close-status reporting, active Android live-session restart, and renderer decoder/packetizer reset needed when Detox leaves the preview stuck on the last frame. The next manual validation must restart the Electron main process first because these changes touch main-process package code.
