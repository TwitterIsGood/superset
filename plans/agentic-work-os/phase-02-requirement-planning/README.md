# Phase 02: Requirement Planning

Status: draft

## Goal

Turn a one-line requirement into a structured, editable, approvable plan.

This is where Superset starts feeling magical while staying controlled:

```text
User says one sentence.
Superset explores enough context.
Superset proposes a plan.
User approves/edits/rejects.
Only then does execution begin.
```

## Why this phase exists

The user’s key question was:

> A requirement often arrives as one sentence, but behind it are many tasks. How should Superset solve that?

This phase is the direct answer.

Superset should not ask users to manually pre-decompose every request. But it also should not auto-launch many agents from a vague sentence. The right middle ground is planner-assisted shaping.

## User-facing value

The user sees:

```text
Describe what you want
```

Then:

```text
Superset thinks this breaks into 4 parts.
Risk: medium.
Affected areas: desktop renderer, paywall constants, tests.
Recommended execution: inspect first, then two parallel changes, then validation.

[Edit Plan] [Run]
```

The user does not see raw agent context unless expanded.

## Internal value

Create durable planning state:

- requirement/intake record;
- plan record;
- plan steps;
- plan approval status;
- structured affected areas;
- risk classification;
- validation strategy;
- optional task draft generation.

## Current primitives to reuse

- `apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx`
- `packages/ui/src/components/ai-elements/plan.tsx`
- `packages/host-service/src/trpc/router/chat/chat.ts` (`respondToPlan`)
- `packages/trpc/src/router/task/task.ts`
- `packages/mcp/src/tools/tasks/create-task/create-task.ts`
- `packages/shared/src/agent-launch.ts`

## Reference ideas to reuse

### Superpowers

- brainstorming before implementation;
- writing plans with exact scope, files, commands, validation;
- review/approval before execution.

### Trellis

- plan agent concept;
- task metadata with phases and related files;
- context manifests for future implement/check/debug.

### OpenChronicle

- plan generation should emit events later;
- plan/memory/context should be source-linked;
- interface layers should be thin over use cases.

## Proposed entities

### Requirement / Intake

Minimum:

```text
id
organizationId
projectId nullable
createdByUserId
source: desktop | web | mcp | cli | slack | automation | chat
prompt
status: RequirementStatus from `../05-canonical-contracts.md`
createdAt
updatedAt
```

Optional later:

```text
attachments
linkedIssueUrls
linkedPrUrls
sourceTaskId
sourceChatSessionId
```

### Plan

Minimum:

```text
id
organizationId
requirementId nullable
projectId nullable
createdByUserId
status: PlanStatus from `../05-canonical-contracts.md`
version
title
summary
riskLevel: low | medium | high | critical
affectedAreas json
validationStrategy json
workspaceStrategy json nullable
contentMarkdown
createdAt
updatedAt
approvedAt nullable
approvedByUserId nullable
```

### PlanStep

Minimum:

```text
id
planId
order
title
description
kind: research | implementation | validation | review | docs | migration | unknown
status: draft | approved | converted_to_task | skipped
riskLevel nullable
expectedFiles json nullable
validationHints json nullable
```

## Planning output standard

Planner output should include:

```text
summary
affected areas
assumptions
questions if needed
tasks/steps
dependencies if obvious
risk level
workspace strategy
validation strategy
recommended next action
```

## Scope

Phase 02 should support:

- one-line intake;
- planner-generated structured plan;
- plan preview;
- user approval/rejection;
- optional conversion to tasks;
- no auto-execution before approval by default.

## Non-goals

- No advanced DAG scheduler yet.
- No full workspace strategy engine yet.
- No memory extraction yet.
- No strict policy engine yet.
- No fully autonomous execution from vague prompt.

## Completion criteria

Phase 02 is complete when a user can:

1. enter a one-line requirement;
2. receive a structured plan;
3. approve/reject/edit it;
4. persist the plan;
5. create linked tasks from approved plan steps.
