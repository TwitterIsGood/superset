# Agentic Work OS Roadmap

## Purpose

This folder is the source-of-truth planning system for evolving Superset from a multi-agent/workspace manager into a lightweight user-facing, heavy-internally engineered **Agentic Work OS**.

The product thesis:

> Users should feel Superset is light: describe work, approve a plan, watch progress, review results, ship. Internally Superset should be heavy: requirement intake, structured plans, task graphs, workspace strategy, agent runs, verification, chronicle, memory, policy, automation, and review packets.

This roadmap turns the previous product exploration into implementation-ready planning documents that future sessions can work from independently.

## Core user promise

```text
Describe what you want
  -> Superset shapes it into a plan when planning is warranted
  -> You approve, edit, partially approve, or choose a lighter path
  -> Superset runs the right agents in the right workspaces
  -> Superset verifies and prepares review
  -> You ship, pause, resume, cancel, or ask for fixes
```

This is not a one-way happy-path pipeline. It is a resumable work loop. Requirements can be clarified, plans can be revised, tasks can partially succeed, agents can block, users can interrupt, verification can fail, and runs can re-enter planning or fixing.

## Internal system promise

```text
Requirement
  -> Plan
  -> Task Graph
  -> Workspace Strategy
  -> Agent Runs
  -> Review + Verification
  -> Chronicle Events
  -> Memory Candidates
  -> Policy Decisions
```

The internal model exists to support resume, audit, verification, coordination, and trust. Do not add internal complexity merely for modeling completeness.

## Directory structure

```text
plans/agentic-work-os/
├── README.md
├── 00-documentation-system.md
├── 01-product-vision.md
├── 02-reference-repo-learning.md
├── 03-current-superset-map.md
├── 04-cross-phase-standards.md
├── phase-00-foundation/
├── phase-01-run-foundation/
├── phase-02-requirement-planning/
├── phase-03-task-graph-workspaces/
├── phase-04-agent-run-lifecycle/
├── phase-05-review-verification/
├── phase-06-chronicle-memory-policy/
└── phase-07-automation-mcp-surfaces/
```

Each phase folder contains:

- `README.md` — what this phase does, why it exists, scope, non-goals, deliverables.
- `principles-and-standards.md` — constraints, quality bar, UX rules, schema/API standards, anti-patterns.
- `implementation-plan.md` — concrete implementation sequence, likely files, migration strategy, tests, validation.

## How to use these docs

### For future Claude/Superset sessions

Start with:

1. `README.md`
2. `01-product-vision.md`
3. The phase folder for the work you are about to do
4. `04-cross-phase-standards.md`
5. `03-current-superset-map.md` when touching current code
6. `02-reference-repo-learning.md` when unsure whether to invent a new pattern

### For implementation sessions

Deliver one phase at a time, but design the underlying schema/API with the smallest stable extension points needed by later phases. Do not ship later-phase user features early unless the phase docs explicitly say so.

Recommended prompt pattern:

```text
Read plans/agentic-work-os/README.md and plans/agentic-work-os/phase-XX-*/README.md.
Then implement only the scoped deliverables from phase XX.
Preserve minimal extension points for later phases when the phase docs call them out.
Do not expand user-facing scope beyond the phase standards.
```

### Roadmap status and update rules

Each phase should maintain a status in its phase `README.md` once implementation begins:

```text
Status: draft | active | implemented | superseded
```

Rules:

- `draft` means the phase is planned but not being implemented.
- `active` means implementation is underway.
- `implemented` means the phase has shipped or the main deliverables are complete.
- `superseded` means a later decision replaced the phase plan.

When implementation changes current behavior, update `03-current-superset-map.md` or the relevant phase README. If code and docs conflict, trust the code for current behavior and update the docs.

### For review sessions

Use the phase `principles-and-standards.md` as the review checklist.

### For architecture sessions

Use:

- `02-reference-repo-learning.md`
- `03-current-superset-map.md`
- `04-cross-phase-standards.md`

## Phase index

| Phase | Goal                            | User-facing effect                                | Internal system change                             |
| ----- | ------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| 00    | Foundation and vocabulary       | Team shares one mental model                      | Terms, objects, indexing, source-of-truth docs     |
| 01    | Run foundation                  | A task/work request has durable execution state   | Requirement/Run/AgentRun/ReviewPacket skeleton     |
| 02    | Requirement planning            | One sentence becomes an editable plan             | Planner output, plan approval, plan persistence    |
| 03    | Task graph + workspace strategy | Superset decides what can run in parallel         | Dependencies, workspace allocation, conflict rules |
| 04    | Agent run lifecycle             | Users can see what agents are doing/did           | Durable agent run state, artifacts, completion     |
| 05    | Review + verification           | Users review prepared packets, not raw chaos      | Evidence, test records, reviewer agents, packets   |
| 06    | Chronicle + memory + policy     | Superset remembers and governs work               | Events, memories, policy snapshots/decisions       |
| 07    | Automation + MCP surfaces       | External agents and schedules use the same system | MCP/CLI/API tools, operation IDs, automation flows |

## Core design principle

> Less is more at the surface; more is more in the substrate.

Do not expose internal machinery by default. Build it so Superset can be trusted, audited, resumed, and scaled, but present users only with high-value decisions.

Internal heaviness is justified only when it directly improves at least one of:

- resumability;
- auditability;
- verification;
- coordination;
- safety;
- review quality;
- future context quality.

## Autonomy levels

Not every request deserves the same amount of process. Superset should choose the lightest safe path.

| Level        | Example                                    | Default behavior                                   |
| ------------ | ------------------------------------------ | -------------------------------------------------- |
| Low risk     | typo, copy change, run a test              | direct run or compact confirmation                 |
| Medium risk  | localized feature/change with tests        | compact plan approval                              |
| High risk    | billing, auth, database, broad refactor    | explicit plan approval + verification requirements |
| Shared/risky | destructive git, external service, secrets | explicit confirmation and policy decision          |

Planning is the default for meaningful work, not a tax on trivial actions.

## Minimum vertical slice

The first product-validating slice should prove the whole loop in small form:

```text
one user request
  -> persisted run
  -> approved lightweight plan
  -> one workspace agent run
  -> verification record
  -> review packet
```

This prevents the roadmap from spending too long on horizontal foundations without producing an experience users can feel.

## Success and failure signals

Success signals:

- a user can trace requirement -> plan -> task/workspace -> agent run -> review packet;
- review packets reduce the need to inspect raw terminal/chat logs;
- agent runs can be paused/resumed/canceled or at least explained after interruption;
- low-risk work stays lightweight;
- high-risk work becomes safer and more reviewable;
- memory/policy improves future context without becoming noise.

Failure signals:

- Superset starts feeling like Jira;
- users must manage DAGs or agent internals by default;
- automation creates low-quality task spam;
- memory/policy becomes an opaque black box;
- terminal scrollback remains the only reliable truth;
- internal objects multiply without improving trust, review, resume, or safety.

## Cross-cutting safety and privacy

Every phase must treat these as first-class concerns:

- destructive actions require explicit gates;
- external service actions require explicit gates;
- secrets, env values, credentials, and private tokens must not be written into memory or broad chronicle summaries;
- workspace isolation boundaries must be clear;
- audit events and user-visible summaries are related but not identical;
- agent permissions should become policy decisions when approval/denial matters.

## Automation boundary

Superset should support opinionated operations and recipes, not default to an arbitrary workflow-builder UI. Automation should reuse the same plan/run/review/chronicle primitives while keeping default UX simple.

## Reference repo boundary

Superpowers, Trellis, and OpenChronicle are pattern references, not implementation authorities. Use them to check whether Superset is reinventing a known good pattern, but do not let reference research block a clear Superset-native implementation. Every borrowed pattern should be explicitly adopted, adapted, or rejected.

## What this roadmap is not

This is not a marketing roadmap, not a rewrite plan, and not a request to replace current Superset primitives. It is an additive architecture plan that reuses current strengths:

- tasks and statuses
- V2 workspaces/worktrees
- agent launch abstraction
- panes
- chat/terminal runtimes
- MCP tools
- automations
- local/cloud DB split

## Non-negotiables

1. Do not make Superset feel like Jira.
2. Do not make Superset feel like a complex workflow builder by default.
3. Do not build agent swarms before work state is durable.
4. Do not treat memory as an unreviewed chat-log dump.
5. Do not let agent terminal output be the only source of truth.
6. Do not hide risk from users; summarize it clearly.
7. Do not reinvent good ideas from Superpowers, Trellis, and OpenChronicle without first mapping what should be learned, adapted, or rejected.
