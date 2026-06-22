# Control Chat Technical Design

## Overview

Control Chat is a global, organization-scoped assistant for operating Superset
itself. It should look and feel like a compact floating chat window, but its
runtime differs from project/workspace chat: it receives a default management
toolset for Automations, Tools & Skills, host routing, and version management.

The implementation should reuse existing chat UI/runtime pieces where they fit,
but it should not pretend to be a workspace pane. The design needs a
cloud-persisted conversation record, a tool execution layer that can route to
cloud or host-service, and versioned resource writes.

## Existing Building Blocks

- Desktop chat UI already has `ChatInterface` and workspace chat pane variants
  with message lists, tool timelines, composer controls, Bypass mode, stop, and
  attachments.
- `packages/chat/server/trpc` already accepts `permissionMode:
  "bypassPermissions"`.
- Cloud tRPC already mounts `automation` and `capability` routers.
- `packages/trpc/src/router/capability` already validates/audits/imports
  `superset.capability.json` zip packages and stores package versions.
- `packages/host-service/src/automation-capabilities/materialize.ts` already
  materializes capability package archives for runtime use.
- `v2Hosts` and `v2UsersHosts` already represent hosts, online state, and host
  access.

## Proposed Architecture

### UI Layer

Add a desktop renderer feature under an authenticated global layout:

- `ControlChatFab` renders the bottom-right entry point.
- `ControlChatWindow` renders the compact floating panel.
- `ControlChatStore` stores local UI preferences only: open/closed, size,
  expanded state, and active local panel state.
- The window uses existing chat presentation components where possible, but
  wraps them with Control Chat-specific data hooks and copy.

The window should be constrained to the main authenticated content area, similar
to Multica's layout strategy. It should not be a native always-on-top OS window.

### Cloud Session Data

Create cloud-backed Control Chat tables:

- `control_chat_sessions`
  - `id`
  - `organizationId`
  - `ownerUserId`
  - `title`
  - `status`
  - `activeRunId`
  - `createdAt`
  - `updatedAt`
  - `lastActiveAt`
- `control_chat_messages`
  - `id`
  - `sessionId`
  - `role`
  - `content`
  - `metadata`
  - `createdAt`
- `control_chat_runs`
  - `id`
  - `sessionId`
  - `status`
  - `startedByUserId`
  - `originHostId`
  - `executionHostId`
  - `modelProviderId`
  - `modelId`
  - `startedAt`
  - `completedAt`
  - `error`
- `control_chat_tool_calls`
  - `id`
  - `runId`
  - `toolName`
  - `targetKind`
  - `targetHostId`
  - `targetWorkspaceId`
  - `input`
  - `output`
  - `status`
  - `startedAt`
  - `completedAt`

Electric collections should include sessions/messages/runs/tool calls if the UI
needs live multi-device updates. A tRPC refetch/invalidation path is acceptable
as an implementation detail, but the schema and API contract should be
cloud-owned and multi-device from day one.

### Runtime And Tool Execution

Add a `controlChat` cloud tRPC router or extend the existing `chat` router with
a distinct mode. Prefer a separate router so permission, tool inventory, and
host routing remain explicit.

Control Chat runtime responsibilities:

1. Create/list/update sessions and messages.
2. Serialize active turns per session.
3. Build the default context block:
   - active organization
   - user identity
   - current route/resource context sent by renderer
   - local machine id
   - available hosts and online state
   - relevant resource summaries for the current page
4. Send the user turn to the model using Bypass mode.
5. Expose management tools.
6. Persist tool calls and assistant responses.

Tool execution should route by target:

- `cloud`: execute in cloud tRPC/service code.
- `host`: execute through the target host-service, using relay routing when the
  selected host is remote.
- `workspace`: resolve the workspace's host and local workspace row, then
  execute through that host-service.

All host-routed calls must check host membership and online availability before
execution. Do not route host-bound work to a different host unless the user asks
for that in chat.

### Management Tool Surface

Automation tools in completion scope:

- `automation.list`
- `automation.get`
- `automation.create`
- `automation.update`
- `automation.pause`
- `automation.resume`
- `automation.run`
- `automation.logs`
- `automation.versions.list`
- `automation.versions.restore`

Capability tools in completion scope:

- `capability.list`
- `capability.get`
- `capability.importPackage`
- `capability.setStatus`
- `capability.delete`
- `capability.versions.list`
- `capability.versions.restore` or `capability.setCurrentVersion`

Builder-capable host/cloud tools:

- `capability.generateSkillPackage`
- `capability.generateCliPackage`
- `capability.packageFiles`
- `capability.validatePackage`
- `capability.runSmokeTest`
- `web.fetch`
- `repo.inspect`

These are part of the complete deliverable. They can be implemented after the
base registry because they depend on packaging, validation, and host routing,
but the invariant is that the assistant uses typed tools, not raw database
writes.

### Versioning Model

Use versioning instead of draft UI or extra confirmations.

Automation versioning should expand from prompt-only versions to full config
versions. A version snapshot should include prompt, schedule, timezone, agent,
model, selected capability bindings, environment/config, status-affecting fields
where appropriate, and metadata:

- `source`: user, assistant, restore, import, system
- `controlChatSessionId`
- `controlChatRunId`
- `summary`
- `previousVersionId`
- `createdByUserId`

Capability packages already have immutable package versions. Add missing
operations to select/restore current versions and capture assistant-generated
metadata. Generated packages should produce normal versioned artifacts.

Resource writes should require a current version/revision precondition. If the
resource changed after the assistant started a turn, the write should fail with
a conflict that the assistant can report or reconcile.

### Multi-Device Synchronization

Cloud data is canonical for Control Chat conversations and resource versions.
Local preferences remain local.

Concurrency rules:

- One active run per Control Chat session.
- A second send from another device while a run is active returns a clear
  conflict or queues only if we explicitly support queued turns.
- Tool results and assistant messages stream or refetch into all devices viewing
  the same session.
- Resource writes are compare-and-swap by version/revision.

### Security And Access

Bypass mode means "do not interrupt the user with per-tool permission prompts",
not "ignore authorization".

Required checks:

- active organization membership for every cloud-owned resource
- owner/access checks matching existing Automation and Capability routers
- host membership for host-routed work
- workspace/project access for workspace-routed work
- no direct renderer DOM operation for persistent configuration changes

### Compatibility And Migration

Complete feature workstreams:

All workstreams below are required before the feature is considered done. They
are ordered by dependency, not by partial product release.

1. Add Control Chat cloud session schema, router skeleton, floating UI, and
   Bypass-mode message loop with read-only context.
2. Add Automation management tools and full automation config versioning.
3. Add Capability management tools and current-version restore.
4. Add generated Skill/CLI package creation from normal chat instructions.

Existing Settings pages continue to use current routers, with refetch/backfill
after Control Chat changes so they reflect remote writes promptly.

## Trade-Offs

- A single organization-level assistant is simpler and more discoverable than
  per-resource chats. It relies on injected page context to stay relevant.
- Skipping draft UI preserves user freedom but raises the importance of version
  history, conflict checks, and clear assistant summaries.
- Reusing chat UI reduces cost, but Control Chat should still have a separate
  data/runtime boundary so workspace chat assumptions do not leak in.
