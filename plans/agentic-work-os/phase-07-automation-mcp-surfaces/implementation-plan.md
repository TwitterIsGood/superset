# Phase 07 Implementation Plan

## Strategy

Expose high-level primitives only after they exist internally.

Do not build `run_plan` MCP before plans/runs exist.

## Step 1: Add read tools first

MCP tools/resources:

```text
get_plan
list_plans
get_run
list_runs
get_review_packet
get_timeline
```

Read tools are safer and validate object model.

## Step 2: Add planning mutation tools

```text
create_intake
create_plan
approve_plan
reject_plan
create_tasks_from_plan
```

Each should return durable IDs.

## Step 3: Add execution tools

```text
run_plan
cancel_run
request_fixes
```

These should return run/operation IDs immediately.

## Step 4: Add memory/policy tools cautiously

Start with:

```text
list_memories
propose_memory
approve_memory
reject_memory
list_policy_packs
```

Avoid broad policy mutation until UI/audit is stable.

## Step 5: Fix and consolidate existing MCP primitives

Before relying heavily on current MCP workspace creation, validate known risk:

- MCP tool accepts `baseBranch`;
- desktop executor may expect `compareBaseBranch`.

Relevant files:

- `packages/mcp/src/tools/devices/create-workspace/create-workspace.ts`
- `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/tools/create-worktree.ts`

## Step 6: CLI commands

Add CLI only after API/service layer exists.

Potential commands:

```text
superset intake create
superset plan get
superset plan approve
superset run start
superset run status
superset review get
```

Reuse tRPC/API clients rather than duplicating logic.

## Step 7: Automation integration

Extend automation from:

```text
schedule -> prompt dispatch
```

to:

```text
trigger -> intake/plan/run/review
```

Update automation runs to link to Run/AgentRun.

Add result lifecycle:

```text
scheduled -> dispatching -> running -> completed | failed | canceled
```

## Step 8: Web monitoring

Enable web views for:

- plan detail;
- run detail;
- review packet;
- approvals.

Do not enable session creation until host/cloud lifecycle is safe.

## Step 9: Mobile monitoring

Add mobile surfaces only for concise decisions:

- approve/reject plan;
- approve action;
- view run status;
- view review packet summary;
- save/reject memory.

Follow mobile structure rules in `apps/mobile/AGENTS.md`.

## Step 10: Tests

MCP tests:

- schema validation;
- auth/org checks;
- durable IDs returned;
- async operation status.

Automation tests:

- scheduled automation creates run;
- run links to automationRun;
- completion updates automationRun.

Web/mobile tests:

- read-only views;
- approval mutations;
- auth checks.

## Risks

### External agents misuse tools

Mitigation:

- require plan approval by default;
- return IDs/status instead of blocking;
- enforce org/device permissions.

### Too many tools

Mitigation:

- prioritize workflow-level tools;
- keep low-level tools as primitives.

### Automation complexity

Mitigation:

- extend existing automation dispatch incrementally;
- do not replace it wholesale.
