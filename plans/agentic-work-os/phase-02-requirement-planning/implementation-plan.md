# Phase 02 Implementation Plan

## Strategy

Build planning as a product object, not just a chat answer.

Recommended sequence:

1. Define requirement/plan schema or MVP persistence.
2. Add planner service/use case.
3. Add plan preview/approval UI.
4. Add conversion from approved plan steps to tasks.
5. Wire optional run using existing task/workspace/agent primitives.

## Step 1: Follow canonical persistence

Use `05-canonical-contracts.md` as the default persistence decision.

For Phase 02:

- `Requirement`, `Plan`, `PlanStep`, and `PlanTask` are canonical cloud Postgres objects.
- desktop local drafts are allowed for offline/unsubmitted planning, but approved/shared plans require canonical cloud records.
- chat/session artifacts can render or explain a plan, but they are not the product source of truth.

Do not re-decide plan storage inside implementation unless the canonical matrix is updated.

## Step 2: Schema proposal

Cloud schema candidate in `packages/db/src/schema/schema.ts`:

```text
requirements
plans
planSteps
planTasks
```

If offline drafts are required, mirror/cache draft records locally in `packages/local-db/src/schema/schema.ts`; approved/shared plans remain canonical cloud records.

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

Optional desktop-local draft router for offline/unsubmitted planning only.

## Step 4: Planner implementation

Planner can initially be a chat/agent flow that returns structured JSON plus markdown.

Planner prompt/context should use the `PlannerContextBundle` contract in `05-canonical-contracts.md`.

It may include:

- user requirement;
- selected project;
- linked issue/PR/attachments metadata;
- repo summary with staleness report;
- scoped relevant files;
- current tasks if relevant;
- current workspace if relevant;
- known memories and policy hints later;
- redaction report and explicit budget.

Planner exploration itself should create an Operation and, when meaningful, a planner AgentRun or equivalent planner-run record.

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

| Field                   | Value                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Name                    | `enablePlanningIntake`                                                                                           |
| Storage location        | shared feature flag/config system used by desktop and cloud API                                                  |
| Default value           | off until Requirement/Plan persistence and approval UI are stable                                                |
| Rollout scope           | organization/project or developer setting                                                                        |
| UI/API gating           | hide plan-first intake UI and reject external plan-generation mutations when disabled                            |
| Disabled write behavior | local draft prompts may still exist as normal chat/input state, but no canonical `Requirement`/`Plan` is created |
| Cleanup condition       | remove after plan-first intake is the default path for medium/high-risk work                                     |

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
