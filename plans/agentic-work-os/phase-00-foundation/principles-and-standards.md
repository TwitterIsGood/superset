# Phase 00 Principles and Standards

## Primary principle

Do not start building until terms and boundaries are clear.

The Agentic Work OS touches tasks, workspaces, chat, terminal, MCP, automations, panes, DB, and product UX. Ambiguous vocabulary will create architectural drift.

## Vocabulary standards

### Use distinct names for distinct concepts

Do not collapse these terms:

- requirement vs task;
- plan vs task list;
- run vs agent run;
- terminal session vs agent run;
- chat session vs plan;
- workspace vs task;
- chronicle vs memory;
- policy vs prompt.

### Always document current shortcut vs final concept

Example:

```text
Phase 1 may use a task as the intake record, but the long-term concept is Requirement.
```

This prevents temporary implementations from becoming undocumented architecture.

## Documentation standards

### Index-first

Every new strategic doc must be reachable from `plans/agentic-work-os/README.md` or a phase `README.md`.

### No orphan docs

Do not add planning markdown under app roots or `src/`.

### Phase-specific detail belongs in phase folders

Root docs should remain navigational and cross-cutting.

### Avoid duplicated full explanations

If a concept is already deeply described in a root doc, phase docs should link/reference it and then add phase-specific detail.

## Current architecture standards

When a phase touches current code, it must cite likely surfaces from `03-current-superset-map.md`.

Example:

- task API: `packages/trpc/src/router/task/task.ts`
- agent launch: `packages/shared/src/agent-launch.ts`
- desktop orchestrator: `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts`

Do not propose changes to code areas without reading them in the implementation session.

## Reference learning standards

Before inventing a pattern:

1. Check Superpowers for agent behavior/process rules.
2. Check Trellis for task/workspace/context organization.
3. Check OpenChronicle for event/memory/API architecture.
4. Decide: adopt, adapt, or reject.
5. Explain why.

## Review checklist

A Phase 00 update is acceptable if:

- [ ] It keeps the root index accurate.
- [ ] It does not create orphan documents.
- [ ] It distinguishes current Superset behavior from future intent.
- [ ] It keeps product language user-centered.
- [ ] It cites current implementation surfaces when making implementation claims.
- [ ] It does not turn the roadmap into a generic workflow-engine fantasy.
