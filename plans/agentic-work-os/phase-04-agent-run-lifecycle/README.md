# Phase 04: Agent Run Lifecycle

Status: draft

## Goal

Make every meaningful agent execution observable, resumable, and linked to product state.

Phase 01 creates the foundation. Phase 04 deepens it into a lifecycle:

```text
queued -> launching -> running -> waiting_for_approval/question/plan_response -> verifying -> completed/failed/canceled
```

## Why this phase exists

Users should not have to read terminal scrollback or chat transcripts to know what happened.

Superset should answer:

- which agent ran;
- what context it received;
- what it changed;
- what it asked;
- what commands/tests it ran;
- why it stopped;
- whether it is ready for review.

## User-facing value

Users see agent work as clear status cards:

```text
Claude is updating desktop paywall logic.
Agent status: waiting for approval to run tests.
Workspace: remove-task-paywall
Task: Update desktop gating
```

After completion:

```text
Completed with concerns.
Changed 3 files.
Tests not run because dependency install failed.
Review recommended.
```

## Internal value

AgentRun becomes the durable unit of work for:

- status tracking;
- approval handling;
- artifact capture;
- verification;
- review packet generation;
- chronicle events;
- memory extraction;
- policy decisions.

## Current primitives to reuse

- `packages/shared/src/agent-launch.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts`
- `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`
- `apps/desktop/src/main/lib/notifications/server.ts`
- `packages/host-service/src/trpc/router/chat/chat.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `packages/host-service/src/db/schema.ts`
- `packages/trpc/src/router/automation/dispatch.ts`

## Lifecycle states

Use the canonical `AgentRunStatus` enum from `05-canonical-contracts.md`.

Current canonical values:

```text
queued
launching
running
waiting_for_approval
waiting_for_question
waiting_for_plan_response
verifying
completed
completed_with_concerns
exited_unverified
failed
canceled
timeout
unknown
```

## Event inputs

AgentRun status can be updated by:

- launch result;
- agent hook events;
- chat approval/question/plan state;
- terminal process status;
- verification result;
- user cancellation;
- automation timeout;
- manual correction.

## Artifacts

AgentRun should attach artifacts over time:

- prompt/context bundle;
- changed files summary;
- diff stats;
- test/command results;
- permission requests;
- errors;
- generated review summary;
- PR/commit URLs.

## Scope

Phase 04 should:

- define durable lifecycle states;
- map existing hook/chat/terminal events to states;
- record artifacts;
- provide UI status;
- support cancellation/failure visibility;
- avoid full verification enforcement until Phase 05.

## Non-goals

- No full review packet generation yet.
- No memory extraction.
- No strict policy enforcement.
- No complete replacement of chat/terminal runtime internals.

## Completion criteria

Phase 04 is complete when a user can inspect an AgentRun and understand:

- why it started;
- where it ran;
- what it is waiting on;
- what it produced;
- why it finished or failed.
