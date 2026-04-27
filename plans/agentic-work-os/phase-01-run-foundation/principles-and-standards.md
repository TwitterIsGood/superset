# Phase 01 Principles and Standards

## Primary principle

Execution state must become durable before higher-level automation becomes ambitious.

Do not build planner swarms or memory extraction while a basic launched agent cannot be durably traced.

## UX principles

### Show simple status

Default UI should show:

```text
Queued
Running
Needs attention
Completed
Failed
Canceled
```

Avoid exposing internal launch microstates unless expanded.

### Link to details

Every run row/card should link to:

- workspace;
- task if present;
- chat or terminal pane/session;
- error details if failed.

### Do not create dashboard noise

Phase 01 should not add a huge new dashboard if a compact run status component is enough.

## Data standards

### Run is not AgentRun

A `Run` groups work. An `AgentRun` is one agent execution.

Examples:

- one task with one Claude run: one Run, one AgentRun;
- one requirement with three generated tasks later: one Run, multiple AgentRuns;
- one automation that opens a chat and terminal later: one Run, multiple AgentRuns.

### Terminal session is not AgentRun

A terminal session is infrastructure. AgentRun is semantic work state.

### Chat session is not Plan

A chat session can contain planning conversation. A future Plan object is separate.

### Status transitions must be explicit

Allowed minimum transitions:

```text
queued -> launching -> running -> completed
queued -> launching -> failed
running -> waiting_for_approval -> running
running -> failed
running -> canceled
```

Do not silently infer success from pane existence.

## Agent standards

### Launch must create/update run state

Every product-level agent launch should either:

- create an AgentRun;
- attach to an existing AgentRun;
- explicitly mark itself as unmanaged.

### Completion can be best-effort in Phase 01

Phase 01 may not reliably know when terminal agents are done. It should record what it can and avoid false confidence.

Use canonical `AgentRunStatus` values from `../05-canonical-contracts.md`, especially:

- `running`
- `unknown`
- `exited_unverified`
- `completed_with_concerns`

Do not use `completed_unverified`.

## Review standards

ReviewPacket in Phase 01 can be a placeholder. Do not pretend it is a full verification artifact.

## Anti-patterns

Avoid:

- deriving everything from terminal scrollback;
- treating automation `dispatched` as completed;
- creating duplicate launch abstractions instead of extending `AgentLaunchRequest`;
- adding plan/task graph schema in this phase unless strictly required;
- marking runs as completed without evidence.

## Review checklist

- [ ] Every new execution object has stable IDs.
- [ ] Run and AgentRun are distinct.
- [ ] Existing launch flows reuse `AgentLaunchRequest`.
- [ ] UI remains lightweight.
- [ ] Failure states are visible.
- [ ] No false completion claims are introduced.
