# Phase 01 Implementation Plan

## Implementation strategy

Start by instrumenting existing launch flows rather than inventing a new orchestration engine.

Recommended order:

1. Define minimal run/agent-run schema.
2. Add creation/update APIs.
3. Wire renderer agent launch to create/update AgentRun.
4. Link task/workspace/session IDs.
5. Add lightweight UI status surface.
6. Add tests and validation.

## Step 1: Decide persistence location

Options:

### Option A: Cloud-first

Add tables to `packages/db/src/schema/schema.ts`.

Pros:

- cross-device visibility;
- MCP/API/automation-friendly;
- easier future web/mobile monitoring.

Cons:

- local-first desktop flows need sync/mirroring or degraded mode.

### Option B: Local-first MVP

Add to `packages/local-db/src/schema/schema.ts`.

Pros:

- desktop MVP faster;
- works with local-first tasks.

Cons:

- harder to integrate cloud automations/MCP later.

### Recommended

If the current product direction is local-first desktop for tasks, use local-first MVP or dual design. If web/MCP/automation visibility is prioritized, cloud-first is better.

Document the decision before coding.

## Step 2: Add schema

Potential tables:

```text
runs
agentRuns
reviewPackets
```

Minimum columns should include:

- IDs;
- org/project/task/workspace links;
- source;
- status;
- chat/terminal session IDs;
- timestamps;
- summary/error.

Follow DB rules from `AGENTS.md`:

- modify schema files only;
- do not manually edit generated Drizzle migration output;
- ask/generate migrations through the documented process.

## Step 3: Add APIs

Likely API surfaces:

- cloud tRPC router if cloud-first;
- desktop tRPC/local router if local-first;
- host-service route if runs are host-owned.

Potential operations:

```text
createRun
updateRunStatus
createAgentRun
updateAgentRunStatus
listRunsForTask
listRunsForWorkspace
getRun
```

Keep API minimal.

## Step 4: Wire agent launch

Current surfaces:

- `packages/shared/src/agent-launch.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts`
- terminal adapter
- chat adapter

Add optional fields to launch request or orchestrator input:

```text
runId
agentRunId
sourceObjectType
sourceObjectId
```

or create the run inside orchestrator before adapter launch.

Preferred: caller creates or requests a Run, orchestrator creates/updates AgentRun when launch starts.

## Step 5: Link existing task execution flow

Important UI:

- `RunInWorkspacePopover.tsx`

When selected tasks are run in workspaces:

1. Create one Run for the batch or one Run per task.
2. Create AgentRun for each launched agent.
3. Link each AgentRun to task/workspace/session.

Recommended initial design:

- one Run per user action/batch;
- one AgentRun per task/workspace/agent.

## Step 6: Link prompt/new workspace flow

Important UI:

- `NewWorkspaceModal` prompt group.

For one-line prompt direct launch:

- create Run with source `prompt`;
- create AgentRun linked to new workspace/session.

If a task is created too, link taskId.

## Step 7: Basic UI

Potential locations:

- task detail page;
- workspace sidebar/header;
- dashboard run list;
- agent pane header.

Minimum UI:

```text
Run status chip
Agent name
Workspace link
Started time
Needs attention / failed reason
```

Do not build full chronicle timeline yet.

## Step 8: Tests

Unit tests:

- status transition reducer/helpers;
- API input validation;
- launch request normalization with run IDs.

Integration tests:

- create Run + AgentRun;
- update status;
- list by task/workspace.

Manual validation:

- create task;
- run in workspace;
- confirm Run/AgentRun created;
- launch terminal agent;
- confirm session ID attached;
- launch chat agent;
- confirm chat session attached;
- failure path records error.

## Rollout

Use hidden/internal UI first if needed.

Recommended feature flag or setting:

```text
enableAgentRunTracking
```

Remove flag only after launch flows are stable.

## Risks

### Terminal completion ambiguity

Mitigation: record launch/running reliably first; add completion verification in Phase 05.

### Local/cloud duplication

Mitigation: document persistence decision before implementation and avoid adding both without sync design.

### Scope creep into planner

Mitigation: Phase 01 does not generate plans. It only records execution.
