# Canonical Implementation Contracts

This document hardens the roadmap into implementation contracts. It exists because the roadmap is schema-heavy and cross-cutting: if each phase independently chooses persistence, statuses, payload rules, and operation semantics, later phases will not compose.

These contracts are the default unless a future phase explicitly supersedes them and updates this file.

## 1. Persistence matrix

### Principles

1. Cloud is the canonical home for cross-device, MCP, web, mobile, automation, and organization-visible objects.
2. Host-service local storage is canonical only for machine-local runtime facts: physical worktree path, terminal process/session state, local checkout metadata.
3. Desktop local SQLite may mirror or cache cloud objects for local-first UX, but should not silently become a second canonical owner for shared work objects.
4. Derived UI state may remain local if it is not required for audit, resume, MCP, web, mobile, or automation.
5. Offline behavior must be explicit: either queue/sync later, degrade to local-only draft, or require online state.

### Canonical owner table

| Object                  | Canonical owner                                                     | Mirror/cache                                          | Offline behavior                                             | MCP/web/mobile visible                   | Notes                                                |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| Requirement / Intake    | Cloud Postgres                                                      | Optional desktop local draft/cache                    | Local draft allowed; shared run requires sync                | Yes                                      | Root object for one-line or imported work            |
| Plan                    | Cloud Postgres                                                      | Optional desktop local cache                          | Draft may be local; approval requires canonical record       | Yes                                      | Approved plan version must be durable                |
| PlanStep                | Cloud Postgres                                                      | Optional desktop local cache                          | Same as Plan                                                 | Yes                                      | Steps become tasks or graph nodes                    |
| PlanTask link           | Cloud Postgres                                                      | Optional desktop local cache                          | Requires synced task IDs                                     | Yes                                      | Core relation; do not store only in markdown         |
| Task                    | Existing cloud/local task system                                    | Existing local synced mirror                          | Follow existing local-first task rules                       | Yes when synced                          | Do not invent a parallel task system                 |
| TaskDependency          | Cloud Postgres                                                      | Optional desktop local cache                          | Local draft allowed before sync                              | Yes                                      | Needed for task graph and scheduling                 |
| Workspace cloud record  | Cloud `v2Workspaces`                                                | Local/host references                                 | Requires host/cloud coordination                             | Yes                                      | Product-visible workspace identity                   |
| Workspace physical path | Host-service local DB                                               | Desktop runtime/cache                                 | Host-local only                                              | No direct; exposed through host APIs     | Physical filesystem fact                             |
| Run                     | Cloud Postgres                                                      | Optional desktop local cache                          | Local draft may queue sync; shared visibility requires cloud | Yes                                      | Top-level execution attempt                          |
| AgentRun                | Cloud Postgres                                                      | Optional desktop/host cache                           | Local runtime can start draft; sync as soon as possible      | Yes                                      | Semantic work unit; not terminal/chat session        |
| Operation               | Cloud Postgres for external/shared async operations                 | Local ephemeral operation for purely local UI actions | Local-only operation allowed only if not exposed externally  | Yes for external operations              | Stable async API contract                            |
| AgentRunArtifact        | Cloud metadata + local/blob storage depending sensitivity           | Local artifacts for unsafe/raw data                   | Sensitive/raw artifacts may remain local only                | Metadata yes; raw data depends on policy | See payload rules below                              |
| VerificationEvidence    | Cloud Postgres metadata                                             | Optional local raw output                             | Evidence metadata syncs; raw logs may be local/redacted      | Yes                                      | Failed evidence is preserved                         |
| ReviewPacket            | Cloud Postgres                                                      | Optional desktop local cache                          | Draft local allowed; shared review requires cloud            | Yes                                      | Formal object starts in Phase 05                     |
| ChronicleEvent          | Cloud Postgres for product events                                   | Optional local queue/cache                            | Queue locally then sync when possible                        | Yes, filtered                            | Do not store every token/log line                    |
| MemoryItem              | Cloud Postgres                                                      | Optional local cache                                  | Candidate local allowed; active shared memory requires cloud | Yes, scoped                              | Must be curated and source-linked                    |
| MemoryItemSource        | Cloud Postgres                                                      | Optional local cache                                  | Same as MemoryItem                                           | Yes                                      | Join table; avoid JSON-only provenance long-term     |
| PolicyPack              | Cloud Postgres                                                      | Optional local cache                                  | Local built-ins can exist; org/project policies cloud        | Yes                                      | Rules are advisory before enforcement                |
| PolicySnapshot          | Cloud Postgres                                                      | Optional local cache                                  | Snapshot should be created when Run/AgentRun starts          | Yes                                      | Required for auditability                            |
| PolicySnapshotPack      | Cloud Postgres                                                      | Optional local cache                                  | Same as PolicySnapshot                                       | Yes                                      | Join table; avoid JSON-only pack relations long-term |
| PolicyDecision          | Cloud Postgres                                                      | Optional local queue/cache                            | Queue local decisions if offline; sync when possible         | Yes, filtered                            | Approvals/denials/risky actions                      |
| AutomationRun           | Existing cloud automation run table, eventually linked to Run       | Host-service runtime state                            | Requires online/cloud scheduling                             | Yes                                      | `dispatched` is not success                          |
| Pane layout             | Desktop local / existing pane persistence unless made collaborative | N/A                                                   | Local                                                        | Usually no                               | Not audit-critical by default                        |

## 2. Canonical lifecycle enums

These are product-level enums. UI may render friendlier labels.

### RequirementStatus

| Status      | Meaning                                | Terminal? |
| ----------- | -------------------------------------- | --------- |
| `draft`     | Created but not ready for planning     | No        |
| `planning`  | Planner is shaping it                  | No        |
| `planned`   | Plan exists but is not approved        | No        |
| `approved`  | Plan or direct execution path approved | No        |
| `executing` | Work is running                        | No        |
| `completed` | Work completed and reviewed/accepted   | Yes       |
| `failed`    | Could not proceed                      | Yes       |
| `canceled`  | User/system canceled                   | Yes       |

### PlanStatus

| Status               | Meaning                                       | Terminal? |
| -------------------- | --------------------------------------------- | --------- |
| `draft`              | Created or being generated                    | No        |
| `awaiting_approval`  | Ready for user decision                       | No        |
| `approved`           | Approved version is locked for execution      | No        |
| `partially_approved` | Some steps approved; others rejected/deferred | No        |
| `rejected`           | User rejected this version                    | Yes       |
| `executing`          | Approved steps are running                    | No        |
| `completed`          | Plan execution completed                      | Yes       |
| `canceled`           | Plan execution canceled                       | Yes       |
| `superseded`         | Replaced by newer plan/version                | Yes       |

### RunStatus

| Status                    | Meaning                                        | Terminal? | Blocked?             |
| ------------------------- | ---------------------------------------------- | --------- | -------------------- |
| `queued`                  | Created but not started                        | No        | No                   |
| `running`                 | One or more agent runs active                  | No        | No                   |
| `waiting_for_user`        | Cannot continue without user decision          | No        | User-blocked         |
| `waiting_for_dependency`  | Waiting for prerequisite task/run              | No        | Dependency-blocked   |
| `verifying`               | Verification/review is running                 | No        | Verification-blocked |
| `completed`               | Completed with acceptable evidence/review      | Yes       | No                   |
| `completed_with_concerns` | Completed but risks/open questions remain      | Yes       | No                   |
| `failed`                  | Failed and not currently retrying              | Yes       | No                   |
| `canceled`                | User/system canceled                           | Yes       | No                   |
| `timeout`                 | Timed out                                      | Yes       | No                   |
| `unknown`                 | Runtime state cannot be confidently determined | No        | Attention needed     |

### AgentRunStatus

| Status                      | Meaning                                                 | Terminal? | Blocked?             |
| --------------------------- | ------------------------------------------------------- | --------- | -------------------- |
| `queued`                    | Agent run record created                                | No        | No                   |
| `launching`                 | Launch in progress                                      | No        | No                   |
| `running`                   | Agent is active                                         | No        | No                   |
| `waiting_for_approval`      | Agent needs permission/action approval                  | No        | User-blocked         |
| `waiting_for_question`      | Agent asked the user a question                         | No        | User-blocked         |
| `waiting_for_plan_response` | Agent produced a plan needing response                  | No        | User-blocked         |
| `verifying`                 | Verification/review/check loop active                   | No        | Verification-blocked |
| `completed`                 | Completed with sufficient evidence for its scope        | Yes       | No                   |
| `completed_with_concerns`   | Completed but concerns remain                           | Yes       | No                   |
| `exited_unverified`         | Process/session ended but no completion evidence exists | Yes       | No                   |
| `failed`                    | Agent run failed                                        | Yes       | No                   |
| `canceled`                  | User/system canceled                                    | Yes       | No                   |
| `timeout`                   | Timed out                                               | Yes       | No                   |
| `unknown`                   | Runtime state cannot be confidently determined          | No        | Attention needed     |

Do not use `completed_unverified`. Use `exited_unverified`.

### ReviewPacketStatus

| Status          | Meaning                                      | Terminal? |
| --------------- | -------------------------------------------- | --------- |
| `draft`         | Packet exists but is incomplete              | No        |
| `generated`     | Packet generated for current run state       | No        |
| `stale`         | Underlying run/diff changed after generation | No        |
| `needs_changes` | Review found issues                          | No        |
| `approved`      | Human accepted packet/work                   | Yes       |
| `rejected`      | Human rejected packet/work                   | Yes       |
| `superseded`    | Replaced by newer packet                     | Yes       |

### AutomationRunStatus

Existing automation statuses should evolve toward:

| Status             | Meaning                                  | Terminal? |
| ------------------ | ---------------------------------------- | --------- |
| `scheduled`        | Waiting for trigger time/event           | No        |
| `dispatching`      | Dispatching to host/session              | No        |
| `dispatched`       | Dispatch succeeded; not equal to success | No        |
| `running`          | Linked run/agent run active              | No        |
| `waiting_for_user` | Requires approval/input                  | No        |
| `completed`        | Completed with result                    | Yes       |
| `failed`           | Failed                                   | Yes       |
| `canceled`         | Canceled                                 | Yes       |
| `timeout`          | Timed out                                | Yes       |

## 3. Operation model

Operations are the async API contract for long-running external or cross-surface actions.

### Rule

Use `Run` for semantic work. Use `Operation` for API-level asynchronous orchestration.

An operation may create or reference a run, but it is not the same thing.

### Operation fields

```text
id
organizationId
kind: create_plan | run_plan | create_workspace | start_agent_run | generate_review_packet | automation_dispatch | memory_action | policy_action
status: queued | running | waiting_for_user | completed | failed | canceled | timeout
source: desktop | web | mcp | cli | automation | api
sourceRequestId nullable
requirementId nullable
planId nullable
runId nullable
agentRunId nullable
workspaceId nullable
createdByUserId nullable
result json nullable
error json nullable
createdAt
updatedAt
completedAt nullable
```

### Operation rules

- External MCP/API/CLI long operations return `operationId` immediately.
- If the operation creates semantic work, return `runId` too when available.
- Operation status maps to orchestration progress; Run status maps to product work progress.
- Short local UI actions do not need Operation unless they cross async/device/cloud boundaries.

## 4. Artifact and payload handling

### Payload classes

| Class                   | Examples                                        | Cloud sync?                              | Notes                                         |
| ----------------------- | ----------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Safe metadata           | IDs, status, timestamps, file paths, exit codes | Yes                                      | Default allowed                               |
| Review summary          | human-readable summary, risks, tests run        | Yes after redaction                      | Should avoid secrets/raw env                  |
| Raw command output      | terminal logs, stack traces                     | Redacted or local-only                   | May contain secrets                           |
| Prompt/context bundle   | prompts, task context, attachments              | Metadata yes; raw depends on sensitivity | Must run redaction before cloud sync          |
| Attachments             | files/user uploads                              | Depends on source and user intent        | Do not assume safe                            |
| Secrets/env/credentials | tokens, env files, private keys                 | No                                       | Never memory; avoid broad chronicle summaries |
| External payloads       | GitHub/Linear/Sentry/etc payloads               | Minimal fields only                      | Respect source permissions                    |

### Redaction requirements

Before storing broad summaries, chronicle payloads, memory candidates, or cloud-synced raw artifacts:

1. Strip known secret patterns and env values.
2. Avoid storing full `.env`, credentials, tokens, private keys, or auth headers.
3. Prefer references to local artifact IDs over syncing raw sensitive content.
4. Record when content was redacted.
5. Make unsafe/raw artifacts local-only unless user explicitly exports/shares them.

### Size and retention

Initial defaults should be conservative:

- chronicle event payloads: small structured JSON, not raw logs;
- raw artifacts: size-limited and optionally local-only;
- review packets: durable until run/task deletion or retention cleanup;
- memory candidates: expire or archive if not approved;
- user must have a way to delete/archive memory and sensitive artifacts.

### User-visible summary boundary

Audit events may contain internal detail; user-visible summaries should be concise and redacted. Do not assume the same payload can serve both.

## 5. PlannerContextBundle contract

Planner context must be explicit and bounded.

### Required fields

```text
requirementPrompt
projectId
source
linkedTaskIds
linkedIssueUrls
linkedPrUrls
attachmentsMetadata
repoContextSummary
relevantFiles
currentWorkspaceId
currentTasksSummary
knownMemories
policyHints
redactionReport
stalenessReport
budget
```

### Rules

- Planner exploration itself should create an Operation and, when meaningful, an AgentRun or planner-run record.
- Context must cite sources rather than implying global repo knowledge.
- Repo summaries must include staleness information: generatedAt, commit/head if known, scope.
- Attachments are untrusted inputs until scanned/redacted.
- Context budget should be explicit: max files, max bytes/tokens, max attachments, max event/memory items.
- The planner may request additional context instead of reading the whole repo by default.

## 6. Relationship tables for provenance and governance

JSON arrays may be acceptable as a temporary MVP only when explicitly marked temporary. Long-term core relationships should use join tables.

Required long-term relationships:

```text
memoryItemSources(memoryItemId, chronicleEventId, runId nullable, agentRunId nullable)
policySnapshotPacks(policySnapshotId, policyPackId)
chronicleEventLinks(sourceEventId, targetType, targetId, relationType)
planTasks(planId, planStepId, taskId)
runReviewPackets(runId, reviewPacketId)
```

## 7. Migration contract

For DB changes:

1. Modify Drizzle schema files such as `packages/db/src/schema/schema.ts` or local schema files as appropriate.
2. Do not manually edit generated files in `packages/db/drizzle/`.
3. Generate migrations through the repo process:

```text
bunx drizzle-kit generate --name="<sample_name_snake_case>"
```

4. Never run production migrations directly.
5. For production DB-related work, follow `AGENTS.md`: use a Neon branch and confirm before touching production.

## 8. Feature flag contract

Feature flags/settings must define:

- storage location: local setting, org setting, project setting, user setting, or build flag;
- default value;
- rollout scope;
- whether it gates UI only or also API behavior;
- cleanup/removal condition;
- whether DB writes occur when disabled.

Suggested initial flags:

```text
enableAgentRunTracking
enablePlanningIntake
enableTaskGraphExecution
enableReviewPackets
enableChronicleTimeline
enableMemoryCandidates
enableAgenticMcpTools
```

Phase 01 and Phase 02 currently define concrete flag specs. Later suggested flags are reserved names only until their phase implementation plan defines the full contract above.

Before implementing a flag, verify the existing shared config/feature-flag mechanism. If no shared mechanism exists across the relevant desktop/cloud/API surfaces, the phase must either choose a concrete existing storage location or add a preliminary implementation step to create one.

Flags should not become permanent architecture.

## 9. Reference repository durability

The reference repos were analyzed from local tmp clones, but roadmap docs should identify upstream and commit for durability:

| Repo               | Upstream                                 | Analyzed commit                            |
| ------------------ | ---------------------------------------- | ------------------------------------------ |
| Superpowers        | `https://github.com/obra/superpowers`    | `6efe32c9e2dd002d0c394e861e0529675d1ab32e` |
| Trellis            | `https://github.com/mindfold-ai/Trellis` | `b3fe644a0d9a4ae4180cde61d5818d002333465e` |
| OpenChronicle core | `https://github.com/OpenChronicle/core`  | `95202ef6c7a6f04a08a8abe80bd65219c8d8121d` |

Local `/tmp/...` paths are analysis scratch paths, not durable source-of-truth references.
