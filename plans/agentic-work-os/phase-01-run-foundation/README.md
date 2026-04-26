# Phase 01: Run Foundation

## Goal

Make execution state durable enough that Superset can track work beyond “a terminal/chat was launched.”

This phase creates the foundation for:

```text
Task or one-line request -> Run -> AgentRun -> ReviewPacket placeholder
```

It does not yet need full AI task decomposition. It establishes the durable spine later phases build on.

## Why this phase exists

Superset already launches agents well. The missing piece is durable semantic execution state.

Current state often looks like:

```text
workspace exists
terminal/chat pane exists
agent command was launched
```

Future state should look like:

```text
this requirement/task has a run
this run created these agent runs
these agent runs happened in these workspaces
these sessions produced these artifacts
this review packet summarizes the result
```

Without this phase, later planning, review, chronicle, memory, and policy features have nowhere reliable to attach.

## User-facing value

Users can answer:

- What is running?
- Which task/request started this work?
- Which workspace is it in?
- Which agent is doing it?
- Did it fail, finish, or need attention?

The UX should still be light:

```text
Running 3 items
1 waiting for approval
1 finished with concerns
1 failed verification
```

## Internal value

Create durable objects for execution:

- `Run`
- `AgentRun`
- minimal `ReviewPacket` or review packet placeholder
- links to task/workspace/chat/terminal

## Current primitives to reuse

- `packages/shared/src/agent-launch.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/terminal-adapter.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/chat-adapter.ts`
- `packages/db/src/schema/schema.ts`
- `packages/local-db/src/schema/schema.ts`
- `packages/host-service/src/db/schema.ts`
- `packages/trpc/src/router/task/task.ts`
- `packages/host-service/src/trpc/router/chat/chat.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `plans/20260417-automations.md`

## Proposed minimum entities

### Run

A top-level execution attempt.

Potential fields:

```text
id
organizationId
projectId nullable
v2WorkspaceId nullable
taskId nullable
source: task | prompt | chat | mcp | automation | manual
sourceId nullable
status: queued | running | waiting | completed | failed | canceled
summary nullable
createdByUserId nullable
startedAt nullable
completedAt nullable
createdAt
updatedAt
```

### AgentRun

One agent doing one scoped job.

Potential fields:

```text
id
organizationId
runId
taskId nullable
v2WorkspaceId nullable
agentKind: terminal | chat
agentType nullable
launchSource
chatSessionId nullable
terminalSessionId nullable
status: queued | launching | running | waiting_for_approval | completed | failed | canceled
summary nullable
error nullable
startedAt nullable
completedAt nullable
createdAt
updatedAt
```

### ReviewPacket placeholder

Do not overbuild in Phase 01. Store enough to attach future review output.

Potential fields:

```text
id
organizationId
runId
taskId nullable
status: draft | generated | approved | rejected
summary nullable
createdAt
updatedAt
```

## Scope

Phase 01 should:

- add durable execution records;
- link records to existing launches;
- show basic run status in UI;
- avoid full planner/task graph complexity;
- avoid strict completion enforcement.

## Non-goals

- No AI planner yet.
- No dependency graph yet.
- No memory system yet.
- No policy engine yet.
- No review packet generation beyond placeholder/basic summary.
- No full automation result lifecycle unless trivial to wire.

## Dependencies

- Phase 00 vocabulary and standards.

## Completion criteria

Phase 01 is complete when a launched task/prompt can be traced through:

```text
Run -> AgentRun -> workspace -> chat/terminal session
```

and the user can see basic status without reading raw terminal/chat history.
