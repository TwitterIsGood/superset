# Desktop visual stability gate

## Goal

Build a reusable Desktop Automation quality gate that catches transient visual instability during desktop interactions, then integrate it into Trellis desktop acceptance guidance so future desktop UX work does not rely only on final screenshots or manual observation.

The gate should detect the class of regressions behind the recent Workspace Worktree navigation flicker: persistent shells, modules, controls, or critical UI regions briefly unmounting, blanking, jumping, or producing large DOM churn during an interaction.

## User Value

- Agents get an objective pass/fail signal for flicker and visual instability instead of guessing from screenshots.
- Reviewers get a JSON report that points to the failing selector, frame, route, layout delta, or console error.
- Desktop UX tasks have a standard Trellis validation command that can fail the task before handoff.
- The same gate can be applied to page-level transitions, module-level updates, dialogs, lists, and button/control interactions.

## Confirmed Facts

- Existing Desktop Automation CLI lives in `packages/desktop-mcp` and is invoked through `bun run desktop:automation -- <command>`.
- Existing commands include `window-info`, `inspect-dom`, `wait-for`, `screenshot`, `click`, `type-text`, `send-keys`, `console-logs`, `evaluate-js`, `navigate`, and `smoke`.
- Existing `smoke` captures final DOM, screenshot, console logs, and readiness, but it does not sample the interaction window.
- Trellis desktop acceptance already says screenshots are evidence, not primary gates, and prefers deterministic assertions through CLI commands.
- `packages/desktop-mcp` must stay CDP-only; routine desktop acceptance must not add Playwright/WebDriver/browser downloads.
- The recent flicker fix proved a useful primitive: attach a MutationObserver to a persistent shell, run navigation, and assert the shell marker is still mounted with `removedCount=0`.
- User requirement: this must remain a development/debug/quality-gate capability only. It must not be included in Canary or Release desktop runtime bundles, must not add renderer/main runtime code paths, and must not increase packaged app size except for repository source/test files that are not shipped.

## Requirements

- Add a new Desktop Automation CLI command for visual stability checks, tentatively `visual-stability`.
- The command must execute one user interaction through existing automation primitives:
  - click by selector/text/test-id/index or coordinate,
  - optionally navigate by path/url,
  - optionally evaluate a custom action script for advanced cases.
- The command must observe the page during a configurable sample window after the action.
- The command must support persistent selectors that must remain mounted during the interaction.
- The command must support measured selectors whose bounding boxes are sampled and compared over time.
- The command must detect and report:
  - persistent selector removal/remount,
  - blank or near-blank frames in the full viewport or supplied rect,
  - layout movement/resize beyond threshold,
  - excessive DOM add/remove churn inside watched roots,
  - renderer console errors during the measured interaction.
- The report must be machine-readable JSON and human-readable in CLI text output.
- Failures must be actionable: include selector, route, timestamp/frame index, before/after bounds, DOM churn counts, and console messages where relevant.
- The command must write optional artifacts under the task directory:
  - JSON report,
  - before/after screenshots,
  - optional sampled frame screenshots or debug thumbnails for failed frames.
- Integrate the gate into `.trellis/spec/guides/desktop-acceptance-tdd.md` with clear trigger rules:
  - desktop UX route transitions,
  - shells/layout/provider changes,
  - loading/empty/cache-first changes,
  - sidebar/list/table/modal/pane/tab interactions,
  - buttons or controls where visual feedback matters.
- Provide at least one real acceptance example based on Workspace detail -> Workspaces / Automations / Tasks & PRs transitions.
- Keep thresholds configurable, with conservative defaults that avoid obvious false positives.
- Keep the implementation outside product runtime:
  - no imports from `apps/desktop/src/main`, `apps/desktop/src/preload`, or `apps/desktop/src/renderer` into this new gate;
  - no changes that enable CDP or debug endpoints in packaged Canary/Release builds;
  - no production runtime dependencies added to `apps/desktop`;
  - no Electron builder/resource-pack inclusion of the visual stability tool.

## Acceptance Criteria

- [x] `bun run desktop:automation -- visual-stability --help` documents usage and options.
- [x] The command can assert a persistent dashboard shell remains mounted during a route transition.
- [x] The command fails with a clear report when a watched persistent selector is removed.
- [x] The command can sample measured selector bounds and fail when movement exceeds a configured threshold.
- [x] The command can detect a viewport/rect blank frame above a configured blankness ratio.
- [x] The command captures console errors produced during the interaction and includes them in the report.
- [x] The command writes a JSON report to a workspace-contained `.json` path.
- [x] The command can save before/after screenshots to workspace-contained `.png` paths.
- [x] Unit tests cover report classification, CLI arg parsing, path safety, blank-frame detection, and layout-delta logic.
- [x] `bun test packages/desktop-mcp` passes.
- [x] `bun run --cwd packages/desktop-mcp typecheck` passes.
- [x] Root `bun run lint` passes.
- [x] Real Desktop Automation acceptance runs the gate against Workspace detail -> Workspaces / Automations / Tasks & PRs and reports zero shell removals.
- [x] Trellis desktop acceptance spec documents when future desktop UX tasks must run this gate and how to record artifacts.
- [x] Packaged Canary/Release inputs are unchanged by this debug tool: no app runtime import path references `packages/desktop-mcp`, and desktop runtime dependency/package validation confirms the tool is not bundled into app artifacts.
- [x] The spec explicitly states `visual-stability` is a development-only Trellis quality gate, not a product feature or shipped debug capability.

## Validation Notes

Focused checks completed during implementation:

- `bun test packages/desktop-mcp`: 27 pass.
- `bun run --cwd packages/desktop-mcp typecheck`: pass.
- `bun run desktop:automation -- visual-stability --help`: pass, command-specific help printed without connecting to Electron.
- `bun test apps/desktop/runtime-dependencies.test.ts`: 65 pass, including the new guard that `apps/desktop` runtime source and package dependencies do not import `@superset/desktop-mcp`.
- `bun run lint`: pass.

Real desktop acceptance used `bun run dev:worktree:status` and worktree CDP port `3268` against the running desktop app at `http://localhost:3255`.

- Workspace detail -> Workspaces:
  - Command: `DESKTOP_AUTOMATION_PORT=3268 bun run desktop:automation -- visual-stability --click-text "Workspaces" --wait-url-includes "#/v2-workspaces" --persist-selector "app > div:nth-of-type(1)" --measure-selector "app > div:nth-of-type(1) > div:nth-of-type(1)" --churn-root-selector "app" --sample-ms 800 --sample-interval-ms 50 --max-removals 0 --max-layout-shift-px 2 --max-blank-frames 0 --report .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-workspaces.json --before-screenshot .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-before-workspaces.png --after-screenshot .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspaces-after.png`
  - Result: pass. Persistent removals `0`; blank frames `0/2`; console logs `0`.
- Workspace detail -> Automations:
  - Default command with `failOnConsoleError=true` wrote `.trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-automations.json` and failed on three renderer console errors from relay `git.getStatus` returning HTTP `503`.
  - Visual-only command with `--fail-on-console-error=false` wrote `.trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-automations-visual-only.json` and passed. Persistent removals `0`; blank frames `0/2`; console logs `3`.
- Workspace detail -> Tasks & PRs:
  - Default command with `failOnConsoleError=true` wrote `.trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-tasks.json` and failed on three renderer console errors from relay `git.getStatus` returning HTTP `503`.
  - Visual-only command with `--fail-on-console-error=false` wrote `.trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-tasks-visual-only.json` and passed. Persistent removals `0`; blank frames `0/2`; console logs `3`.

Interpretation: the visual stability metrics are passing for the target transitions. The default gate correctly fails when renderer console errors occur; in this online-lite profile those errors are unrelated relay background `git.getStatus` 503s for other workspaces.

## Out of Scope

- Mobile visual stability instrumentation.
- Pixel-perfect design comparison.
- Playwright/WebDriver adoption.
- CI runner integration for every PR by default.
- Native macOS dialogs or app-menu visual checks that CDP cannot observe.
- Product runtime telemetry sent to production services.
- Shipping `visual-stability` UI, API, renderer code, main-process code, or debug controls inside Canary/Release builds.

## Open Questions

- Should this gate be mandatory for every desktop-facing Trellis task immediately, or required only for tasks that change visible route/layout/module/control behavior?

Recommended answer: require it for desktop user-visible UI behavior changes now, not for backend-only or non-visual desktop maintenance. This makes the gate strict where it matters without slowing unrelated work.
