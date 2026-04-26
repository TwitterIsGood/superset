# Phase 06: Chronicle, Memory, and Policy

## Goal

Give Superset durable memory, auditability, and behavioral governance without making the user interface heavy.

This phase turns agentic work into organizational learning:

```text
what happened -> what matters -> what should be remembered -> how future agents should behave
```

## Why this phase exists

Agentic software work needs more than execution.

Teams need to know:

- what happened;
- why decisions were made;
- what failed before;
- what conventions matter;
- which policies were in force;
- what agents are allowed or expected to do.

Without chronicle and memory, every new agent run starts from partial amnesia.

Without policy, every agent run relies on fragile prompts.

## User-facing value

Default UX stays light.

Users see:

```text
Superset remembered a useful project rule:
"Desktop dev should use the arm64 startup flow."

Save this memory?
[Save] [Edit] [Reject]
```

Or:

```text
Mode: Strict because this touches billing.
Requires review before PR.
```

They do not see raw event tables by default.

## Internal value

Add foundations for:

- structured chronicle events;
- source-linked memory items;
- policy packs;
- policy snapshots;
- policy decisions;
- context assembly for future agent runs.

## Current primitives to reuse

- Phase 01/04 run state;
- Phase 05 review/evidence artifacts;
- existing memory system outside repo as conceptual precedent;
- MCP/server patterns;
- chat approval/question handling;
- project/user settings.

Relevant current files:

- `packages/db/src/schema/schema.ts`
- `packages/local-db/src/schema/schema.ts`
- `packages/shared/src/agent-launch.ts`
- `packages/host-service/src/trpc/router/chat/chat.ts`
- `packages/mcp/src/tools/index.ts`

## Reference ideas to reuse

### OpenChronicle

- event model;
- memory item model;
- source-linked context assembly;
- hexagonal boundaries;
- thin MCP/API interfaces.

### Superpowers

- skills as behavior policies;
- verification and debugging discipline;
- policy-like mandatory skill use.

### Trellis

- session journal;
- update-spec/capture-learnings habit;
- task-specific context manifests.

## Proposed entities

### ChronicleEvent

```text
id
organizationId
projectId nullable
workspaceId nullable
taskId nullable
runId nullable
agentRunId nullable
actorKind: user | agent | system | automation | integration
actorId nullable
eventType
summary
payload json
occurredAt
ingestedAt
correlationId nullable
parentEventId nullable
```

Optional later:

```text
prevHash
hash
policySnapshotId
```

### MemoryItem

```text
id
organizationId
projectId nullable
scope: user | organization | project | workspace | task | agent
kind: preference | convention | decision | warning | summary | fact
content
sourceEventIds json
confidence nullable
status: candidate | active | rejected | superseded | archived
createdBy: user | agent | system
createdAt
updatedAt
expiresAt nullable
```

### PolicyPack

```text
id
organizationId
projectId nullable
name
description
rules json
isDefault
createdAt
updatedAt
archivedAt nullable
```

### PolicySnapshot

```text
id
organizationId
runId nullable
agentRunId nullable
policyPackIds json
resolvedRules json
createdAt
```

### PolicyDecision

```text
id
organizationId
policySnapshotId nullable
runId nullable
agentRunId nullable
actionType: tool | shell | file | git | network | mcp | approval | memory
actionName nullable
resource nullable
decision: allow | deny | ask | approved | rejected
reason
createdBy: user | policy | system | agent
createdAt
payload json
```

## Scope

Phase 06 should:

- record chronicle events for core run lifecycle;
- propose memory candidates from review/run summaries;
- allow user approve/edit/reject memory;
- add advisory policy packs;
- snapshot policy on run start;
- record policy decisions for approvals.

## Non-goals

- No fully automatic memory saving by default.
- No strict enterprise policy enforcement initially.
- No embedding-first memory system.
- No public audit/compliance product claims until hardened.

## Completion criteria

Phase 06 is complete when:

1. meaningful run lifecycle events are recorded;
2. users can view a readable timeline;
3. Superset can propose memory candidates;
4. users can save/edit/reject memories;
5. a run can reference a policy snapshot;
6. approvals/denials can become policy decisions.
