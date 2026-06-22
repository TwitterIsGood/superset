# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after source edits.
- Run `bun run lint` and focused tests before pushing.
- Run `bun run typecheck` for shared type, router, schema, or package export changes.
- Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.

## Review Checklist

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.

## Scenario: Mobile Workspace Host Control

### 1. Scope / Trigger

- Trigger: mobile needs to start code work or a terminal inside a host-owned
  workspace without importing host-service modules into the mobile bundle.
- Boundary: `packages/trpc/src/router/v2-workspace/v2-workspace.ts` owns the
  cloud tRPC entry points; host execution still happens through relay to
  host-service.

### 2. Signatures

- `v2Workspace.runAgent.mutate({ workspaceId, prompt, agent? })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - `prompt`: non-empty string sent to the host agent.
  - `agent`: non-empty string, default `"superset"`.
  - Response: `{ kind: "terminal" | "chat"; sessionId: string; label: string }`.
- `v2Workspace.listAgents.query({ workspaceId })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - Response:
    `Array<{ id: string; label: string; kind: "chat" | "terminal"; presetId?: string }>`
    with one structured chat runtime prepended using a real/default backend
    label such as `Claude Code`; do not expose `ACP Chat` as an agent name.
    Host `settings.agentConfigs.list` rows are mapped as terminal agents.
- `v2Workspace.listChatModels.query({ workspaceId })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - Response:
    `Array<{ id: string; name: string; provider: string; providerId: string; protocol: string; modelId: string }>`
    after syncing cloud model provider configuration to the host through
    `modelProviders.syncFromCloud`.
- `v2Workspace.sendChatMessage.mutate({ workspaceId, sessionId, content })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - `sessionId`: UUID for a cloud `chat_sessions.id` owned by the caller and
    tied to this workspace.
  - `content`: non-empty text sent to host-service `chat.sendMessage`.
  - `metadata.model`: optional selected chat model id from `listChatModels`.
    This metadata applies only to the structured Chat surface, not terminal
    agents.
  - Response: `{ ok: true }`; clients render subsequent host ACP state through
    `getChatSnapshot`, not from the mutation result.
- `v2Workspace.getChatSnapshot.query({ workspaceId, sessionId })`
  - Returns the host-service `chat.getSnapshot` display state and runtime
    messages for the selected workspace conversation.
- `v2Workspace.createTerminal.mutate({ workspaceId, command?, cwd? })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - `command`: optional non-empty shell command. When omitted, host-service
    creates an interactive shell.
  - `cwd`: optional non-empty host cwd override.
  - Response: `{ terminalId: string; status: "active" }`.
- `v2Workspace.listTerminals.query({ workspaceId })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - Response:
    `{ sessions: Array<{ terminalId: string; workspaceId: string; createdAt: number; exited: boolean; exitCode: number; attached: boolean; title: string | null }> }`.
- `v2Workspace.getTerminalSnapshot.query({ workspaceId, terminalId, maxBytes? })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - `terminalId`: host terminal session id.
  - `maxBytes`: optional positive integer capped at `64 * 1024`.
  - Response: terminal session summary plus `{ outputTail: string; bufferBytes: number }`.
- `v2Workspace.writeTerminalInput.mutate({ workspaceId, terminalId, data })`
  - `workspaceId`: UUID for `v2_workspaces.id`.
  - `terminalId`: host terminal session id.
  - `data`: raw string to write to the PTY, usually including `\n` for command
    submission.
  - Response: `{ success: true }`.

### 3. Contracts

- Both procedures are `protectedProcedure`; mobile calls them with the normal
  Better Auth session cookie through `apiClient`.
- The router must verify:
  - active organization exists,
  - workspace belongs to the active organization,
  - caller is a member of the organization,
  - caller has `v2_users_hosts` access to the workspace host,
  - target host is online before dispatch.
- The router mints a short-lived user JWT with
  `scope: "mobile-workspace-control"` and `organizationIds: [organizationId]`.
- Relay target must use
  `buildHostRoutingKey(workspace.organizationId, workspace.hostId)`.
- Host procedures called through relay:
  - `agents.run` for `runAgent`,
  - `settings.agentConfigs.list` for `listAgents`,
  - `modelProviders.syncFromCloud` and `modelProviders.listChatModels` for
    `listChatModels`,
  - `chat.sendMessage` for `sendChatMessage`,
  - `chat.getSnapshot` for `getChatSnapshot`,
  - `terminal.createSession` for `createTerminal`,
  - `terminal.listSessions` for `listTerminals`,
  - `terminal.getSnapshot` for `getTerminalSnapshot`,
  - `terminal.writeInput` for `writeTerminalInput`.
- Mobile must treat terminal agents and chat models as separate controls:
  structured Chat sends `metadata.model` through `sendChatMessage`; `Claude
  Code`, `Codex`, and other terminal agents send their selected agent id or
  preset id through `runAgent` from the Terminal surface and display model state
  as host-configured.
- Mobile must not convert Terminal output into ACP Chat messages. Terminal
  snapshots update terminal UI state only; Chat/ACP timelines come from
  `chat.getSnapshot` and persisted chat messages.

### 4. Validation & Error Matrix

- No active organization -> `FORBIDDEN`.
- Workspace missing or outside active organization -> `NOT_FOUND`.
- User lacks host access -> `FORBIDDEN`.
- Host missing -> `NOT_FOUND`.
- Host offline -> `PRECONDITION_FAILED`.
- `listAgents` relay failure -> `INTERNAL_SERVER_ERROR` with a workspace-agent
  loading message; mobile may show built-in preset fallbacks but should still
  surface the error.
- `listChatModels` returns no enabled models -> mobile disables structured Chat
  send and shows an explicit no-model state.
- Relay/host-service failure -> `INTERNAL_SERVER_ERROR` with context string,
  without logging or returning JWTs/secrets.

### 5. Good/Base/Bad Cases

- Good: online host, user has host access, prompt is non-empty -> relay returns
  a chat or terminal session result.
- Good: online host with configured model providers -> `listChatModels` returns
  enabled provider models and `sendChatMessage` forwards the selected
  `metadata.model`.
- Good: online host with configured terminal agents -> `listAgents` returns
  the structured Chat runtime plus host agent configs including Claude Code and
  Codex when configured, without labeling the Chat runtime as `ACP Chat`.
- Base: online host, terminal request omits `command` -> host creates an
  interactive shell session.
- Base: terminal agent selected in mobile -> model selector shows Terminal
  config/host agent configuration and does not send Chat model metadata.
- Base: mobile opens the worktree window switcher -> persisted chat sessions
  and `terminal.listSessions` rows can appear together; Web/Changes/Diff/File
  desktop panes must not appear unless a mobile-safe pane sync contract exists.
- Bad: mobile tries to import `@superset/host-service` or host router types
  directly -> reject; cloud router must inline narrow request/response types.
- Bad: mobile hard-codes a single `Codex ACP` agent label or disables terminal
  agent sending only because chat models are unavailable.

### 6. Tests Required

- Router/helper tests should assert host access checks, offline host rejection,
  and relay payload shape for all mobile host-control procedures.
- Router tests should assert `listAgents` calls
  `settings.agentConfigs.list`, prepends the structured Chat runtime with a real
  backend label such as `Claude Code`, and returns only the narrow mobile-safe
  fields.
- Router tests should assert `listChatModels` syncs cloud providers to the host
  before listing models.
- Mobile tests should mock
  `apiClient.v2Workspace.listAgents/listChatModels/sendChatMessage/runAgent/getChatSnapshot/createTerminal/listTerminals/getTerminalSnapshot/writeTerminalInput`
  only at the tRPC boundary, not host-service internals.
- Manual simulator checks should verify the Workspace detail code-work panel
  exposes Agent and Model sheets, selected chat model forwarding, terminal
  agent host configuration state, prompt send, host Terminal list/select/input,
  and terminal fallback states without rendering Terminal output as ACP Chat.

### 7. Wrong vs Correct

#### Wrong

```ts
// Pulls host-only modules into mobile/cloud bundles.
import type { AppRouter } from "@superset/host-service";
```

#### Correct

```ts
type WorkspaceAgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

await relayMutation(
	{ relayUrl, hostId: buildHostRoutingKey(organizationId, workspace.hostId), jwt },
	"agents.run",
	{ workspaceId: workspace.id, agent, prompt },
);
```

#### Wrong

```ts
// Applies a chat model to a terminal agent that is controlled by host config.
await apiClient.v2Workspace.runAgent.mutate({
	workspaceId,
	agent: "claude",
	prompt,
	metadata: { model: selectedChatModelId },
});
```

#### Correct

```ts
await apiClient.v2Workspace.sendChatMessage.mutate({
	workspaceId,
	sessionId,
	content: prompt,
	metadata: { model: selectedChatModelId },
});

await apiClient.v2Workspace.runAgent.mutate({
	workspaceId,
	agent: selectedTerminalAgentId,
	prompt,
});
```

## Examples

- `packages/trpc/src/root.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `packages/trpc/src/router/chat/chat.ts`
