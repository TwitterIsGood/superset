# PR16 Control Chat Review Fixes Implementation Plan

## Steps

1. Read relevant specs and current Control Chat implementation.
2. Generate Drizzle migration from current schema without hand-editing generated
   files.
3. Fix Control Chat runtime cancellation and send mutation status handling.
4. Fix renderer new-chat state handling.
5. Fix store persistence tests for CI.
6. Add/update focused tests for the accepted review items.
7. Run testing gate and Trellis Verify/check gate.
8. Commit and push PR #16 branch.

## Validation Commands

- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`
- Focused tests:
  - `bun test packages/trpc/src/router/control-chat/intent.test.ts packages/trpc/src/router/control-chat/package-builder.test.ts packages/trpc/src/router/control-chat/runtime.test.ts apps/desktop/src/renderer/stores/control-chat.test.ts`
  - Any additional focused renderer hook/store test added for new chat.
- Tool matrix:
  - `SKIP_ENV_VALIDATION=1 NODE_ENV=development SUPERSET_HOME_DIR="$PWD/superset-dev-data" bun .trellis/tasks/archive/2026-06/06-21-control-chat-tools-automations/validate-control-chat-tools.ts`
- Trellis Verify/check:
  - Use `trellis-check` guidance and record verification output in
    `validation.md`.

## Rollback Points

- If migration generation produces unrelated diffs, stop and inspect schema
  drift before staging.
- If runtime cancellation requires invasive API changes, prefer a minimal
  DB-status cancellation check for this PR and document the limitation.
- If full test suite is too slow locally, run focused tests plus root
  lint/typecheck and note CI expectations.
