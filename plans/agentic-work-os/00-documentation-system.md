# Documentation System and Index Rules

## Why this document exists

This roadmap is intentionally large. The point is not to create one giant unreadable plan, but to create an indexed planning system that lets multiple future sessions work independently without losing the product thesis.

The user explicitly wants:

- every phase to be a folder;
- each phase to contain multiple markdown files;
- a coordinating folder with a main overview;
- an index mechanism similar to a table of contents;
- detailed future direction, principles, constraints, and standards;
- deep learning from Superpowers, Trellis, and OpenChronicle;
- no shallow wheel reinvention.

This file defines how to maintain that system.

## Placement rule

Per `AGENTS.md`, implementation plans belong in:

- `plans/` for cross-cutting work;
- `apps/<app>/plans/` for app-scoped work;
- shipped plans later move to `plans/done/`.

This roadmap is cross-cutting, so it lives in:

```text
plans/agentic-work-os/
```

Do not copy these files into app roots or `src/`.

## Index mechanism

The main index is:

```text
plans/agentic-work-os/README.md
```

Every phase folder must include:

```text
README.md
principles-and-standards.md
implementation-plan.md
```

The phase `README.md` must include:

- phase goal;
- user-facing value;
- internal system value;
- prerequisites;
- deliverables;
- non-goals;
- links to current implementation surfaces.

The phase `principles-and-standards.md` must include:

- UX principles;
- data/API standards;
- agent behavior standards;
- security and safety constraints;
- review checklist;
- anti-patterns.

The phase `implementation-plan.md` must include:

- ordered steps;
- likely files/packages;
- migration strategy;
- test strategy;
- validation commands;
- rollout/feature-flag decision if needed;
- risks and fallback.

## Naming rules

Use semantic folder names, not dates, inside this roadmap:

```text
phase-02-requirement-planning
```

If a future implementation plan needs a dated execution plan, create it under the relevant app or root `plans/` directory and link back to this roadmap.

Example:

```text
apps/desktop/plans/20260427-one-line-intake-mvp.md
```

Then add a link to `phase-02-requirement-planning/implementation-plan.md`.

## Source-of-truth rule

This folder is the strategic source of truth. Code is the implementation source of truth.

If code changes contradict these docs:

1. Trust the code for current behavior.
2. Update the phase docs to reflect the new decision.
3. Keep the main index concise.

## What belongs here

Allowed:

- roadmap structure;
- product principles;
- architecture direction;
- phase boundaries;
- schema/API proposals;
- reference-repo learnings;
- standards and review checklists;
- implementation sequencing.

Not allowed:

- ephemeral task notes;
- logs from one coding session;
- raw terminal output unless needed as evidence;
- marketing copy drafts unless tied to implementation;
- unrelated technical debt lists.

## Future session workflow

For planning sessions:

```text
Read README.md, 01-product-vision.md, and the phase README.
Update docs only if scope/standards changed.
```

For implementation sessions:

```text
Read README.md, 04-cross-phase-standards.md, and the phase implementation-plan.md.
Explore code before editing.
Implement only scoped deliverables.
```

For review sessions:

```text
Read the phase principles-and-standards.md.
Review implementation against its checklist.
```

## Detail standard

Docs should be detailed enough that a future session can work without asking the user to restate the vision. But docs should not become speculative fiction.

Every major proposal should answer:

- What user pain does this solve?
- Which current Superset primitive can it reuse?
- Which reference repo idea does it learn from?
- What should be explicitly avoided?
- What is the smallest useful implementation?
- What is the long-term shape?

## Updating the index

When adding a new phase or major doc:

1. Add it to `README.md`.
2. Add links from relevant phase docs.
3. Update `04-cross-phase-standards.md` only if the change creates a cross-cutting rule.
4. Do not duplicate full content in the root index.
