# Phase 02 Implementation Plan

## Strategy

Build planning as a product object, not just a chat answer.

Recommended sequence:

1. Define requirement/plan schema or MVP persistence.
2. Add planner service/use case.
3. Add plan preview/approval UI.
4. Add conversion from approved plan steps to tasks.
5. Wire optional run using existing task/workspace/agent primitives.

## Step 1: Decide persistence MVP

Options:

### Option A: Full schema now

Add:

```text
requirements
plans
plan_steps
plan_tasks
```

Pros:

- clean long-term design;
- easier future task graph/chronicle.

Cons:

- more migrations and local/cloud sync decisions.

### Option B: Plan stored as chat/session artifact first

Use existing chat plan UI/runtime and persist minimal JSON somewhere existing.

Pros:

- faster.

Cons:

- risks product state becoming chat transcript.

### Recommended

Use explicit plan schema if Phase 01 run foundation is complete. If not, create a minimal plan table first and defer task graph fields.

## Step 2: Schema proposal

Cloud schema candidate in `packages/db/src/schema/schema.ts`:

```text
requirements
plans
planSteps
planTasks
```

If local-first is required, mirror in `packages/local-db/src/schema/schema.ts` or implement local-only first with later sync.

Do not manually edit generated migration files.

## Step 3: API/service layer

Potential router:

```text
packages/trpc/src/router/plan/plan.ts
```

Operations:

```text
createRequirement
createPlanDraft
generatePlan
updatePlan
approvePlan
rejectPlan
createTasksFromPlan
getPlan
listPlans
```

Alternative desktop-local router if local-first.

## Step 4: Planner implementation

Planner can initially be a chat/agent flow that returns structured JSON plus markdown.

Planner prompt/context should include:

- user requirement;
- selected project;
- linked issue/PR/attachments;
- repo summary if available;
- current tasks if relevant;
- current workspace if relevant;
- standards from policy later.

Output schema:

```text
{
  title,
  summary,
  assumptions,
  affectedAreas,
  riskLevel,
  steps: [
    { title, description, kind, expectedAreas, validationHints, dependsOn }
  ],
  workspaceStrategy,
  validationStrategy,
  recommendedNextAction
}
```

Validate planner output before storing.

## Step 5: UI

Likely surfaces:

- extend New Workspace / Dashboard prompt path;
- add “Plan first” mode;
- add Plan pane or modal;
- reuse `packages/ui/src/components/ai-elements/plan.tsx` where appropriate.

Default plan UI:

```text
Title
Summary
Risk
Affected areas
Steps
Validation
Buttons: Edit, Approve, Create Tasks, Run
```

Do not expose raw JSON.

## Step 6: Convert plan steps to tasks

Use existing task APIs:

- cloud `task.createFromUi` or lower-level create;
- MCP `create_task` for agent-driven flows;
- local tasks router for local-first.

Task description should include:

- step description;
- parent plan title;
- acceptance criteria;
- validation hints;
- links back to plan.

But link should be structured in `planTasks`, not only markdown.

## Step 7: Optional run

After tasks are created, reuse:

- `RunInWorkspacePopover` logic;
- `AgentLaunchRequest`;
- Phase 01 Run/AgentRun tracking.

Do not build custom launch path if existing task/workspace/agent path can be reused.

## Step 8: Tests

Unit tests:

- planner output schema validation;
- plan status transitions;
- plan-to-task mapping;
- approval version handling.

Integration tests:

- create requirement;
- generate plan draft;
- approve plan;
- create tasks;
- verify task links.

Manual validation:

1. Enter one-line requirement.
2. Plan appears.
3. Edit plan.
4. Approve.
5. Create tasks.
6. Confirm tasks link back.
7. Run selected tasks if Phase 01 is available.

## Rollout

Start desktop-first.

Possible setting:

```text
enablePlanningIntake
```

## Risks

### Planner hallucination

Mitigation:

- show assumptions;
- require approval;
- keep plans editable;
- do repo exploration before detailed claims.

### Task spam

Mitigation:

- default to 3-7 major steps;
- allow merge/split;
- do not auto-create tasks without approval.

### Schema too early

Mitigation:

- keep schema minimal;
- avoid DAG complexity until Phase 03.
