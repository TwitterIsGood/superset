# Phase 05 Principles and Standards

## Primary principle

No meaningful work should be called ready without evidence.

## UX standards

### Review packet first, diff second

Users should first see:

- summary;
- risks;
- tests;
- files to inspect;
- suggested action.

Diff and logs should be one click away.

### Be honest about unknowns

If tests were not run, say so plainly.

Example:

```text
Tests not run: agent could not install dependencies in this workspace.
```

### Ask for decisions, not archaeology

User decisions:

- approve;
- ask for fix;
- open diff;
- create PR;
- discard.

Do not make the user reconstruct the run from logs.

## Data standards

### Verification evidence is structured

Every evidence item should record:

- type;
- command if applicable;
- status;
- exit code if applicable;
- summary;
- source agent/run;
- timestamp.

### Review packet is snapshot-like

A review packet summarizes a point in time. If code changes after it, regenerate or mark stale.

### Failed evidence is valuable

Store failures. Do not overwrite them with only the final pass.

## Agent standards

### Reviewer agent is separate from implementer when possible

For risky changes, use separate review/check agent.

### Fix loops must be capped

If reviewer finds issues, implementer can fix, but loops need a max count and escalation.

### Completion requires verification policy

Phase 05 can start advisory, but should prepare for policy-based required checks.

## Reference standards

### Superpowers

Adopt evidence-before-completion and code-review discipline.

### Trellis

Adopt check phase and Ralph Loop idea, but make it product-native.

### OpenChronicle

Every review/verification result should be event-ready.

## Anti-patterns

Avoid:

- hiding failed test attempts;
- pretending process exit means correctness;
- making users read raw logs first;
- allowing agents to self-review only for high-risk changes;
- infinite fix/review loops;
- generating PRs with no risk/test summary.

## Review checklist

- [ ] Review packet includes tests run and not run.
- [ ] Risks are explicit.
- [ ] Changed files are summarized.
- [ ] Evidence has source and timestamp.
- [ ] Failed evidence is retained.
- [ ] User can request fix from packet.
