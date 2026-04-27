# Phase 00: Foundation, Vocabulary, and Source-of-Truth Map

Status: draft

## Goal

Establish the shared vocabulary, object model, folder/index system, and current-architecture map needed before implementation begins.

This phase is mostly documentation and alignment. It prevents future sessions from inventing contradictory meanings for terms like requirement, plan, task, run, workspace, agent session, review packet, chronicle, memory, and policy.

## Why this phase exists

Superset already has many primitives, but the future Agentic Work OS needs a common model.

Without Phase 00, future sessions may accidentally:

- treat chat plans as product plans;
- treat terminal sessions as agent runs;
- treat tasks as requirements;
- treat workspaces as runs;
- treat memory as raw logs;
- build duplicate orchestration paths.

Phase 00 creates the conceptual map that every later phase uses.

## User-facing value

Indirect but important:

- Superset becomes easier to evolve consistently.
- Future features feel coherent instead of bolted on.
- Product terminology stays light and understandable.

## Internal value

- Defines canonical object names.
- Documents current Superset implementation surfaces.
- Establishes phase folder/index mechanism.
- Records what to learn from Superpowers, Trellis, and OpenChronicle.
- Creates cross-phase standards.

## Deliverables

Already represented by the root docs:

- `README.md`
- `00-documentation-system.md`
- `01-product-vision.md`
- `02-reference-repo-learning.md`
- `03-current-superset-map.md`
- `04-cross-phase-standards.md`
- `05-canonical-contracts.md`

This phase folder adds:

- `principles-and-standards.md`
- `implementation-plan.md`

## Canonical vocabulary

### Requirement / Intake

The original user request or imported external request.

Examples:

- one-line prompt;
- GitHub issue;
- Linear task;
- Slack request;
- automation trigger;
- user-created task that needs planning.

### Plan

A structured proposal for how to satisfy a requirement.

A plan may include:

- summary;
- affected areas;
- tasks;
- dependencies;
- risks;
- validation strategy;
- workspace strategy;
- recommended agents.

### Task

An executable unit of work, often created from a plan step. Existing Superset tasks remain the core user-visible work units.

### Task Graph

The dependency structure among tasks. It determines sequencing and safe parallelism.

### Workspace

A code execution/editing context, usually backed by a git worktree.

### Run

A top-level execution attempt for a requirement or plan.

### Agent Run

One agent doing one scoped job in a workspace, usually linked to a task.

### Review Packet

A human-readable summary of completed work and evidence, prepared before shipping.

### Chronicle Event

A structured event representing what happened in the system.

### Memory

A curated, scoped, source-linked fact/preference/decision learned from work.

### Policy

A rule or rule set governing how agents should plan, execute, ask, verify, or complete work.

## Phase boundaries

Phase 00 does not implement product features. It documents the system and standards.

## Non-goals

- No DB schema changes.
- No UI changes.
- No MCP tools.
- No new agent workflows.
- No migrations.

## Completion criteria

Phase 00 is complete when future sessions can start from this folder and understand:

- what Superset is becoming;
- how this roadmap is organized;
- which current code surfaces matter;
- which external reference patterns matter;
- what standards apply to all phases.
