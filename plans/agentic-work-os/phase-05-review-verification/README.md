# Phase 05: Review and Verification

## Goal

Make Superset prepare human review instead of dumping raw diffs, terminal logs, and chat transcripts on the user.

This phase turns completed agent work into a trustworthy review packet with evidence.

## Why this phase exists

Real users do not trust agent work because they cannot quickly answer:

- What changed?
- Why did it change?
- Did tests run?
- What did not get tested?
- What is risky?
- What should I inspect manually?
- Is this ready to ship?

Superset should answer those questions before asking the user to review.

## User-facing value

After a run, user sees:

```text
Ready for review

Changed 5 files.
Main behavior changed in desktop paywall constants and sidebar gating.
Tests updated and passed.
Risk: low.
Recommended manual review: FeaturePreview copy and task sidebar access.

[Open Diff] [Ask for Fix] [Create PR]
```

## Internal value

Create durable review and verification artifacts:

- ReviewPacket;
- VerificationEvidence;
- reviewer agent result;
- test/command records;
- risk summary;
- PR description draft.

## Current primitives to reuse

- Phase 01/04 Run and AgentRun;
- host-service diff/PR surfaces;
- terminal/chat artifacts;
- desktop review tab plans;
- automation run dispatch records.

Relevant files/plans:

- `apps/desktop/plans/20260413-1600-v2-review-tab.md`
- `plans/host-service-diff-plan.md`
- `packages/host-service/src/db/schema.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `packages/host-service/src/trpc/router/chat/chat.ts`
- `packages/shared/src/agent-launch.ts`

## Reference ideas to reuse

### Superpowers

- verification before completion;
- requesting code review;
- systematic debugging;
- TDD discipline where appropriate.

### Trellis

- check phase;
- Ralph Loop completion control;
- session summaries with testing/status/next steps.

### OpenChronicle

- review and verification should become events later;
- artifacts should be source-linked.

## Proposed entities

### ReviewPacket

```text
id
organizationId
runId
taskId nullable
planId nullable
status: draft | generated | needs_changes | approved | rejected
summary
changedFiles json
testsRun json
testsNotRun json
risks json
openQuestions json
recommendedReviewFiles json
suggestedPrTitle nullable
suggestedPrBody nullable
createdAt
updatedAt
```

### VerificationEvidence

```text
id
organizationId
runId
agentRunId nullable
type: test | typecheck | lint | build | manual | reviewer_agent | ci | unknown
command nullable
status: passed | failed | skipped | unknown
exitCode nullable
summary
rawArtifactId nullable
createdAt
```

## Scope

Phase 05 should:

- collect test/command evidence;
- generate review packets;
- make reviewer/check agent optional but supported;
- avoid pretending unverified work is complete;
- integrate with PR creation later if available.

## Non-goals

- No full policy engine.
- No automatic merge.
- No memory extraction beyond possible candidates.
- No strict TDD enforcement for all tasks.

## Completion criteria

Phase 05 is complete when a non-trivial AgentRun can produce a ReviewPacket that includes:

- goal;
- changed files;
- test/verification evidence;
- risks;
- open questions;
- recommended next action.
