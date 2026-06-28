# Desktop Automation

`@superset/desktop-mcp` exposes a repo-local CLI and an MCP compatibility server for controlling the real Electron desktop app through Chromium DevTools Protocol.

Start the desktop app with the normal desktop dev script:

```bash
bun run --cwd apps/desktop dev
```

The dev script sets `DESKTOP_AUTOMATION_PORT=9322`. The Desktop Automation CLI also defaults to port `9322` when the env var is not set, and connects lazily on the first command:

```bash
bun run desktop:automation -- help
bun run desktop:automation -- window-info
bun run desktop:automation -- inspect-dom --interactive-only
bun run desktop:automation -- smoke \
  --url-includes "#/sign-in" \
  --screenshot .trellis/tasks/<task>/artifacts/sign-in.png \
  --report .trellis/tasks/<task>/artifacts/sign-in-smoke.json
```

CLI commands:

- `screenshot`: capture the app window, optionally saving a `.png` under the workspace for Trellis artifacts.
- `inspect-dom`: list visible DOM elements, selectors, bounds, roles, and `data-testid` values.
- `wait-for`: wait for URL, text, selector, or `data-testid` state before interacting.
- `click`, `type-text`, `send-keys`: interact with renderer UI.
- `navigate`, `window-info`, `console-logs`, `evaluate-js`: inspect and debug the running app.
- `smoke`: run a Trellis-friendly gate that combines window info, readiness wait, DOM inspection, screenshot capture, console log capture, and optional JSON report output.
- `visual-stability`: sample a real interaction for persistent-shell removals, blank frames, layout jumps, DOM churn, and renderer console errors.

Trellis desktop quality gates should use the CLI by default:

```bash
bun run desktop:automation -- smoke \
  --url-includes "#/sign-in" \
  --screenshot .trellis/tasks/<task>/artifacts/desktop-smoke.png \
  --report .trellis/tasks/<task>/artifacts/desktop-smoke.json
```

For desktop UX changes that might flicker, blank, remount, or jump during an interaction, use `visual-stability`:

```bash
bun run desktop:automation -- visual-stability \
  --click-text "Workspaces" \
  --wait-url-includes "#/v2-workspaces" \
  --persist-selector "app > div:nth-of-type(1)" \
  --measure-selector "app > div:nth-of-type(1) > div:nth-of-type(1)" \
  --sample-ms 800 \
  --sample-interval-ms 50 \
  --max-removals 0 \
  --max-layout-shift-px 2 \
  --max-blank-frames 0 \
  --report .trellis/tasks/<task>/artifacts/workspaces-visual-stability.json \
  --before-screenshot .trellis/tasks/<task>/artifacts/workspace-before.png \
  --after-screenshot .trellis/tasks/<task>/artifacts/workspaces-after.png
```

Useful `visual-stability` options:

- Action: `--click-selector`, `--click-text`, `--click-test-id`, `--click-x`, `--click-y`, `--navigate-path`, `--navigate-url`, or `--action-js`.
- Readiness: `--wait-url-includes`, `--wait-selector`, `--wait-text`, `--wait-test-id`, and `--timeout-ms`.
- Observation: repeat `--persist-selector`, `--measure-selector`, and `--churn-root-selector`; use `--blank-rect x,y,width,height` for a focused blank-frame region.
- Thresholds: `--max-removals`, `--max-layout-shift-px`, `--max-size-shift-px`, `--max-blank-frames`, `--blank-threshold`, `--max-dom-added`, `--max-dom-removed`, and `--fail-on-console-error=false`.
- Artifacts: `--report <file.json>`, `--before-screenshot <file.png>`, `--after-screenshot <file.png>`, and `--failed-frame-dir <dir>`.

`visual-stability` exits with code `1` when the report fails. The JSON report includes the failing selector, timestamp/frame index, before/after bounds, DOM churn counts, console messages, and artifact paths.

For Trellis desktop quality gates, prefer deterministic checks through `inspect-dom`, `wait-for`, route/hash state, console logs, JSON reports, and saved screenshots. Use Codex Desktop Computer Use only as a fallback for OS-level surfaces CDP cannot control, such as native dialogs, app menus, fullscreen transitions, or focus issues.

This package is development tooling only. Do not import `@superset/desktop-mcp` or `packages/desktop-mcp` from `apps/desktop` main, preload, or renderer runtime code, and do not expose `visual-stability` as a Canary/Release product feature.

The MCP server is still available for hosts that expose local MCP tools directly:

```bash
bun run mcp:desktop
```

Trellis gates are workflow steps and commands, not MCP-specific plug-in slots. Use the CLI in workflow steps and slash commands so validation does not depend on whether the current host exposes MCP tools to the model.
