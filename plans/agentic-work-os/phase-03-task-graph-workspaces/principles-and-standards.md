# Phase 03 Principles and Standards

## Primary principle

Parallelism is a consequence of dependency and conflict analysis, not a button.

## UX standards

### Hide graph by default

Default view:

```text
2 tasks can run now.
1 task waits for implementation.
1 final validation runs last.
```

Advanced view:

- dependency graph;
- workspace allocation;
- resource conflicts;
- reasoning.

### Explain workspace strategy briefly

Example:

```text
Recommended 2 workspaces because UI copy and test updates touch different files.
Final validation waits for both.
```

### Allow manual override

Users should be able to:

- merge tasks;
- split tasks;
- force sequential execution;
- force same workspace;
- skip a task;
- run only selected tasks.

## Data standards

### Dependencies must be explicit

Do not encode dependencies only in task descriptions.

### Workspace allocation must have a reason

Every automatic allocation should store a reason:

- independent files;
- risky shared file;
- migration requires sequence;
- validation task waits for all.

### Graph should tolerate unknowns

If Superset is unsure, store uncertainty and choose safer execution.

## Agent standards

### Research can precede graph finalization

If the requirement is broad, a research/planner agent may first inspect the repo and refine graph edges.

### Implementation agents receive scoped tasks

Do not give every implementer the entire plan unless necessary.

### Review/validation tasks should be graph nodes

Validation is real work. Model it instead of treating it as a footnote.

## Workspace standards

### Prefer isolated workspaces for uncertain changes

If tasks may conflict but need exploration, isolate.

### Prefer shared workspace for tightly coupled edits

If backend and UI changes must be integrated constantly, a shared workspace may be safer.

### Baseline branch must be clear

Every workspace should know:

- base branch;
- source workspace if branching from another;
- branch naming rationale.

## Anti-patterns

Avoid:

- flat generated task lists with no dependencies;
- always one workspace per task;
- always one workspace per plan;
- parallelizing migrations/schema changes blindly;
- exposing a scary DAG as the primary UX;
- treating validation as optional.

## Review checklist

- [ ] Dependencies are stored structurally.
- [ ] Workspace strategy is explicit.
- [ ] Parallel groups have independence rationale.
- [ ] Blocked tasks do not run early.
- [ ] User can override strategy.
- [ ] UI remains readable.
