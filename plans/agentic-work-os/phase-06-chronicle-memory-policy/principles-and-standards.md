# Phase 06 Principles and Standards

## Primary principle

Remember selectively, record structurally, govern transparently.

## UX standards

### Timeline, not event database

Users should see a readable timeline:

```text
10:03 Plan approved
10:04 Workspace created
10:05 Claude started
10:08 Permission approved
10:12 Tests failed
10:20 Fix applied
10:25 Review packet generated
```

Advanced views may show raw event payloads.

### Memory requires user trust

Default memory flow:

```text
candidate -> user edits/approves -> active
```

Do not silently save broad memories.

### Policy should explain itself

If policy affects a run, show concise reason:

```text
Strict mode because task touches database schema.
```

## Chronicle standards

### Events are append-only by default

Prefer appending correction events over mutating history.

### Events should be typed

Use stable event types:

```text
requirement.created
plan.generated
plan.approved
task.created
workspace.created
agent_run.started
agent_run.waiting_for_approval
agent_run.completed
verification.failed
review_packet.generated
memory.proposed
policy.decision_recorded
```

### Events need correlation

Related events should share `correlationId` or run IDs.

## Memory standards

### Memory must be scoped

A project convention should not become a user-global preference unless explicitly intended.

### Memory must be source-linked

Every memory should reference source events/runs/user actions.

### Memory must be editable

Users should be able to correct memory before saving.

### Memory should expire when appropriate

Some facts are temporary. Support `expiresAt` eventually.

## Policy standards

### Policy packs are advisory first

Start by guiding prompts, checklists, and review packets.

Do not block actions broadly until false positives are understood.

### Snapshot policy per run

A run should know which policy rules applied when it started.

### Record decisions

Approvals, denials, and overrides should be recorded.

## Reference standards

### OpenChronicle

Adopt structured event and memory provenance.

### Superpowers

Convert behavioral skills into policy pack concepts.

### Trellis

Capture session learnings, but avoid repo-file-only source of truth.

## Anti-patterns

Avoid:

- saving all chat logs as memory;
- using embeddings without provenance;
- making policy invisible prompt text;
- mutating event history silently;
- showing raw events as the default UX;
- enforcing strict policy before advisory mode proves useful.

## Review checklist

- [ ] Events are typed and linked.
- [ ] Timeline is readable.
- [ ] Memory has scope and source.
- [ ] Candidate memory requires approval.
- [ ] Policy snapshots are recorded.
- [ ] Policy decisions are auditable.
