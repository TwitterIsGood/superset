# Phase 03: Task Graph and Workspace Strategy

Status: draft

## Goal

Turn approved plans into an executable task graph and decide how work should be distributed across workspaces and agents.

This phase answers:

```text
Which tasks can run in parallel?
Which must be sequential?
Which should share a workspace?
Which need isolated worktrees?
Which files/resources may conflict?
```

## Why this phase exists

A one-line requirement often decomposes into multiple tasks. But a flat task list is not enough.

Real software work has:

- dependencies;
- shared files;
- migrations;
- API/UI sequencing;
- validation after implementation;
- review gates;
- merge conflict risk.

Superset should make the user feel this is simple, while internally maintaining execution strategy.

## User-facing value

User sees a simple execution plan:

```text
Execution plan:
1. Research current flow first.
2. Run UI copy and test update in parallel.
3. Run final validation after both finish.

Recommended: 2 workspaces.
Risk: low-to-medium.
```

Advanced users can expand to see the graph.

## Internal value

Create explicit task/workspace strategy:

- task dependencies;
- task groups;
- workspace allocation;
- conflict detection;
- execution order;
- resource locks;
- validation gates.

## Current primitives to reuse

- existing `tasks` table and status model;
- `RunInWorkspacePopover` batch task execution;
- V2 workspace creation in host-service;
- shared workspace naming helpers;
- `AgentLaunchRequest`;
- pane targeting and workspace layout.

Relevant files:

- `packages/db/src/schema/schema.ts`
- `packages/trpc/src/router/task/task.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopover/RunInWorkspacePopover.tsx`
- `packages/host-service/src/trpc/router/workspace-creation/procedures/create.ts`
- `packages/shared/src/workspace-launch/branch.ts`
- `packages/shared/src/agent-launch.ts`

## Reference ideas to reuse

### Superpowers

- parallel agents only when work is independent;
- fresh subagent per scoped task;
- controller/reviewer responsibility remains centralized.

### Trellis

- task parent/children;
- branch/base branch/worktree path;
- task phase and next action;
- worktree policy.

### OpenChronicle

- task graph changes should later emit chronicle events;
- graph/workspace decisions should be traceable.

## Proposed entities

### Task dependency

```text
id
organizationId
planId nullable
taskId
dependsOnTaskId
type: blocks | validates | reviews | prepares_context
createdAt
```

### Task execution group

Groups tasks that should run together or in a shared workspace.

```text
id
organizationId
planId
runId nullable
name
strategy: shared_workspace | isolated_workspace | sequential | validation
status derived from member tasks/runs; not independently persisted
```

### Workspace allocation

```text
id
organizationId
runId
taskId nullable
groupId nullable
v2WorkspaceId nullable
strategy: create_new | reuse_existing | source_workspace | main_repo_branch
reason
createdAt
```

## Scope

Phase 03 should:

- persist task dependencies;
- generate a basic execution graph from approved plan steps;
- propose workspace strategy;
- let user approve/override strategy;
- create workspaces according to strategy;
- launch the first ready group of tasks according to dependency order if Phase 04 exists or via current launch flow if not;
- record blocked tasks without needing automatic unblock scheduling in the MVP.

## Non-goals

- No fully autonomous scheduler yet.
- No advanced merge conflict prediction beyond simple heuristics.
- No distributed queue engine.
- No memory/policy enforcement.

## Completion criteria

Phase 03 MVP is complete when Superset can:

1. convert an approved plan into linked tasks;
2. record dependencies among them;
3. recommend workspace allocation;
4. create required workspaces;
5. start the first ready group while recording blocked tasks.

Automatic detection of completed groups and automatic unblocking of later groups depends on Phase 04/05 lifecycle and verification work.
