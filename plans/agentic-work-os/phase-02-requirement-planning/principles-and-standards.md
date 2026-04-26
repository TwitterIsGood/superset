# Phase 02 Principles and Standards

## Primary principle

A vague requirement should become a plan before it becomes running code.

## UX standards

### The first view is a shaped plan, not a task explosion

Do not show 17 tasks by default. Show:

- plain-language summary;
- 3-7 major steps;
- affected areas;
- risk;
- recommended execution mode;
- clear buttons.

Example default:

```text
Superset thinks this requires 4 steps.
2 can run in parallel after initial inspection.
Risk: Medium.
[Edit Plan] [Run]
```

### User must control execution

Default planner output should not auto-run agents.

Allowed buttons:

- Edit Plan;
- Approve Plan;
- Create Tasks;
- Run Selected;
- Reject;
- Ask Planner to Revise.

### Questions should be reserved for real ambiguity

Do not ask the user for every missing detail. Planner should make explicit assumptions where safe.

If ambiguity is high-risk, ask.

## Data standards

### Plan must be structured

Store structured plan fields, not only markdown.

Required fields:

- title;
- summary;
- risk;
- affected areas;
- steps;
- validation strategy;
- status;
- version.

### Plan versioning is required

If user edits or planner revises, preserve enough history to know which plan was approved.

Minimum viable:

- increment `version`;
- store approved snapshot.

### Plan approval must be explicit

Approved plan should record:

- who approved;
- when;
- version approved.

### Tasks created from plans must link back

Do not create orphan tasks from a plan.

Minimum relation:

```text
planId -> taskId
planStepId -> taskId
```

## Agent standards

### Planner agent is a role, not a visible burden

Users should not need to choose “Planner Agent” manually in normal flow. Superset can internally route planning to the best configured planner.

### Planner must explore before confident decomposition

For codebase-sensitive requirements, planner should inspect repo context before proposing detailed tasks.

### Planner output should include uncertainty

Plans should include:

- assumptions;
- unknowns;
- risks;
- recommended validation.

## Standards from reference repos

### Superpowers standard

Planning must precede implementation except explicit fast mode.

### Trellis standard

Planning output should be convertible into task/workspace context, not just prose.

### OpenChronicle standard

Planning should be recordable as events later, with provenance.

## Anti-patterns

Avoid:

- direct one-line prompt -> many running agents;
- task spam from weak plans;
- storing only AI markdown;
- hiding assumptions;
- making users hand-draw DAGs;
- building a full workflow builder in Phase 02.

## Review checklist

- [ ] Plan can be approved/rejected explicitly.
- [ ] Plan has structured fields.
- [ ] Plan steps can become linked tasks.
- [ ] UI remains light.
- [ ] Planner assumptions and risks are visible.
- [ ] No default auto-execution from vague prompts.
