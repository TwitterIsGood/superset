# Reference Repository Learning

This document records what Superset should learn from three reference repositories:

- `/tmp/superpowers`
- `/tmp/Trellis`
- `/tmp/OpenChronicle-core`

The goal is not to copy them mechanically. The goal is:

```text
Learn the good.
Reject the bad.
Integrate around Superset's user-centered product model.
Avoid shallow wheel reinvention.
```

## Summary mapping

| Reference     | Teaches                            | Superset should use it for                                                 |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Superpowers   | Agent behavior discipline          | Policy packs, planning gates, verification, review loops                   |
| Trellis       | Repo-local task/workspace workflow | Task graph, workspace strategy, context manifests, runner abstraction      |
| OpenChronicle | Durable memory/event architecture  | Chronicle events, memory items, source-linked context, thin MCP/API layers |

## Superpowers: behavior discipline layer

### What it is

Superpowers is a methodology for coding agents. It defines reusable skills and forces agents to use the appropriate process before acting.

Important files:

- `/tmp/superpowers/skills/using-superpowers/SKILL.md`
- `/tmp/superpowers/skills/brainstorming/SKILL.md`
- `/tmp/superpowers/skills/writing-plans/SKILL.md`
- `/tmp/superpowers/skills/subagent-driven-development/SKILL.md`
- `/tmp/superpowers/skills/dispatching-parallel-agents/SKILL.md`
- `/tmp/superpowers/skills/systematic-debugging/SKILL.md`
- `/tmp/superpowers/skills/verification-before-completion/SKILL.md`
- `/tmp/superpowers/skills/requesting-code-review/SKILL.md`
- `/tmp/superpowers/skills/using-git-worktrees/SKILL.md`

### Good ideas to adopt

#### 1. Skill-like policy packs

Superpowers proves that agent behavior can be packaged as reusable procedures:

- brainstorming;
- writing plans;
- executing plans;
- systematic debugging;
- TDD;
- verification;
- code review;
- worktree usage.

Superset should not hide these only in system prompts. It should productize them as policy packs:

```text
Fast Prototype
Normal Implementation
Strict Refactor
Debugging
Security Sensitive
Database Sensitive
Review Only
```

Each policy pack should define:

- when it applies;
- required context;
- allowed actions;
- required verification;
- review checklist;
- completion criteria.

#### 2. Planning before execution

Superpowers enforces design/brainstorming/planning before implementation. Superset should use the same principle for one-line intake.

A one-line request should not immediately spawn agents unless user explicitly chooses a fast/prototype mode.

Default flow:

```text
Requirement -> Planner -> Plan -> User approval -> Execution
```

#### 3. Verification before completion

Agent messages like “done” are not enough.

Superset should require evidence:

- test command;
- exit code;
- output summary;
- diff summary;
- files changed;
- unresolved concerns.

#### 4. Focused subagents

Superpowers avoids giving every subagent the whole world. The controller curates context.

Superset should generate per-run context manifests:

```text
This task goal
Relevant files
Relevant prior decisions
Policy snapshot
Validation commands
Review criteria
```

#### 5. Parallelism only when safe

The Superpowers parallel-agent guidance is important: parallelism must be based on domain independence, not hype.

Superset should only parallelize after checking:

- file overlap;
- dependency graph;
- shared migrations/schema;
- likely merge conflicts;
- required sequencing.

### What to reject or adapt

#### Avoid over-documenting every tiny action

Superpowers plans can become very verbose. Superset should represent many details as structured data, not giant markdown blocks.

#### Avoid vendor-specific assumptions

Superpowers is heavily shaped around Claude Code-style skills. Superset must support multiple agents and runners.

#### Avoid making users read process docs

The process should be encoded in policy and UI. Users should see simple plan/review surfaces.

## Trellis: workflow substrate layer

### What it is

Trellis creates a repo-local workflow structure for tasks, specs, workspaces, context injection, and multi-agent operation.

Important files:

- `/tmp/Trellis/README.md`
- `/tmp/Trellis/.trellis/workflow.md`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/common/tasks.py`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/common/task_store.py`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/common/task_context.py`
- `/tmp/Trellis/packages/cli/src/templates/trellis/worktree.yaml`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/multi_agent/plan.py`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/multi_agent/start.py`
- `/tmp/Trellis/packages/cli/src/templates/trellis/scripts/multi_agent/status_monitor.py`
- `/tmp/Trellis/.claude/hooks/ralph-loop.py`

### Good ideas to adopt

#### 1. Task as workflow state, not static todo

Trellis task data includes:

- branch;
- base branch;
- worktree path;
- current phase;
- next action;
- parent/children;
- related files;
- notes;
- PR URL.

Superset tasks should eventually link to:

- plan step;
- workspace;
- agent runs;
- artifacts;
- verification;
- review packet.

#### 2. Phase-specific context manifests

Trellis uses different context files for implement/check/debug.

Superset should have context bundles per agent run:

```text
planning context
implementation context
debug context
review context
verification context
```

This avoids dumping irrelevant history into every agent.

#### 3. Declarative workspace policy

Trellis `worktree.yaml` shows a useful shape:

- where worktrees live;
- what files to copy;
- setup hooks;
- verification commands.

Superset should model workspace strategy explicitly:

```text
base branch
branch name
worktree path
setup command
copied env/config files
baseline verification
teardown policy
```

#### 4. Completion control loop

Trellis Ralph Loop checks whether agents are actually done and can re-enter correction.

Superset should build a completion controller:

```text
Agent says done
  -> run required verification
  -> if fail, send failure back to agent
  -> cap retries
  -> escalate to user if unresolved
```

#### 5. Multi-platform adapter

Trellis supports many AI tools. Superset already does this through agent definitions and launch requests. Continue that direction.

### What to reject or adapt

#### Avoid file-only source of truth

Trellis stores workflow in repo-local files. Superset should use DB-backed product objects, with optional export/sync later.

#### Avoid script sprawl

Trellis has many Python scripts. Superset should encode workflows as typed services, tRPC routes, MCP tools, and host-service APIs.

#### Avoid exposing too much machinery

Trellis is powerful but process-heavy. Superset should hide DAG/context complexity by default.

## OpenChronicle: chronicle and memory layer

### What it is

OpenChronicle is a durable memory/context system with event logs, conversations, memory items, MCP/API interfaces, and clean architecture.

Important files:

- `/tmp/OpenChronicle-core/docs/architecture/ARCHITECTURE.md`
- `/tmp/OpenChronicle-core/src/openchronicle/core/domain/models/project.py`
- `/tmp/OpenChronicle-core/src/openchronicle/core/domain/models/memory_item.py`
- `/tmp/OpenChronicle-core/src/openchronicle/core/domain/models/conversation.py`
- `/tmp/OpenChronicle-core/src/openchronicle/core/infrastructure/logging/event_logger.py`
- `/tmp/OpenChronicle-core/src/openchronicle/core/application/use_cases/assemble_context.py`
- `/tmp/OpenChronicle-core/src/openchronicle/core/application/use_cases/remember_turn.py`
- `/tmp/OpenChronicle-core/src/openchronicle/interfaces/mcp/server.py`
- `/tmp/OpenChronicle-core/docs/integrations/mcp_server_spec.md`
- `/tmp/OpenChronicle-core/tests/test_hexagonal_boundaries.py`

### Good ideas to adopt

#### 1. Hexagonal architecture boundaries

OpenChronicle separates:

- domain;
- application use cases;
- infrastructure adapters;
- interfaces.

Superset should avoid putting orchestration logic only in React components or MCP handlers.

Target shape:

```text
Domain: Requirement, Plan, TaskGraph, Run, Memory, Policy
Application: GeneratePlan, StartRun, VerifyRun, RecordEvent
Infrastructure: DB, Git, Terminal, Chat, MCP, VCS
Interfaces: Desktop UI, Web, MCP, CLI, API
```

#### 2. Event chronicle

OpenChronicle’s event model includes hash-linked events. Superset does not need hash chaining immediately, but should adopt structured events.

Examples:

```text
requirement.created
plan.generated
plan.approved
task.created
workspace.created
agent_run.started
agent_run.waiting_for_approval
verification.failed
verification.passed
review_packet.generated
memory.proposed
policy.decision_recorded
```

#### 3. Memory with provenance

OpenChronicle memory items include content, tags, pinned status, project/conversation links, source, timestamps.

Superset memory should include:

- scope;
- source event IDs;
- creator;
- confidence;
- status;
- expiry if needed;
- retrieval evidence.

#### 4. Thin MCP/API interfaces

OpenChronicle keeps domain logic out of interface layers. Superset MCP tools should call shared application services, not duplicate business logic.

#### 5. Plugin/handler registry

OpenChronicle’s plugin system uses explicit handler registration and collision detection. Superset can learn this for future:

- planner plugins;
- reviewer plugins;
- memory extractors;
- policy evaluators;
- runner adapters.

### What to reject or adapt

#### Avoid overbuilding memory before work state

Memory should come after runs/events are durable. Otherwise Superset will remember unstructured noise.

#### Avoid generic vector-only memory

Semantic search can come later. First build source-linked structured memory.

#### Avoid premature storage fragmentation

OpenChronicle documents future multi-DB ideas but keeps current storage simple. Superset should do the same.

## Combined model

```text
Superpowers = how agents should behave
Trellis = how work should be organized
OpenChronicle = how work should be remembered and audited
Superset = product-native control plane over all three
```

## Adoption matrix

| Superset need      | Reference pattern                               | How to integrate                             |
| ------------------ | ----------------------------------------------- | -------------------------------------------- |
| One-line intake    | Superpowers brainstorming                       | Planner mode before execution                |
| Plan generation    | Superpowers writing-plans                       | Structured plan entity + markdown view       |
| Task decomposition | Trellis task model                              | Plan steps create linked tasks               |
| Context injection  | Trellis JSONL manifests                         | Context bundle per agent run                 |
| Workspace setup    | Trellis worktree policy                         | Workspace strategy object                    |
| Parallel execution | Superpowers parallel-agent rules                | Dependency/resource-aware scheduling         |
| Completion trust   | Superpowers verification + Trellis Ralph Loop   | Verification evidence and retry loop         |
| Agent adapters     | Trellis CLI adapter                             | Extend existing agent catalog/launch request |
| Chronicle          | OpenChronicle events                            | Structured event table and timeline          |
| Memory             | OpenChronicle memory item                       | Scoped, source-linked memory candidates      |
| Governance         | Superpowers skills + OpenChronicle policy gates | Policy packs, snapshots, decisions           |

## Anti-wheel-reinvention rules

1. Before designing a new agent behavior rule, check whether it maps to a Superpowers skill.
2. Before designing a new task/workspace flow, check whether it maps to a Trellis task/worktree/context pattern.
3. Before designing memory/logging, check whether it maps to an OpenChronicle event/memory/use-case pattern.
4. If adopting a pattern, adapt it to Superset’s existing product primitives rather than copying file structures.
5. If rejecting a pattern, document why it harms lightweight UX, multi-agent support, local/cloud sync, or maintainability.
