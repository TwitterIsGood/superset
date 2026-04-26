# Cross-Phase Standards

These standards apply to every phase in the Agentic Work OS roadmap.

## 1. UX standards

### Light surface

Default user-facing flows must stay simple:

```text
Describe -> Plan -> Run -> Review -> Ship
```

Do not expose these by default:

- raw task graph;
- full policy JSON;
- every chronicle event;
- every agent context file;
- terminal scrollback as the primary result;
- memory embeddings or retrieval internals;
- runner-specific launch details.

### Progressive disclosure

Every heavy internal object should have a collapsed default summary and an advanced inspect view.

Examples:

- Plan summary first, DAG second.
- Review packet first, full diff second.
- Risk label first, policy rules second.
- Agent status first, raw logs second.

### Decision-focused UI

Users should mainly answer:

- Is this plan correct?
- Should this risky action be approved?
- Is this review packet acceptable?
- Should this be shipped, fixed, or discarded?

Do not make users manually orchestrate normal internal steps.

## 2. Data model standards

### Structured state over text

Markdown is useful for rendering. It must not be the only source of truth for product objects.

Product entities should have structured fields for:

- status;
- owner/actor;
- timestamps;
- relationships;
- provenance;
- artifacts;
- errors;
- completion evidence.

### Durable IDs

Every object that may be referenced by a future session needs a stable ID:

- requirement/intake;
- plan;
- plan step;
- task;
- workspace;
- run;
- agent run;
- review packet;
- chronicle event;
- memory;
- policy snapshot;
- policy decision.

### Relationship clarity

Avoid vague JSON blobs when the relation is core to the product.

Core relationships should become explicit tables/fields:

- plan -> tasks;
- task -> workspace(s);
- task -> agent runs;
- run -> review packet;
- event -> source object;
- memory -> source event(s);
- policy decision -> policy snapshot.

### Local/cloud split must be explicit

For every new entity, document whether it is:

- cloud only;
- local only;
- host-service local;
- synced/mirrored;
- derived and not persisted.

Do not assume one DB is enough without documenting why.

## 3. Agent behavior standards

### No execution before plan unless explicitly fast mode

Default one-line intake must produce a plan before code execution.

Allowed exceptions:

- user explicitly chooses a direct-run/fast-prototype mode;
- trivial existing task execution;
- automation intentionally configured for direct execution.

### Fresh context per agent run

Every agent run should receive a curated context bundle, not arbitrary prior conversation history.

Bundle should include:

- task/plan goal;
- relevant files or areas;
- policy snapshot;
- validation expectations;
- relevant memory;
- previous failure summary if retrying.

### Evidence before completion

An agent run is not complete because the agent says it is complete.

Completion should include evidence:

- command/test run;
- exit code or clear reason unavailable;
- file/diff summary;
- unresolved risks;
- review result if required.

### Parallelism requires independence

Parallel agent execution requires a documented reason:

- different files/modules;
- no shared migration/schema conflict;
- dependency order satisfied;
- safe merge strategy.

If independence is unknown, run sequentially or use a research/planning step first.

## 4. Review and verification standards

### Review packet required for meaningful code changes

Any non-trivial run should produce a Review Packet containing:

- original requirement;
- approved plan;
- tasks completed;
- files changed;
- tests/commands run;
- tests/commands not run;
- risks;
- open questions;
- suggested PR description.

### Verification commands must be scoped

Prefer targeted validation before broad expensive commands.

Examples:

- relevant unit tests;
- package typecheck;
- lint only touched package;
- full repo validation only when needed.

### Failures are artifacts

Failed tests and commands should be recorded, not hidden. They inform future debugging and memory.

## 5. Chronicle and memory standards

### Chronicle first, memory later

Do not build memory extraction before important events are structured.

Correct order:

```text
agent/run state -> chronicle events -> review packets -> memory candidates -> approved memory
```

### Memory must have provenance

Every memory should link back to source events, runs, or user confirmations.

### Memory must be curated

Do not automatically save every chat summary. Candidate memories should be reviewable and editable.

### Scoping is mandatory

Memory scope should be explicit:

- user;
- organization;
- project;
- workspace;
- task;
- agent/profile.

## 6. Policy standards

### Policy should be versioned/snapshotted

When a run starts, record the policy rules that applied at that time.

### Policy decisions should be auditable

Approvals, denials, asks, overrides, and risky actions should be recorded with reasons.

### Policy is advisory before enforcement

Early phases should use policy to guide prompts and review packets. Strict enforcement should come only after the run/event model is stable.

## 7. MCP/API standards

### Thin interface rule

MCP tools, tRPC routes, CLI commands, and UI actions should call shared application logic where possible.

Do not duplicate orchestration rules in each interface.

### Long operations return operation IDs

Do not block MCP tools on long multi-step workflows. Return a durable operation/run ID and provide status tools.

### Tool outputs must include durable IDs

Every creation tool should return IDs usable by follow-up calls.

## 8. Testing standards

Every phase should include:

- unit tests for pure logic;
- integration tests for schema/API where practical;
- UI tests only for stable user flows;
- manual validation checklist for agent workflows that are hard to automate.

For DB changes:

- never manually edit generated Drizzle migration files;
- modify schema and ask/generate migrations via the documented repo process.

## 9. Anti-patterns

Avoid:

- “just prompt the agent harder” as architecture;
- unstructured chat logs as product state;
- auto-running many agents from a one-line request without plan approval;
- task graph UI as the default view;
- memory as vector-store dumping ground;
- hidden risky actions;
- terminal scrollback as completion evidence;
- reimplementing existing task/workspace/agent primitives;
- designing for 100-agent autonomy before 1-agent work is durable and reviewable.
