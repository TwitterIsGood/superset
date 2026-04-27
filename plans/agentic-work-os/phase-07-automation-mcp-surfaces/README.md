# Phase 07: External Surfaces and Automation

Status: draft

## Goal

Expose the Agentic Work OS through stable surfaces beyond the desktop UI without turning this into one giant implementation phase.

Phase 07 is a phase family:

- **07A MCP/API operation surface** — stable tools/resources and async operation status.
- **07B CLI surface** — developer scripting over the same APIs.
- **07C Automation integration** — scheduled/event-driven workflows linked to Operation/Run.
- **07D Web/mobile monitoring and approvals** — lightweight remote visibility and decisions.

Each subphase should be planned and implemented independently.

## Why this phase exists

Once Superset has durable requirements, plans, task graphs, runs, review packets, chronicle, memory, and policy, external surfaces should use those same primitives.

Without this phase, every surface risks implementing its own half-version of orchestration.

## User-facing value

Users can:

- ask an external AI to create a plan in Superset;
- run a plan from MCP/CLI;
- schedule recurring work;
- monitor runs from web/mobile;
- review results without sitting in desktop all day.

## Internal value

Unify external access around shared product objects and operation IDs.

## Current primitives to reuse

MCP:

- `packages/mcp/src/server.ts`
- `packages/mcp/src/tools/index.ts`
- `packages/mcp/src/tools/tasks/create-task/create-task.ts`
- `packages/mcp/src/tools/devices/create-workspace/create-workspace.ts`
- `packages/mcp/src/tools/devices/start-agent-session/shared.ts`
- `packages/mcp/src/tools/utils/utils.ts`

Automations:

- `plans/20260417-automations.md`
- `packages/trpc/src/router/automation/automation.ts`
- `packages/trpc/src/router/automation/dispatch.ts`
- `apps/api/src/app/api/automations/evaluate/route.ts`
- `apps/api/src/app/api/automations/dispatch/[id]/route.ts`
- `packages/shared/src/rrule.ts`

Web:

- `apps/web/src/app/(agents)/components/AgentPromptInput/AgentPromptInput.tsx`
- `apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx`

CLI:

- `packages/cli/src/commands/tasks/create/command.ts`

## Proposed MCP tools

### Intake and planning

```text
create_intake
get_intake
create_plan
get_plan
approve_plan
reject_plan
create_tasks_from_plan
```

### Execution

```text
run_plan
get_run
list_runs
cancel_run
get_agent_run
list_agent_runs
```

### Review

```text
get_review_packet
generate_review_packet
request_fixes
```

### Chronicle/memory/policy

```text
get_timeline
list_memories
propose_memory
approve_memory
reject_memory
list_policy_packs
```

## Operation ID rule

Use the Operation model from `05-canonical-contracts.md`.

Long-running tools should return immediately with IDs:

```text
operationId
runId when semantic work exists
planId when planning exists
status follow-up tool
```

Do not block MCP calls while multiple workspaces/agents run. `operationId` is not a synonym for `runId`: Operation tracks async orchestration; Run tracks semantic product work.

## Automation evolution

Current automation dispatch is strong but stops too early.

Future automation should support:

```text
trigger -> intake/plan -> run -> review packet -> notification
```

Examples:

- nightly dependency check;
- daily stale workspace summary;
- PR review agent;
- scheduled test verification;
- weekly memory/policy cleanup suggestions.

## Web/mobile surfaces

### Web

Web should first support:

- view plans;
- view runs;
- view review packets;
- approve/reject plans;
- approve/reject memory candidates.

Only later should web create/drive full local agent sessions unless host-service/cloud execution is mature.

### Mobile

Mobile should be lightweight:

- notifications;
- approve/reject plan;
- approve risky action;
- review summary;
- run status;
- memory approval.

Do not build complex graph/workspace UI on mobile first.

## Non-goals

- No separate orchestration model for MCP.
- No blocking long-running MCP tools.
- No full mobile IDE.
- No web session creation until backend supports it safely.

## Completion criteria

Phase 07A is complete when MCP/API can read core objects and start async operations with durable `operationId` status.

Phase 07B is complete when CLI commands wrap the same APIs without duplicating orchestration logic.

Phase 07C is complete when automation runs link to Operation/Run and produce completion/result state beyond `dispatched`.

Phase 07D is complete when web/mobile can monitor and approve plan/run/review/memory decisions without acting as a full workspace UI.

The phase family is complete when external surfaces can use the same durable product objects as desktop:

```text
intake -> plan -> run -> review -> timeline/memory/policy
```

without duplicating orchestration logic.
