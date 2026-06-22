# Validation Notes

## Passed

- `bun install`
- `bun run lint:fix`
- `bun run lint`
- `bun run --cwd packages/db typecheck`
- `bun run --cwd packages/trpc typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run typecheck`
- `bun test packages/trpc/src/router/control-chat/intent.test.ts`
- `bun test packages/trpc/src/router/control-chat/package-builder.test.ts`
- `bun test apps/desktop/src/renderer/stores/control-chat.test.ts`
- `bun test packages/trpc/src/router/control-chat/intent.test.ts packages/trpc/src/router/control-chat/package-builder.test.ts apps/desktop/src/renderer/stores/control-chat.test.ts`
- `SKIP_ENV_VALIDATION=1 NODE_ENV=development SUPERSET_HOME_DIR="$PWD/superset-dev-data" bun .trellis/tasks/06-21-control-chat-tools-automations/validate-control-chat-tools.ts`

## Desktop Automation

- `bun run dev:worktree:start` succeeded after `main` was merged. Worktree
  services were isolated on the `3200` port family:
  - API: `http://localhost:3201`
  - Relay: `http://localhost:3213`
  - Electric proxy: `http://localhost:3212`
  - Desktop Vite: `http://localhost:3205`
  - Desktop Automation/CDP: `3218`
  - Neon proxy: `localhost:3215`
- `bun run dev:worktree:status` passed all probes:
  Neon proxy SQL, API session endpoint, relay health, Electric auth gate, and
  Desktop Automation connection.
- Authenticated local E2E account was used:
  `admin@local.test` / `supersetdev`.
- Desktop Automation verified the global Control Chat FAB on authenticated
  desktop pages. Opening the panel did not navigate away from the current page.
- Control Chat panel verification:
  - Header and composer rendered.
  - `Bypass` badge rendered.
  - Current route context was injected.
  - Active session restored after minimizing/reopening.
- Chat tool execution verification:
  - `list automations` executed `automation.list` and persisted a completed
    tool call.
  - `list capabilities` executed `capability.list` after fixing plural
    capability intent detection.
  - `create a Skill named "E2E Research Method" ...` executed
    `capability.generateSkillPackage` and imported a versioned Skill package.
- Database verification through local Neon proxy:
  - `control_chat_sessions`, `control_chat_messages`, `control_chat_runs`, and
    `control_chat_tool_calls` persisted the chat session, messages, run state,
    `permissionMode: "bypassPermissions"`, and completed tool calls.
  - Generated package `E2E Research Method` persisted in
    `capability_packages` and `capability_package_versions`.
  - Capability version metadata includes `control_chat_session_id`,
    `control_chat_run_id`, and the source instruction.
  - Local org has no enabled audit model, so the generated Skill version is
    stored with `audit_status = failed`; the package remains `disabled` with no
    active current version. This is the expected safety behavior.
- Conflict behavior verification:
  - A local fake active Control Chat run was inserted to simulate a concurrent
    device/run.
  - Sending another message returned 409 `CONFLICT` and the UI displayed:
    `This Control Chat session already has an active run.`
  - The fake run was cleaned up and marked `aborted`; session state returned to
    `idle` with `active_run_id = null`.
- Settings reflection verification:
  - `#/settings/tools-and-skills` showed `E2E Research Method` after the chat
    import.
  - The Settings page displayed disabled/security-failed status, version
    `1.0.20260622`, and the generated Skill overview.
- Post-reboot recovery verification:
  - Docker/OrbStack was restarted, then `bun run dev:worktree:start` restored
    the worktree service graph.
  - `bun run dev:worktree:status` passed all probes after the reboot.
  - DB rows persisted after reboot: one Control Chat session, messages, runs,
    tool calls, and the generated E2E Skill package.
  - Desktop Automation confirmed `#/settings/tools-and-skills` still displayed
    the generated Skill and Control Chat history.
- Screenshot artifact:
  - `artifacts/10-post-reboot-tools-and-skills.png`

## Automation and Capability Tool Matrix

- Added and ran task-local validation artifact
  `validate-control-chat-tools.ts`. It creates disposable validation
  Automation/Capability records, calls the typed Control Chat tool registry
  directly, and cleans up its records in `finally`.
- Capability tools verified:
  - `capability.list`
  - `capability.get`
  - `capability.importPackage`
  - `capability.setStatus`
  - `capability.delete`
  - `capability.versions.list`
  - `capability.versions.restore`
  - `capability.generateSkillPackage`
  - `capability.generateCliPackage`
- Capability negative/safety checks verified:
  - Restoring a validation-only version with `audit_status = passed` succeeds
    and activates the selected version.
  - Restoring an imported/generated package version with local
    `audit_status = failed` returns `BAD_REQUEST: Only versions that passed
    security audit can be activated.`
- Automation tools verified:
  - `automation.list`
  - `automation.get`
  - `automation.create`
  - `automation.update`
  - `automation.pause`
  - `automation.resume`
  - `automation.run`
  - `automation.logs`
  - `automation.versions.list`
  - `automation.versions.restore`
- Automation negative/safety checks verified:
  - Creating a host-bound automation with a missing `targetHostId` returns
    `NOT_FOUND: Host not found`.
  - Updating with a stale `expectedUpdatedAt` returns `CONFLICT: Automation
    changed since this chat turn started.`
  - Manual `automation.run` creates a durable run row. In the current local
    worktree, no eligible host is available, so the background dispatcher marks
    the run as skipped with `no host available`; `automation.logs` then returns
    that run.

## Notes

- Store tests pass but print zustand persist warnings because Bun's test
  environment has no browser storage. The assertions still pass.
- Earlier Desktop Automation screenshot attempts used a positional path
  argument. This CLI version requires `screenshot --path <file>`, so only the
  post-reboot screenshot was intentionally recorded as a file artifact.
- A startup-time renderer log showed `Maximum update depth exceeded` before the
  full E2E run. After restarting the desktop tmux session and after the later
  computer reboot/worktree restart, the new desktop log segment did not show the
  error again and `desktop:automation -- console-logs --json` returned `[]`.
- `list capabilities` initially fell through to the fallback assistant message
  because the heuristic checked `capability` but not `capabilities`. Added
  `intent.ts` and `intent.test.ts` to cover plural capability requests and
  `Tools & Skills` phrasing.
- The local Docker DB needed a local-only `bun run db:push` during validation
  because schema source includes new Control Chat tables but no generated
  Drizzle migration exists yet.
- Cloud Drizzle schema source changed. Per repository migration rules, no files
  under `packages/db/drizzle/` were edited manually. A Neon branch and
  Drizzle-generated migration are still required before shipping.
