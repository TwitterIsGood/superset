# Control Chat Management Tools

## Scenario: Control Chat for Automations and Capabilities

### 1. Scope / Trigger

- Trigger: changing Control Chat, Automation management, Capability package
  management, or any DB/API contract used by the floating management assistant.
- Control Chat is organization-scoped software control, not workspace/project
  chat. It may include current page/resource context, but persistent management
  actions must go through typed cloud tools.
- This scenario crosses PostgreSQL schema, cloud tRPC, Automation dispatch,
  Capability artifact storage/audit, and desktop renderer state.

### 2. Signatures

- Router mount: `packages/trpc/src/root.ts` exposes `controlChat`.
- Router domain: `packages/trpc/src/router/control-chat/`.
- Tool executor:
  `executeControlChatTool(name: ControlChatToolName, rawInput, ctx)`.
- Tool context fields:
  `organizationId`, `userId`, `sessionId`, `runId`, `sourceInstruction`.
- Control Chat DB tables:
  `control_chat_sessions`, `control_chat_messages`, `control_chat_runs`,
  `control_chat_tool_calls`.
- Automation config version table:
  `automation_config_versions`.
- Capability version metadata fields:
  `capability_package_versions.control_chat_session_id`,
  `control_chat_run_id`, `source_instruction`, `source_summary`.
- Automation tools:
  `automation.list`, `automation.get`, `automation.create`,
  `automation.update`, `automation.pause`, `automation.resume`,
  `automation.run`, `automation.logs`, `automation.versions.list`,
  `automation.versions.restore`.
- Capability tools:
  `capability.list`, `capability.get`, `capability.importPackage`,
  `capability.setStatus`, `capability.delete`,
  `capability.versions.list`, `capability.versions.restore`,
  `capability.generateSkillPackage`, `capability.generateCliPackage`.

### 3. Contracts

- Control Chat sends default to `permissionMode = "bypassPermissions"`.
  Bypass mode means no extra per-tool confirmation cards; it does not bypass
  organization membership, host membership, package audit, or resource access.
- One Control Chat session may have only one active run. A second send must fail
  with a stable conflict instead of silently interleaving writes.
- Tool inputs are validated through `controlChatToolSchemas`. Do not pass raw
  model JSON directly to service functions without schema parsing.
- Automation writes from Control Chat must create
  `automation_config_versions` snapshots. Snapshots include prompt, schedule,
  timezone, agent/model settings, host/project/workspace ids, enabled state,
  MCP scope, next run time, and capability bindings.
- `automation.update` must honor `expectedUpdatedAt` when provided. Stale values
  return `CONFLICT` and must not overwrite newer configuration.
- `automation.versions.restore` restores the full config snapshot and then
  records a new restore version linked to the Control Chat session/run.
- Capability import/generation must use the normal zip validation, artifact
  storage, audit, package row, and package version flow. Do not insert generated
  packages directly into `capability_packages` without a package version.
- Capability version restore may only activate versions whose audit status is
  activation-safe. Failed audit versions remain stored for review but cannot
  become `currentVersionId`.
- Host-bound automation creation requires explicit host access checks. Missing
  or inaccessible hosts must return actionable errors and must not reroute to a
  different machine.
- Settings pages remain ledger/admin views. They should show Control Chat
  changes after refetch or sync; they are not the primary management flow.

### 4. Validation & Error Matrix

- Missing Control Chat session or cross-org session access -> `NOT_FOUND`.
- Sending while `control_chat_sessions.active_run_id` is set -> `CONFLICT`.
- Tool input fails schema -> Zod validation error.
- Automation id missing or outside caller ownership -> `NOT_FOUND`.
- `automation.update.expectedUpdatedAt` stale -> `CONFLICT`.
- Automation target host missing -> `NOT_FOUND`.
- Automation target host not accessible -> `FORBIDDEN`.
- Automation target host offline when online is required -> `PRECONDITION_FAILED`.
- Capability id missing or outside organization -> `NOT_FOUND`.
- Capability delete while bound to project or automation -> `BAD_REQUEST`.
- Capability version restore with failed audit -> `BAD_REQUEST`.
- Duplicate capability package version -> `CONFLICT`.
- Local development without an audit model stores generated/imported packages
  with failed audit status and disabled package status. That is expected safety
  behavior, not a failed import.

### 5. Good/Base/Bad Cases

- Good: chat creates an Automation, records a config version with
  `controlChatSessionId` and `controlChatRunId`, then Settings/Automation views
  can read the changed row after refetch.
- Good: chat generates a Skill/CLI zip, validates and audits it, stores the
  artifact, inserts a package version, and only activates it if audit passed.
- Base: local development has no active hosts. `automation.run` may return a
  dispatching run first and then mark the run skipped with `no host available`;
  `automation.logs` must still show the durable run row.
- Bad: generated capability data is parked in a draft-only UI or inserted as a
  package row with no immutable version artifact.
- Bad: destructive-looking actions add bespoke confirmation cards instead of
  relying on Bypass mode plus version history and rollback.
- Bad: a host-bound tool silently picks another online host when the requested
  target host is missing or unavailable.

### 6. Tests Required

- Unit tests for Control Chat intent/tool selection when adding heuristic
  fallback paths.
- Unit tests for generated Skill/CLI package shape.
- Router or task-local matrix validation for every Automation and Capability
  tool name in `controlChatToolSchemas`.
- Conflict test for one active Control Chat run per session.
- Conflict test for stale `automation.update.expectedUpdatedAt`.
- Capability restore test for audit-passed and audit-failed versions.
- Desktop Automation smoke for the floating panel, Bypass indicator, current
  page preservation, and Settings reflection after a chat-created capability.
- Before shipping DB schema changes, create a Neon branch and generate Drizzle
  migrations. Never hand-edit `packages/db/drizzle/`.

### 7. Wrong vs Correct

#### Wrong

```ts
await dbWs.update(automations).set({
	prompt: nextPrompt,
});
```

#### Correct

```ts
await dbWs.transaction(async (tx) => {
	await tx.update(automations).set({ prompt: nextPrompt });
	await recordAutomationConfigVersion(tx, {
		automationId,
		authorUserId,
		source: "control_chat",
		controlChatSessionId,
		controlChatRunId,
		sourceInstruction,
	});
});
```

#### Wrong

```ts
await dbWs.update(capabilityPackages).set({
	currentVersionId: failedAuditVersionId,
	status: "active",
});
```

#### Correct

```ts
if (!canActivateCapabilityVersion({ auditStatus: version.auditStatus })) {
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Only versions that passed security audit can be activated.",
	});
}
```
