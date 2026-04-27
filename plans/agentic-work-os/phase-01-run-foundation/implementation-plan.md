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

## Step 1: Follow canonical persistence

Use `05-canonical-contracts.md` as the default persistence decision.

For Phase 01:

- `Run` canonical owner: Cloud Postgres.
- `AgentRun` canonical owner: Cloud Postgres.
- host-service local DB remains canonical only for physical workspace/terminal runtime facts.
- desktop local DB may cache/mirror run state only as an explicit sync/offline behavior.
- purely local draft runs are allowed only for local-only UI actions and must not be exposed through MCP/web/mobile until synced.

Do not re-decide cloud-first vs local-first inside implementation unless this canonical matrix is updated.

## Step 2: Add schema

Potential tables:

```text
runs
agentRuns
```

Do not create formal `reviewPackets` in Phase 01. Reserve nullable linkage/summary fields only if needed.

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

- cloud tRPC router for canonical shared Run/AgentRun records;
- desktop/local helpers only for cache/offline draft behavior;
- host-service routes only for physical runtime facts and launch/session linkage.

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

| Field                   | Value                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Name                    | `enableAgentRunTracking`                                                                                      |
| Storage location        | shared feature flag/config system used by desktop and cloud API                                               |
| Default value           | off until schema/API writes are validated in development; on only for opted-in internal builds                |
| Rollout scope           | organization/project or developer setting, not per-pane only                                                  |
| UI/API gating           | hide run status UI and skip nonessential AgentRun writes when disabled                                        |
| Disabled write behavior | do not create shared `Run`/`AgentRun` records for unmanaged launches; existing records remain readable        |
| Cleanup condition       | remove after all supported launch surfaces create reliable run state and Phase 04 lifecycle mapping is stable |

Remove flag only after launch flows are stable.

## Risks

### Terminal completion ambiguity

Mitigation: record launch/running reliably first; add completion verification in Phase 05.

### Local/cloud duplication

Mitigation: document persistence decision before implementation and avoid adding both without sync design.

### Scope creep into planner

Mitigation: Phase 01 does not generate plans. It only records execution.
