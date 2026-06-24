# Implementation Plan

## Checklist

1. Host-service screen tracker
   - Add `@xterm/addon-serialize` to host-service dependencies if missing.
   - Create `terminal-screen-tracker.ts` with bounded headless xterm snapshot
     support.
   - Cover it with focused tests for cursor movement / alternate-screen-like
     output and same-size serialization.

2. Host terminal session integration
   - Add `screenTracker` to `TerminalSession`.
   - Feed it from the existing PTY byte output callback.
   - Resize it only alongside real host PTY resize paths.
   - Dispose it with the session.
   - Return `screenSnapshot` from `getTerminalSessionSnapshot`.

3. Host tRPC and cloud tRPC contract
   - Extend narrow snapshot types in host terminal router and
     `v2Workspace.getTerminalSnapshot`.
   - Preserve legacy `outputTail` and fallback behavior.
   - Add focused source/unit tests for payload forwarding and compatibility.

4. Mobile render path
   - Extend `TerminalEmulator` inbound restore message to include optional
     `cols`/`rows`.
   - Restore `screenSnapshot.content` with dimensions in one operation.
   - Make `WorkspaceMobileShell` prefer `screenSnapshot` for initial attach and
     reconnect, while retaining raw-tail delta fallback only when absent.
   - Keep live WebSocket output append path unchanged.

5. Validation
   - `bun test packages/host-service/src/terminal/...`
   - `bun test packages/host-service/test/integration/terminal.integration.test.ts`
   - `bun test packages/trpc/src/router/v2-workspace/v2-workspace.test.ts`
   - `bun test 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.test.ts' 'apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.test.ts'`
   - `bun run --cwd apps/mobile typecheck`
   - `bun run lint:fix`
   - `bun run lint`
   - `bun run typecheck`
   - Build unsigned IPA after validation.

## Files Expected To Change

- `packages/host-service/package.json`
- `packages/host-service/src/terminal/terminal.ts`
- `packages/host-service/src/terminal/terminal-screen-tracker.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `apps/mobile/screens/(authenticated)/workspaces/[id]/components/TerminalEmulator/TerminalEmulator.tsx`
- `apps/mobile/screens/(authenticated)/workspaces/[id]/components/WorkspaceMobileShell/WorkspaceMobileShell.tsx`
- Focused tests adjacent to the changed code.

## Non-Goals

- Do not implement CSS transform/scale as the root fix.
- Do not resize the shared PTY from mobile observer attach.
- Do not stream full snapshots continuously.
- Do not touch production database or generated cloud migrations.

## Rollback Points

- Mobile can stop preferring `screenSnapshot` and fall back to current raw-tail
  logic.
- Host-service can keep the optional response field absent if tracker creation
  fails, while preserving `outputTail`.
