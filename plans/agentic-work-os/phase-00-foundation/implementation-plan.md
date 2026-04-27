# Phase 00 Implementation Plan

## Scope

This phase is implemented by creating and maintaining the planning document system. No application code changes are required.

## Steps

### Step 1: Create root roadmap folder

Create:

```text
plans/agentic-work-os/
```

### Step 2: Create root docs

Create:

```text
README.md
00-documentation-system.md
01-product-vision.md
02-reference-repo-learning.md
03-current-superset-map.md
04-cross-phase-standards.md
05-canonical-contracts.md
```

### Step 3: Create phase folders

Create:

```text
phase-00-foundation/
phase-01-run-foundation/
phase-02-requirement-planning/
phase-03-task-graph-workspaces/
phase-04-agent-run-lifecycle/
phase-05-review-verification/
phase-06-chronicle-memory-policy/
phase-07-automation-mcp-surfaces/
```

Each folder must contain:

```text
README.md
principles-and-standards.md
implementation-plan.md
```

### Step 4: Populate current architecture map

Use repository inspection to document current surfaces:

- DB schemas;
- local DB schemas;
- host-service schemas;
- task APIs;
- workspace creation;
- agent launch;
- chat;
- terminal;
- panes;
- MCP;
- automations.

### Step 5: Populate reference learning

Use subagent analysis of:

- `/tmp/superpowers`
- `/tmp/Trellis`
- `/tmp/OpenChronicle-core`

Record:

- what to adopt;
- what to adapt;
- what to reject;
- exact file references;
- mapping to Superset phases.

### Step 6: Validate navigability

Check:

- root README links all phases;
- each phase has three docs;
- phase docs do not contradict root standards;
- all docs live under allowed plan directories.

## Tests / validation

No automated tests required.

Manual validation:

- [ ] Root folder exists.
- [ ] Every phase folder exists.
- [ ] Every phase has `README.md`, `principles-and-standards.md`, `implementation-plan.md`.
- [ ] Root README contains a phase index.
- [ ] Reference learning includes all three external repos.
- [ ] Current Superset map includes exact repo paths.

## Rollout

This phase can land as docs only. It should not require feature flags.

## Risks

### Risk: docs become too abstract

Mitigation: every phase implementation plan must cite concrete code surfaces.

### Risk: docs become too detailed to navigate

Mitigation: root README remains concise; detail lives in phase docs.

### Risk: future sessions skip standards

Mitigation: every implementation prompt should explicitly read phase standards before editing code.
