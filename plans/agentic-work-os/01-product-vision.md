# Product Vision: Lightweight Surface, Heavy Substrate

## One-sentence vision

Superset should become the lightweight workbench where users describe software work and make key decisions, while the system performs heavy planning, orchestration, verification, memory, and governance behind the scenes.

## What users should feel

Users should not feel they are configuring a complex agent workflow engine.

They should feel:

```text
I can tell Superset what I want.
Superset understands the repo enough to shape a plan.
I can approve or edit that plan.
Superset runs the right agents safely.
Superset prepares the result for review.
I decide whether to ship.
```

The surface loop should be:

```text
Describe -> Approve Plan -> Run -> Review -> Ship
```

## What Superset should actually do

Internally, Superset should maintain a rich model:

```text
Requirement
  -> Planning Context
  -> Plan
  -> Task Graph
  -> Workspace Strategy
  -> Agent Run(s)
  -> Verification Evidence
  -> Review Packet
  -> Chronicle Events
  -> Memory Candidates
  -> Policy Decisions
```

The user's mental model remains simple. The system model becomes strong enough for real work.

## Why this matters

Current AI coding workflows fail in real projects because they are often:

- not durable;
- not reviewable;
- not linked to task/workspace state;
- not aware of prior project decisions;
- not structured around verification;
- not safe for parallel execution;
- not explainable after the fact.

Superset already has many primitives for solving this:

- tasks;
- workspaces/worktrees;
- terminal/chat agents;
- panes;
- MCP tools;
- automations;
- host-service execution;
- local/cloud persistence.

The missing layer is the product-level composition of these primitives into a coherent Agentic Work OS.

## Product north star

A user enters:

```text
Make billing onboarding work end-to-end for teams.
```

Superset responds with:

```text
I found this likely touches billing API, subscription state, desktop onboarding UI, tests, and pricing copy.

Suggested plan:
1. Inspect current billing/onboarding flow.
2. Add missing backend subscription transition support.
3. Update desktop onboarding UI.
4. Add tests for free/pro/team edge cases.
5. Prepare review packet and PR description.

Risk: High because this touches billing and account state.
Execution: Research first, then implementation in two coordinated workspaces, then final verification.

[Edit Plan] [Run]
```

The user approves. Superset creates the work state, runs agents, records the process, verifies results, and prepares review.

## What Superset should not become

### Not another coding agent

Superset should orchestrate Claude Code, Codex, Gemini, OpenCode, Superset Chat, and future agents. It should not compete primarily as “the model that writes code.”

### Not a generic workflow builder

Users should not be forced to build DAGs by hand. Superset may have DAGs internally, but default UX should present plain-language plans and progress.

### Not Jira

Tasks in Superset are work units for agent execution and review. They can sync with issue trackers, but the product should not optimize for ceremony.

### Not an IDE replacement

File panes and editors are useful, but the core product is coordination of agentic software work.

### Not a memory landfill

Memory should be curated, scoped, source-linked, and reviewable. Dumping every chat message into a vector store is not acceptable.

## Product principles

### 1. Light by default

Default UI should answer:

- What did I ask for?
- What is the plan?
- What is running?
- What needs my decision?
- What changed?
- Can I ship?

### 2. Heavy when expanded

Advanced users should be able to inspect:

- task graph;
- dependencies;
- workspaces;
- agent prompts/context;
- policy snapshots;
- verification logs;
- chronicle events;
- memory candidates.

### 3. Human-supervised autonomy

Superset should optimize for:

```text
AI does the heavy work.
Superset summarizes the important decisions.
Humans approve plans, risky actions, and shipping.
```

Do not optimize first for full autonomy.

### 4. Structured state over chat transcripts

Chat is an interface. The product state must be structured.

Plans, runs, tasks, reviews, memories, and policy decisions should be product objects, not just message text.

### 5. Reuse before inventing

Learn from:

- Superpowers for behavioral discipline;
- Trellis for task/workspace/context organization;
- OpenChronicle for durable memory/event architecture.

Adopt good patterns, reject over-heavy or mismatched ones, and integrate through Superset’s existing primitives.

## The product arc

### Today

Superset is strong at:

```text
Task/workspace/agent execution primitives
```

### Near future

Superset becomes strong at:

```text
One-line intake -> plan -> tasks -> run
```

### Later

Superset becomes strong at:

```text
Agentic work memory, policy, automation, and review governance
```

### End state

Superset becomes:

```text
The operating layer for AI-native software work.
```
