# Implementation Plan

## Phase 1: Core Metrics and Report Model

- Add typed visual stability report models under `packages/desktop-mcp/src/automation/visual-stability.ts`.
- Implement pure helpers:
  - threshold normalization,
  - layout delta computation,
  - persistent selector result classification,
  - DOM churn result classification,
  - blank frame pixel classifier.
- Unit tests:
  - blank frame detection: blank, nonblank, mixed frames,
  - layout delta pass/fail,
  - persistent removal pass/fail,
  - report failure summary formatting.

## Phase 2: DesktopAutomation Runtime

- Add `runVisualStabilityCheck(options)` to `DesktopAutomation`.
- Reuse existing primitives where possible:
  - `click`,
  - `navigate`,
  - `waitFor`,
  - `takeScreenshot`,
  - `getConsoleLogs`.
- Inject a small renderer observer script through `page.evaluate`:
  - resolve persistent selectors,
  - resolve measured selectors,
  - attach mutation observers,
  - collect bounding box samples.
- Use CDP screenshots for optional before/after and low-frequency blank-frame samples.
- Ensure observer cleanup in `finally`.
- Ensure report still returns useful data on failure.

## Phase 3: CLI Command

- Extend CLI help with `visual-stability`.
- Parse action flags:
  - `--click-selector`, `--click-text`, `--click-test-id`, `--click-x`, `--click-y`,
  - `--navigate-path`, `--navigate-url`,
  - `--action-js`.
- Parse repeated selector flags using existing `getStringListFlag`.
- Parse threshold, timing, wait, and artifact flags.
- Write report through existing workspace-contained JSON path helper.
- Save screenshots through existing screenshot path safety.
- Return exit code `1` when report `passed=false`.
- Unit tests for CLI parsing and failure formatting.

## Phase 4: Documentation and Trellis Gate

- Update `packages/desktop-mcp/README.md` with examples.
- Update `.trellis/spec/guides/desktop-acceptance-tdd.md`:
  - when to run visual stability,
  - required validation notes,
  - examples for route and module interactions.
- Add this task's validation notes after real desktop acceptance.
- Document that `visual-stability` is development-only and must not ship in Canary/Release artifacts.

## Phase 4.5: Packaging Boundary Guard

- Add or update a source-level guard test that proves `apps/desktop` runtime code does not import `packages/desktop-mcp` or `@superset/desktop-mcp`.
- Inspect existing desktop runtime dependency/package validation and extend it if appropriate so packaged app runtime inputs do not include `packages/desktop-mcp`.
- Do not change Electron builder include patterns, resource-pack inclusion, or production CDP/debug behavior.
- Do not add `packages/desktop-mcp` to `apps/desktop/package.json` runtime dependencies.

## Phase 5: Real Acceptance

Use existing worktree dev lifecycle:

```bash
bun run dev:worktree:start
bun run dev:worktree:status
```

Then run real app checks with the detected `DESKTOP_AUTOMATION_PORT`:

```bash
DESKTOP_AUTOMATION_PORT=<port> bun run desktop:automation -- visual-stability \
  --click-text "Workspaces" \
  --wait-url-includes "#/v2-workspaces" \
  --persist-selector "app > div:nth-of-type(1)" \
  --measure-selector "app > div:nth-of-type(1) > div:nth-of-type(1)" \
  --sample-ms 800 \
  --report .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-to-workspaces.json \
  --before-screenshot .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspace-before.png \
  --after-screenshot .trellis/tasks/06-28-desktop-visual-stability-gate/artifacts/workspaces-after.png
```

Repeat for:

- Workspace detail -> Automations
- Workspace detail -> Tasks & PRs

For the current product, expected result is pass with:

- no persistent shell removal,
- no blank frames,
- no sidebar layout delta beyond threshold,
- no renderer console errors.

## Required Checks

```bash
bun test packages/desktop-mcp
bun run --cwd packages/desktop-mcp typecheck
bun test apps/desktop/runtime-dependencies.test.ts
bun run lint
python3 ./.trellis/scripts/task.py validate .trellis/tasks/06-28-desktop-visual-stability-gate
```

If desktop source/spec files are changed beyond `packages/desktop-mcp`, run the relevant package typecheck or focused tests for those changes too.

## Risk and Rollback Points

- Blank-frame heuristics can false positive on intentional empty states. Keep thresholds configurable and default to conservative detection.
- Selectors can be brittle if agents use deep CSS paths. Prefer data-testid or stable product selectors when available; deep selectors are acceptable only as local smoke artifacts.
- Screenshot frame sampling can increase CPU. Keep defaults low and allow disabling blank-frame sampling if the task only needs DOM/layout stability.
- If runtime action fails, report should state the action failure clearly instead of pretending visual stability passed.
- The debug tool must not leak into packaged builds. Treat any runtime import from `apps/desktop` to `packages/desktop-mcp` as a blocker.

## Planning Approval Needed

Before implementation starts, confirm the trigger and packaging policy:

- recommended: require this gate for desktop user-visible UI behavior changes;
- do not require for backend-only, packaging-only, or non-visual maintenance tasks.
- required: keep this as development/debug tooling only; do not ship it in Canary/Release runtime or increase app bundle contents.
