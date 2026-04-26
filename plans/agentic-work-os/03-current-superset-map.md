# Current Superset Architecture Map

This document maps current Superset primitives that the Agentic Work OS roadmap should reuse.

## High-level state

Superset already has many low-level primitives:

- cloud tasks and task statuses;
- local-first desktop task mirrors;
- V2 projects/hosts/workspaces;
- host-service local workspace/terminal storage;
- desktop workspace/worktree creation;
- agent launch abstractions;
- terminal and chat runtimes;
- pane layout engine;
- MCP tools;
- automations;
- marketing/product direction around parallel agents and worktrees.

The core gap is composition:

```text
There is no first-class, durable pipeline for:
one-line requirement -> plan -> task graph -> workspace strategy -> agent runs -> review -> chronicle/memory/policy.
```

## Repo rules

Primary guide:

- `AGENTS.md`

Important planning rule:

```text
Implementation plans go in plans/ or apps/<app>/plans/.
Architecture/reference docs go in <app>/docs/.
Never drop *_PLAN.md at app root or inside src/.
```

Desktop-specific guide:

- `apps/desktop/AGENTS.md`

Important desktop rule:

- Electron IPC should use tRPC in `apps/desktop/src/lib/trpc`.
- `trpc-electron` subscriptions must use observables.

## Cloud DB surfaces

Primary file:

- `packages/db/src/schema/schema.ts`

Important tables:

- `taskStatuses`
- `tasks`
- `devicePresence`
- `agentCommands`
- `v2Projects`
- `v2Hosts`
- `v2Clients`
- `v2UsersHosts`
- `v2Workspaces`
- `chatSessions`
- `automations`
- `automationRuns`

### Current task strengths

Tasks already have:

- title;
- description;
- slug;
- status;
- priority;
- org;
- assignee/creator;
- labels;
- branch;
- PR URL;
- external provider sync;
- started/completed timestamps.

### Current task gaps

Tasks do not yet have first-class links to:

- requirement/intake;
- plan;
- plan step;
- dependency graph;
- workspace;
- agent run;
- verification;
- review packet;
- chronicle events.

## Local DB surfaces

Primary file:

- `packages/local-db/src/schema/schema.ts`

Important local tables:

- `projects`
- `worktrees`
- `workspaces`
- `workspaceSections`
- `settings`
- local/synced `taskStatuses`
- local/synced `tasks`

Important local fields:

- `projects.mainRepoPath`
- `projects.worktreeBaseDir`
- `worktrees.path`
- `worktrees.branch`
- `worktrees.baseBranch`
- `worktrees.createdBySuperset`
- `workspaces.type`
- `workspaces.worktreeId`
- `workspaces.deletingAt`

### Local DB implication

Any new plan/run/task graph model must decide whether it is:

1. cloud-first;
2. local-first;
3. dual/synced;
4. initially derived from existing local/cloud data without new persistence.

Do not casually add cloud schema only if the desktop MVP must work offline/local-first.

## Host-service local DB surfaces

Primary file:

- `packages/host-service/src/db/schema.ts`

Important tables:

- `terminalSessions`
- `projects`
- `pullRequests`
- `workspaces`

Host-service workspaces persist:

- local worktree path;
- branch;
- head SHA;
- upstream metadata;
- PR link.

This is the current best host-local source for physical workspace state.

## Task APIs and UI

Cloud task router:

- `packages/trpc/src/router/task/task.ts`
- `packages/trpc/src/router/task/schema.ts`

Desktop task creation UI:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx`

Run-in-workspace UI:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopover/RunInWorkspacePopover.tsx`

Important current composition:

```text
selected tasks -> create workspaces -> build AgentLaunchRequest -> launch agent session
```

This is the closest existing implementation to future plan-generated execution.

## Workspace/worktree creation

Desktop local workspace router:

- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts`
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts`
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/generate-branch-name.ts`

Host-service V2 workspace creation:

- `packages/host-service/src/trpc/router/workspace-creation/procedures/create.ts`
- `packages/host-service/src/trpc/router/workspace-creation/schemas.ts`

Cloud V2 workspace router:

- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`

Shared workspace naming helpers:

- `packages/shared/src/workspace-launch/workspace-naming.ts`
- `packages/shared/src/workspace-launch/branch.ts`
- `packages/shared/src/workspace-launch/slug.ts`

Important current capability:

```text
composer prompt -> workspace/branch naming -> worktree creation -> optional setup terminal
```

Current gap:

```text
composer prompt does not become a durable requirement/plan/task graph by default.
```

## One-line intake surfaces

Desktop closest current UX:

- `apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/DashboardNewWorkspaceModal.tsx`

These support:

- free-text prompt;
- project selection;
- attachments;
- linked GitHub issue/PR;
- agent selection;
- workspace creation;
- optional launch.

Current gap:

- intake is workspace/session-oriented, not requirement/plan-oriented.

## Agent launch surfaces

Canonical shared launch type:

- `packages/shared/src/agent-launch.ts`

Related helpers:

- `packages/shared/src/agent-command.ts`
- `packages/shared/src/agent-settings.ts`
- `packages/shared/src/agent-launch-request.ts`
- `packages/shared/src/agent-prompt-template.ts`
- `packages/shared/src/agent-catalog.ts`

Renderer orchestrator:

- `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/terminal-adapter.ts`
- `apps/desktop/src/renderer/lib/agent-session-orchestrator/adapters/chat-adapter.ts`

Current strengths:

- discriminates terminal/chat launches;
- supports pane targeting;
- supports task prompt files;
- writes attachments;
- idempotency by workspace/request;
- analytics event on launch;
- pending launch queue.

Current gaps:

- no durable plan/run grouping;
- no completed/canceled/result lifecycle;
- no artifact/review linkage;
- no full multi-agent saga.

## Chat surfaces

Host-service chat router:

- `packages/host-service/src/trpc/router/chat/chat.ts`

Notable capabilities:

- `sendMessage`
- `restartFromMessage`
- `stop`
- `respondToApproval`
- `respondToQuestion`
- `respondToPlan`
- `getSlashCommands`
- `getMcpOverview`

Plan UI component:

- `packages/ui/src/components/ai-elements/plan.tsx`

Current implication:

Superset already has a concept of chat plans and plan approval in runtime shape. It does not yet have durable product-level plans.

## Terminal surfaces

Host-service terminal router:

- `packages/host-service/src/trpc/router/terminal/terminal.ts`

Desktop terminal surfaces:

- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
- `apps/desktop/src/main/terminal-host/terminal-host.ts`
- `apps/desktop/src/main/terminal-host/session.ts`
- `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`

Current gap:

Terminal session lifecycle is not the same as agent work success. Future `agent_runs` must bridge this gap.

## Pane surfaces

Shared pane package:

- `packages/panes/src/types.ts`
- `packages/panes/src/core/store/store.ts`
- `packages/panes/src/react/components/Workspace/Workspace.tsx`

V2 workspace pane registry includes terminal/chat/browser/file/diff-like panes under:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/`

Future pane candidates:

- Requirement pane;
- Plan pane;
- Task graph pane;
- Agent run pane;
- Review packet pane;
- Chronicle pane;
- Memory pane;
- Policy pane.

Do not add all at once. Use phase rollout.

## MCP surfaces

MCP server:

- `packages/mcp/src/server.ts`
- `packages/mcp/src/tools/index.ts`

Existing tool groups:

- tasks;
- members/statuses;
- devices;
- projects/workspaces;
- start agent sessions.

Important tools:

- `packages/mcp/src/tools/tasks/create-task/create-task.ts`
- `packages/mcp/src/tools/tasks/list-tasks/list-tasks.ts`
- `packages/mcp/src/tools/devices/create-workspace/create-workspace.ts`
- `packages/mcp/src/tools/devices/start-agent-session/shared.ts`
- `packages/mcp/src/tools/utils/utils.ts`

Desktop command watcher:

- `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/useCommandWatcher.ts`

Current gap:

No MCP tools for:

- create intake;
- generate plan;
- approve/reject plan;
- create tasks from plan;
- run plan;
- get run status;
- get review packet;
- propose memory.

## Automations

Existing plan:

- `plans/20260417-automations.md`

Automation router:

- `packages/trpc/src/router/automation/automation.ts`
- `packages/trpc/src/router/automation/schema.ts`
- `packages/trpc/src/router/automation/dispatch.ts`

Automation API routes:

- `apps/api/src/app/api/automations/evaluate/route.ts`
- `apps/api/src/app/api/automations/dispatch/[id]/route.ts`

Current strength:

- cloud scheduling with RRule;
- relay to host-service;
- chat/terminal dispatch;
- workspace creation if needed.

Current gap:

- automation runs stop around dispatch;
- no completion/result/artifact loop;
- no plan/task graph integration.

## Key design decisions still needed

1. Should `Requirement` be persisted immediately or can Phase 1 use a task/chat/workspace as the intake record?
2. Should `Plan` be cloud-first, local-first, or runtime-only first?
3. Are `agent_runs` separate from `automation_runs`, or does one generalize the other?
4. What is the minimal Review Packet object?
5. Should chronicle events be cloud, local, or both first?
6. How does Superset avoid making task UI feel like Jira?
7. Which agent is the default planner, and is planner a role or a mode?

These are answered progressively in the phase docs.
