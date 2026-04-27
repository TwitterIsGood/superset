# Phase 04 Implementation Plan

## Strategy

Extend Phase 01 run tracking into a richer lifecycle by consuming existing events first.

## Step 1: Implement canonical lifecycle enum

Export the canonical `AgentRunStatus` enum from `../05-canonical-contracts.md` into a shared package used across desktop, host-service, and API.

Possible location:

```text
packages/shared/src/agent-run-lifecycle.ts
```

or colocated with DB/API types.

## Step 2: Add artifacts model

Potential table:

```text
agentRunArtifacts
```

Fields:

```text
id
organizationId
agentRunId
type
summary nullable
payload json
createdAt
```

All `payload json` handling must follow `../05-canonical-contracts.md` artifact/payload rules. Raw command output and prompt/context bundles are redacted or local-only by default.

Initial artifact types:

- launch_request;
- prompt_file;
- attachment;
- permission_request;
- question;
- plan_response;
- command_result;
- error;
- summary.

## Step 3: Map launch events

Surfaces:

- renderer orchestrator;
- terminal adapter;
- chat adapter.

On launch:

- create/update AgentRun `launching`;
- attach launch request artifact;
- on success, `running`;
- on failure, `failed` with error artifact.

## Step 4: Map hook events

Surfaces:

- `apps/desktop/src/main/lib/notifications/server.ts`
- `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`

Map:

```text
Start -> running
PermissionRequest -> waiting_for_approval
PendingQuestion -> waiting_for_question
Stop -> exited_unverified or completed_with_concerns depending hook data
```

Do not over-trust stop events if verification is absent. Do not use `completed_unverified`; canonical status is `exited_unverified`.

## Step 5: Map chat events

Surface:

- `packages/host-service/src/trpc/router/chat/chat.ts`

Map:

- approval request -> waiting_for_approval;
- question -> waiting_for_question;
- plan request -> waiting_for_plan_response;
- stop -> canceled/failed/completed depending runtime state.

## Step 6: Map terminal events

Surfaces:

- host-service terminal router;
- desktop terminal daemon/session.

Map process exit to:

- `exited_unverified` or `failed` depending exit code and context;
- avoid `completed` unless agent protocol gives completion evidence.

## Step 7: UI

Potential UI locations:

- task detail page run section;
- workspace sidebar run section;
- pane header status;
- dashboard “active runs”.

Minimum details:

```text
Agent
Task/Plan
Workspace
Status
Started
Attention needed
Open pane
```

## Step 8: Automation integration

Automation runs currently stop at `dispatched`.

Add optional linking:

```text
automationRunId -> runId -> agentRunId
```

Do not fully solve automation completion unless Phase 04 scope allows.

## Step 9: Tests

Unit tests:

- lifecycle transition helper;
- artifact type validation;
- hook event mapping;
- launch error mapping.

Integration tests:

- launch creates running AgentRun;
- permission event updates waiting state;
- error creates failed artifact;
- terminal exit does not falsely mark completed.

Manual validation:

1. Launch terminal agent.
2. Confirm AgentRun running.
3. Trigger permission request if possible.
4. Confirm waiting state.
5. Deny/approve and observe transition.
6. Stop agent and confirm non-false completion state.

## Risks

### Event source inconsistency

Mitigation: keep transition mapping conservative.

### Too much UI noise

Mitigation: show active/attention states first; archive completed details.

### Artifact bloat

Mitigation: store summaries and typed payloads, not unlimited raw logs.
