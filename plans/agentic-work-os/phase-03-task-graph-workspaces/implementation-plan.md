# Phase 03 Implementation Plan

## Strategy

Build a modest graph first. Do not build a full workflow engine.

Recommended order:

1. Add dependency/link schema.
2. Generate dependencies from plan steps.
3. Add workspace strategy proposal.
4. Add user approval/override UI.
5. Reuse existing workspace creation and launch flows.

## Step 1: Schema

Potential tables:

```text
taskDependencies
taskExecutionGroups
workspaceAllocations
```

If schema scope is too large, start with `taskDependencies` and a JSON `workspaceStrategy` on plan/run as temporary MVP only. Canonical workspace allocation should move to `workspaceAllocations` before MCP/web/mobile or automation depends on it.

Minimum dependency fields:

```text
taskId
dependsOnTaskId
type
createdAt
```

## Step 2: Generate graph from plan

Plan steps from Phase 02 should include optional `dependsOn` references.

Planner can propose:

```text
steps: [
  { id: 'research', kind: 'research' },
  { id: 'api', dependsOn: ['research'] },
  { id: 'ui', dependsOn: ['research'] },
  { id: 'validation', dependsOn: ['api', 'ui'] }
]
```

Store dependencies after tasks are created.

## Step 3: Conflict/resource analysis MVP

Start with simple heuristics:

- same expected file -> possible conflict;
- migration/schema files -> sequential/high risk;
- package-level separation -> likely parallel;
- validation/review steps wait for implementation;
- unknown files -> research first or sequential.

Do not pretend this is perfect.

## Step 4: Workspace strategy proposal

Generate strategy:

```text
[
  {
    group: 'research',
    tasks: [...],
    workspace: 'new',
    mode: 'sequential',
    reason: 'needs repo inspection first'
  },
  {
    group: 'parallel-ui-copy',
    tasks: [...],
    workspace: 'isolated_per_task',
    reason: 'expected file sets are independent'
  }
]
```

## Step 5: UI

Add an execution plan review section:

Default:

```text
Execution
- Research first
- 2 tasks in parallel
- Final validation last
```

Advanced:

- graph;
- task links;
- workspace allocation;
- reasons;
- override controls.

## Step 6: Workspace creation

Reuse:

- host-service workspace creation;
- desktop workspace create hooks;
- shared branch naming helpers.

Do not write a new git worktree implementation.

## Step 7: Scheduling MVP

Initial scheduling can be user-triggered:

- Run available tasks;
- after completion, user runs next group.

Later scheduling can be automatic when Phase 04/05 can reliably detect completion.

## Step 8: Tests

Unit tests:

- dependency validation;
- cycle detection;
- topological sorting;
- workspace strategy heuristic;
- graph to execution groups.

Integration tests:

- approved plan -> tasks -> dependencies;
- dependencies prevent blocked run;
- workspace allocation created.

Manual validation:

1. Create plan with 4 steps.
2. Convert to tasks.
3. Confirm dependencies.
4. Confirm execution summary.
5. Create recommended workspaces.
6. Run available tasks only.

## Risks

### Overbuilding scheduler

Mitigation: start with graph + manual/semiautomatic group execution.

### False parallel safety

Mitigation: default to sequential when uncertain; expose rationale.

### Complex UI

Mitigation: graph hidden by default.
