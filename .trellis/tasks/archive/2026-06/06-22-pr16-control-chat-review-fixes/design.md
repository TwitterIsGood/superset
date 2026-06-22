# PR16 Control Chat Review Fixes Design

## Accepted Review Items

1. P0 migration missing: accepted.
2. P1 Stop does not truly stop execution: accepted.
3. P1 New chat unusable: accepted.
4. P1 CI Test failure from unavailable storage: accepted.
5. P2 tool failure marked completed: accepted.

## Technical Approach

### Migration

Use the repository Drizzle generation workflow from `packages/db`. The schema
source is already updated; the missing output is generated migration artifacts.
Do not manually edit SQL, snapshot, or journal files after generation.

### Stop Cancellation

The existing `stop` mutation changes DB state, while runtime execution has no
abort signal. Add a runtime cancellation primitive that checks the current
`control_chat_runs.status` row. The runtime should check cancellation:

- before model planning
- before executing fallback tools
- before each model-requested tool
- after each tool result
- before returning content for persistence

If aborted, runtime returns/throws a typed cancellation result that prevents
assistant message persistence and prevents the send mutation from overwriting
the run back to `completed`.

### New Chat

The renderer hook currently auto-selects the first session any time
`activeSessionId` is null. Add explicit local "new session" intent so auto
selection only happens on initial load/restoration, not after the user clicks
new chat. Sending in this state should omit `sessionId`, allowing the server to
create a new cloud session.

### Store Tests

Avoid CI dependence on browser storage. The store should use a safe storage
factory that becomes a no-op memory-compatible storage when `localStorage` is
unavailable. Tests should install a deterministic in-memory storage before
exercising persistence behavior.

### Failed Tool Status

The runtime catches per-tool errors to make them visible in chat, but the outer
send mutation currently treats any returned assistant content as success. Add a
runtime status/result flag indicating whether one or more tools failed. The send
mutation must mark such runs `failed` and persist a concise error. The assistant
message can still be written so the user sees the failure details.

## Risk

- Stop is DB-polled rather than process-level AbortController cancellation. That
  is sufficient for the current runtime because tool execution is sequential and
  cloud-owned, but long-running non-cooperative tool calls can only be stopped
  between await boundaries.
- Generated migration may conflict with concurrently added migrations on main;
  if so, regenerate against updated main before merge.
