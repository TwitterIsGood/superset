# Control Chat Complete Implementation Checklist

## Planning Gate

- Review `prd.md` and `design.md` with the user.
- Record the product direction as one organization-level surface with
  page/resource context.
- Only start implementation after Trellis task activation.

## 1. Floating Control Chat Shell

- Add a renderer feature folder for Control Chat under the authenticated desktop
  route/layout ownership boundary.
- Add local Zustand store for panel UI preferences: open, size, expanded.
- Add `ControlChatFab` and `ControlChatWindow`.
- Reuse existing chat message/composer/timeline components where they do not
  pull in workspace-specific assumptions.
- Wire the floating entry into the authenticated desktop content layout.

Validation:

- Focused renderer tests for store defaults and persistence.
- Desktop acceptance smoke: authenticated app shows the floating entry, opens
  the panel, closes/minimizes it, and preserves current page.

## 2. Cloud Control Chat Sessions

- Add cloud DB schema for control chat sessions/messages/runs/tool calls.
- Add organization-scoped tRPC router for session create/list/get/send/stop.
- Persist messages and run state in cloud storage.
- Include current renderer context in `send` metadata: route id/path, current
  resource ids, local machine id, and active organization.
- Default runtime metadata to `permissionMode: "bypassPermissions"`.
- Add live query or query invalidation/refetch path for multi-device updates.

Validation:

- Router tests for organization scoping and one-active-run behavior.
- Cross-device-style test at API layer: session created by one caller is listed
  and readable by another authorized caller in the same organization.
- Conflict test: sending while a run is active returns a stable error.

## 3. Tool Execution Layer

- Define typed Control Chat tool registry with explicit target kinds: `cloud`,
  `host`, and `workspace`.
- Add host target resolution helpers:
  - current machine
  - explicit host id
  - workspace owning host
- Add authorization checks for host membership and workspace/project access.
- Persist each tool call input/output/status.
- Return actionable tool errors to the model and UI.

Validation:

- Unit tests for target resolution.
- Router tests for inaccessible/offline host failures.
- No Electron import leaks into host-service or cloud packages.

## 4. Automation Management Tools

- Wrap existing automation router operations as Control Chat tools:
  list/get/create/update/pause/resume/run/logs.
- Expand automation versioning from prompt-only to full configuration snapshots.
- Add restore support for full config versions.
- Ensure Control Chat writes include version/revision preconditions.
- Update Automation detail/version UI to reflect assistant-created versions.

Validation:

- Unit/router tests for config snapshot creation and restore.
- Conflict test for stale automation revision writes.
- UI test or acceptance smoke showing a Control Chat-created automation appears
  in the Automations list after refetch/sync.

## 5. Capability Management Tools

- Wrap existing capability operations as Control Chat tools:
  list/get/importPackage/setStatus/delete/version list.
- Add current-version restore or select-current-version operation if missing.
- Capture assistant/session metadata on capability package versions.
- Ensure generated/imported capability versions go through existing validation
  and audit paths.

Validation:

- Router tests for version selection/restore and deletion safety.
- Existing capability package validation/audit tests remain passing.
- Tools & Skills settings page reflects imported/updated packages after Control
  Chat operations.

## 6. Chat-Native Capability Generation

- Add tools for package generation without a separate draft UI: generate Skill
  package, generate CLI package, package files, validate, smoke test, import.
- Use versioned package artifacts as the checkpoint/rollback unit.
- Support source references from URL/GitHub/text instructions.

Validation:

- Unit tests for generated manifest/package shape.
- Smoke test for a small generated CLI package import.
- Capability version history shows assistant-created versions with source
  metadata.

## Global Validation

- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`
- Focused package tests as changes land:
  - `bun run --cwd apps/desktop test`
  - `bun run --cwd packages/host-service test`
  - relevant `packages/trpc` tests
- Desktop Automation CLI acceptance for the floating panel and at least one
  cross-layer management workflow before shipping.

## Release Guardrails

- Keep the feature behind a flag until the complete scope is wired together.
- Keep tool domains independently toggleable internally so a broken tool family
  can be disabled without removing the floating assistant.
- Use version history and resource preconditions as the rollback and conflict
  mechanism for user-visible changes.
