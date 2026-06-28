# Design: Desktop visual stability gate

## Architecture

Add the feature inside `packages/desktop-mcp` as a first-class Desktop Automation CLI command and automation method.

Proposed files:

- `packages/desktop-mcp/src/automation/visual-stability.ts`
  - pure report types and metric helpers,
  - threshold defaults,
  - blank-frame classifier,
  - layout delta classifier,
  - DOM churn summary helpers.
- `packages/desktop-mcp/src/automation/desktop-automation.ts`
  - `runVisualStabilityCheck(options)` method that connects to CDP, injects renderer observers, performs an action, samples during the observation window, captures artifacts, and returns a typed report.
- `packages/desktop-mcp/src/cli/desktop-automation-cli.ts`
  - `visual-stability` command parsing and output formatting.
- `packages/desktop-mcp/README.md`
  - usage examples.
- `.trellis/spec/guides/desktop-acceptance-tdd.md`
  - quality gate trigger rules and report expectations.

Do not introduce Playwright or WebDriver. Puppeteer CDP is already available through the package's existing `ConnectionManager`.

## Development-Only Packaging Boundary

This gate is a developer/agent QA tool. It must stay in the repository tooling layer and out of product runtime packages.

Allowed:

- source under `packages/desktop-mcp`,
- CLI execution through `bun run desktop:automation -- visual-stability`,
- Trellis spec/docs updates,
- tests and local validation artifacts.

Forbidden:

- importing `packages/desktop-mcp` from `apps/desktop/src/main`, `apps/desktop/src/preload`, or `apps/desktop/src/renderer`,
- exposing a user-facing menu, button, route, setting, or API for visual stability checks,
- changing Canary/Release CDP behavior,
- adding the tool to Electron packaged resources,
- adding `packages/desktop-mcp` as a desktop app runtime dependency,
- adding runtime dependencies that desktop builder would bundle into `Superset Canary.app` or Release artifacts.

Validation should include a source-level packaging guard so future changes cannot accidentally import this QA package into app runtime.

## Command Shape

Initial CLI shape:

```bash
bun run desktop:automation -- visual-stability \
  --click-text "Workspaces" \
  --wait-url-includes "#/v2-workspaces" \
  --persist-selector "[data-dashboard-shell]" \
  --measure-selector "[data-sidebar]" \
  --sample-ms 800 \
  --sample-interval-ms 50 \
  --max-removals 0 \
  --max-layout-shift-px 2 \
  --max-blank-frames 0 \
  --report .trellis/tasks/<task>/artifacts/visual-stability.json \
  --before-screenshot .trellis/tasks/<task>/artifacts/before.png \
  --after-screenshot .trellis/tasks/<task>/artifacts/after.png
```

Action flags:

- `--click-selector`
- `--click-text`
- `--click-test-id`
- `--click-x`, `--click-y`
- `--navigate-path`
- `--navigate-url`
- `--action-js`

Readiness flags:

- `--wait-url-includes`
- `--wait-selector`
- `--wait-text`
- `--wait-test-id`
- `--timeout-ms`

Observation flags:

- `--persist-selector` repeatable
- `--measure-selector` repeatable
- `--churn-root-selector` repeatable, defaults to `body`
- `--blank-rect x,y,width,height`
- `--sample-ms`, default `800`
- `--sample-interval-ms`, default `50`

Threshold flags:

- `--max-removals`, default `0`
- `--max-layout-shift-px`, default `2`
- `--max-size-shift-px`, default `2`
- `--max-blank-frames`, default `0`
- `--blank-threshold`, default `0.985`
- `--max-dom-added`, optional
- `--max-dom-removed`, optional
- `--fail-on-console-error`, default `true`

Artifact flags:

- `--report <file.json>`
- `--before-screenshot <file.png>`
- `--after-screenshot <file.png>`
- `--failed-frame-dir <dir>`

## Runtime Flow

1. Connect to the running desktop app through existing CDP connection.
2. Clear console capture if requested, or record a baseline timestamp.
3. Capture `windowInfo`, current URL, and optional before screenshot.
4. Inject a renderer observer script:
   - marks persistent selectors with internal probe ids,
   - attaches `MutationObserver` to churn roots,
   - tracks removal of marked persistent nodes or ancestors,
   - samples measured selector bounding boxes,
   - samples blankness through screenshot frames from CDP side.
5. Execute exactly one action through existing automation primitives.
6. Wait for optional readiness condition.
7. Continue sampling until `sample-ms` elapses.
8. Capture optional after screenshot.
9. Collect console logs emitted after start.
10. Build report and classify pass/fail.
11. Exit code `0` for pass, `1` for fail, with JSON/text explaining why.

## Metrics

### Persistent Selector Stability

For each `persist-selector`:

- initial match count,
- selector names for nodes found,
- removal count,
- remount count if a matching selector disappears then appears again,
- first removal timestamp,
- DOM text/class/id summary for removed nodes.

Failure:

- initial match count is `0`, unless `--allow-missing-persist-selector` is explicitly provided,
- removal count exceeds `max-removals`.

### Layout Stability

For each `measure-selector`:

- initial bounds,
- max absolute x/y movement,
- max width/height change,
- per-sample worst delta.

Failure:

- movement exceeds `max-layout-shift-px`,
- size change exceeds `max-size-shift-px`,
- measured selector disappears unexpectedly.

This is intentionally simpler than browser CLS. We need actionable product UI deltas, not a web-vitals score.

### Blank Frame Detection

For full viewport or `blank-rect`:

- sample screenshots at `sample-interval-ms`,
- classify frame as blank when the dominant background-like pixels exceed `blank-threshold` and meaningful color/edge variance is below a conservative floor,
- count blank frames and record frame index/timestamp.

Failure:

- blank frame count exceeds `max-blank-frames`.

Implementation should keep frame sampling low-frequency by default to avoid high CPU/memory overhead.

### DOM Churn

For each `churn-root-selector`:

- added element count,
- removed element count,
- largest removed subtree text summary,
- whether a persistent selector was inside removed subtree.

Failure:

- explicit `max-dom-added` / `max-dom-removed` thresholds are exceeded.

DOM churn defaults should be report-only because legitimate route body changes can add/remove many nodes.

### Console Errors

Collect renderer logs after check start.

Failure:

- any `error` level log appears when `fail-on-console-error=true`.

## Report Contract

Report JSON shape:

```ts
interface VisualStabilityReport {
  command: "visual-stability";
  passed: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  windowInfo: WindowInfo;
  beforeUrl: string;
  afterUrl: string;
  thresholds: VisualStabilityThresholds;
  action: VisualStabilityActionSummary;
  wait?: WaitForResult;
  persistent: PersistentSelectorResult[];
  layout: LayoutSelectorResult[];
  blankFrames: BlankFrameResult;
  domChurn: DomChurnResult[];
  consoleLogs: ConsoleLogEntry[];
  failures: VisualStabilityFailure[];
  artifacts: {
    reportPath?: string;
    beforeScreenshot?: string;
    afterScreenshot?: string;
    failedFrames?: string[];
  };
}
```

Text output should be short:

- `Visual stability passed: <route> -> <route>`
- or `Visual stability failed: 2 failures`
  - `[persistent-removal] [data-dashboard-shell] removed at 142ms`
  - `[blank-frame] frame 3 blankness=0.991 at 150ms`

## Trellis Integration

Update `.trellis/spec/guides/desktop-acceptance-tdd.md`:

- Add a "Visual Stability Gate" section after the existing smoke guidance.
- State that desktop UX changes must use `visual-stability` when they affect:
  - route transitions,
  - shell/layout/provider structure,
  - loading/empty/data readiness states,
  - sidebars/lists/tables/modals/panes/tabs,
  - controls where disappearing/jumping feedback would hurt UX.
- Keep screenshots as evidence, not pass/fail by themselves.
- Require PRD validation notes to include:
  - command,
  - selectors watched,
  - report path,
  - pass/fail summary,
  - any accepted threshold overrides.

## Compatibility and Risk

- This is a developer/agent quality tool, not product runtime.
- Runtime observer code is injected only during CLI execution.
- No production CDP exposure changes.
- No database or online service changes.
- Canary/Release package contents must not change because of this tool; it lives outside the app artifact path.
- Screenshot frame sampling can be expensive; default duration/interval must stay conservative.
- Pixel blankness is heuristic. Use it as a strong signal, not as pixel-perfect visual diff.

## Rollback

The implementation is isolated to `packages/desktop-mcp` and Trellis specs. Rollback removes the CLI command, helper files, README/spec updates, and tests without touching product code.
