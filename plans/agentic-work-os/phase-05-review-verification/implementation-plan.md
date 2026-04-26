# Phase 05 Implementation Plan

## Strategy

Build review packet generation from existing run/artifact data first. Add reviewer agents and verification loops incrementally.

## Step 1: Define review and evidence schema

Add or extend:

```text
reviewPackets
verificationEvidence
```

If Phase 01 created placeholder review packets, expand that table.

## Step 2: Collect changed file data

Potential sources:

- host-service git/diff APIs;
- existing review tab/diff plans;
- workspace file system/diff packages;
- git command executed by host-service adapter.

Relevant docs:

- `plans/host-service-diff-plan.md`
- `apps/desktop/plans/20260413-1600-v2-review-tab.md`

## Step 3: Collect verification evidence

Sources:

- terminal command artifacts from AgentRun;
- explicit user-run validation command;
- reviewer/check agent output;
- CI/check results if PR exists.

Start with manually/agent-reported command records, then harden later.

## Step 4: Generate ReviewPacket

Inputs:

- requirement/plan/task;
- AgentRun summaries;
- changed files;
- verification evidence;
- errors/failures;
- user approvals/questions;
- PR/commit links if any.

Output:

```text
summary
changedFiles
testsRun
testsNotRun
risks
openQuestions
suggestedPrTitle
suggestedPrBody
recommendedManualReview
```

## Step 5: UI

Potential placements:

- task detail page;
- workspace review tab;
- run detail pane;
- PR preparation flow.

Default view:

```text
Review Packet
- What changed
- Evidence
- Risks
- Actions
```

Actions:

- Open diff;
- Ask agent to fix;
- Regenerate packet;
- Create PR;
- Mark approved/rejected.

## Step 6: Reviewer/check agent

Use `AgentLaunchRequest` to launch a reviewer agent with scoped context:

- approved plan;
- diff summary;
- changed files;
- verification evidence;
- policy/checklist.

Reviewer output should be structured:

```text
status: pass | needs_changes | blocked
findings
riskLevel
recommendedFixes
```

## Step 7: Verification loop MVP

Inspired by Trellis Ralph Loop:

```text
agent says complete
  -> run required checks if configured
  -> if fail, attach evidence and ask agent to fix
  -> retry up to max count
  -> escalate if still failing
```

Do not enforce globally at first. Enable per policy/task type later.

## Step 8: Tests

Unit tests:

- review packet generation from sample artifacts;
- evidence status aggregation;
- stale packet detection;
- reviewer result parsing.

Integration tests:

- run -> artifact -> review packet;
- failed test evidence appears;
- regenerated packet supersedes old packet or marks old stale.

Manual validation:

1. Run agent on task.
2. Make code changes.
3. Record test command.
4. Generate review packet.
5. Confirm changed files/tests/risks visible.
6. Ask for fix from packet.

## Risks

### Evidence reliability

Mitigation: distinguish verified command records from agent-reported claims.

### Review packet hallucination

Mitigation: ground generation in structured artifacts and include links.

### Too much required process

Mitigation: policy-based strictness later; keep Phase 05 usable for small tasks.
