# Phase 04 Principles and Standards

## Primary principle

Agent work should be observable as work, not only as terminal/chat text.

## UX standards

### Status must be human-readable

Use labels like:

- Running;
- Needs approval;
- Asking a question;
- Verifying;
- Completed;
- Completed with concerns;
- Failed.

Do not expose raw internal enum names as the main UI.

### Show why attention is needed

If waiting:

```text
Claude wants permission to run: bun test apps/desktop
```

If failed:

```text
Failed because terminal launch command exited with code 1.
```

### Preserve links

AgentRun details should link to:

- task;
- plan;
- workspace;
- terminal/chat pane;
- artifacts;
- review packet when available.

## Data standards

### Status transitions should be appendable later

Even if Phase 04 stores only current status, design so Phase 06 can emit chronicle events for transitions.

### Artifacts need type and provenance

Potential artifact fields:

```text
type: prompt | diff | command_result | test_result | permission | summary | error | pr | commit
source
payload
createdAt
```

### Context bundle should be persisted or reproducible

At minimum, record enough to know what prompt/context was used.

## Agent standards

### Waiting states are first-class

Approval, question, and plan response waiting states should not look like generic running.

### User interruption is valid

Cancellation should be explicit and recorded.

### Unknown is better than false completed

If completion cannot be determined, use `unknown` or `exited_unverified` rather than `completed`.

## Integration standards

### Reuse hook events

Do not build another listener if existing agent lifecycle hooks already emit useful events.

### Chat and terminal differ but converge at AgentRun

Keep runner-specific details in artifacts/adapters. Keep high-level status unified.

## Anti-patterns

Avoid:

- parsing terminal output as the only lifecycle source;
- marking success based on process exit alone;
- hiding permission requests in chat logs;
- creating separate run models for each agent kind;
- making automation runs semantically separate forever if they represent the same work.

## Review checklist

- [ ] AgentRun has durable status.
- [ ] Waiting states are visible.
- [ ] Artifacts are typed.
- [ ] Chat/terminal sessions link back.
- [ ] Unknown completion is not mislabeled.
- [ ] UI remains concise.
