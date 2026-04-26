# Phase 06 Implementation Plan

## Strategy

Build chronicle first, then memory, then policy.

Correct order:

```text
structured run events -> timeline -> memory candidates -> approved memory -> policy snapshots/decisions
```

## Step 1: Chronicle schema

Add table:

```text
chronicleEvents
```

Minimum fields:

```text
id
organizationId
projectId
workspaceId
taskId
runId
agentRunId
actorKind
actorId
eventType
summary
payload
occurredAt
ingestedAt
correlationId
parentEventId
```

Do not add hash chaining unless audit requirements justify it. Keep schema open for `prevHash/hash` later.

## Step 2: Emit core events

Start with events from existing lifecycle:

- run created;
- agent run started;
- waiting for approval/question;
- approval decision;
- agent run completed/failed;
- review packet generated.

Emit from shared service/helpers, not scattered UI code if possible.

## Step 3: Timeline UI

Add readable timeline to:

- run detail;
- task detail;
- workspace detail/sidebar.

Default event display:

```text
icon + time + summary
```

Expanded:

- source object links;
- payload;
- actor;
- correlation ID.

## Step 4: Memory schema

Add:

```text
memoryItems
```

Start without embeddings.

Fields:

```text
scope
kind
content
sourceEventIds
confidence
status
createdBy
expiresAt
```

## Step 5: Memory candidates

Generate candidates from:

- review packets;
- failed verification patterns;
- user corrections;
- explicit “remember this” actions;
- repeated policy decisions.

Candidate UI:

```text
Superset noticed this may be useful later:
[editable memory content]
Scope: Project
[Save] [Reject]
```

## Step 6: Memory retrieval for agent context

When launching agent runs, retrieve:

- pinned project memories;
- relevant task/project memories;
- user preferences if applicable.

Record retrieval later as chronicle events if useful.

## Step 7: Policy packs

Add advisory policy pack records.

Initial built-ins:

```text
Fast Prototype
Normal Implementation
Strict Refactor
Debugging
Database Sensitive
Security Sensitive
Review Only
```

Policy affects:

- planner prompt;
- agent prompt/context;
- required review packet checklist;
- recommended verification;
- approval requirements.

## Step 8: Policy snapshots and decisions

On run start:

- resolve applicable policy;
- store snapshot.

On approval/denial:

- record policy decision.

## Step 9: MCP/API surfaces

Later in this phase, expose read tools/resources:

- get timeline;
- list memories;
- propose memory;
- approve/reject memory;
- list policy packs.

Do not expose mutation-heavy policy tools before UI and auth are stable.

## Step 10: Tests

Unit tests:

- event creation helper;
- memory candidate validation;
- policy resolution;
- scope filtering.

Integration tests:

- run status change emits event;
- review packet generates candidate memory;
- approved memory retrieved for future launch;
- policy snapshot created on run start.

Manual validation:

1. Run task.
2. Observe timeline.
3. Generate review packet.
4. Propose memory.
5. Edit/save memory.
6. Launch new run and confirm memory appears in context.

## Risks

### Memory quality decay

Mitigation: candidate/approval flow and scope controls.

### Event volume

Mitigation: record important product events, not every token/log line.

### Policy false positives

Mitigation: advisory first.
