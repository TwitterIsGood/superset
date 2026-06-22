# PR16 Control Chat Review Fixes

## Goal

Fix main-branch review blockers for PR #16: migration, stop cancellation, new chat, CI test, and failed-tool run status.

## Requirements

- Accept P0 migration blocker: add generated Drizzle migration artifacts for
  the Control Chat, Automation config version, and Capability version schema
  changes already present in source. Do not hand-edit generated migration files.
- Accept P1 Stop blocker: Control Chat stop must prevent further model/tool
  progress from mutating Automations or Capabilities after the user aborts the
  run.
- Accept P1 New chat blocker: clicking the new chat button must let the next
  message create a new Control Chat session even when prior sessions exist.
- Accept P1 CI Test blocker: Control Chat store tests must pass in CI without
  browser `localStorage`.
- Accept P2 failed-tool status blocker: failed tools must not produce a
  misleading `completed` run status. Runs with tool failures should surface a
  failed status and actionable error while preserving assistant/tool output for
  the UI.
- Keep existing successful E2E behavior: floating panel, Bypass default,
  persisted sessions, Automation/Capability tool matrix, Settings reflection,
  and active-run conflict behavior.
- Update PR #16 branch in place.

## Acceptance Criteria

- [ ] `packages/db/drizzle/` contains generated migration artifacts for the new
      DB schema.
- [ ] Stop/abort is enforced by runtime cancellation checks before model
      planning, before each tool, after each tool, and before assistant message
      persistence.
- [ ] New chat stays in a no-session compose state until the user sends a
      message or explicitly selects an existing session.
- [ ] Store tests pass without `localStorage` and do not rely on warning-only
      behavior.
- [ ] A Control Chat run with any failed tool is marked `failed`, not
      `completed`.
- [ ] Focused tests cover Stop behavior, new chat behavior, failed-tool status,
      intent/package builder/store behavior, and the tool matrix.
- [ ] Required quality gates pass: `bun run lint:fix`, `bun run lint`,
      `bun run typecheck`, relevant focused tests, and Trellis Verify/check.

## Notes

- Review conclusion acceptance: all five review points are accepted for this
  task unless implementation uncovers a factual mismatch. Any non-acceptance
  must be explained in the final response.
