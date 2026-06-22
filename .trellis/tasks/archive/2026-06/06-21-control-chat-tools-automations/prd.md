# Control Chat for Tools and Automations

## Goal

Build a global floating Superset Control Chat that lets users manage Superset
configuration through natural language, covering Automations and Tools & Skills
capabilities end to end.

This is not a project chat and not a new Settings form. It is a software-level
assistant with default access to Superset management tools. Users should be able
to say things like "create a Skill", "turn this website into a CLI", "pause the
daily report automation", or "roll back the capability I just changed", and the
assistant should operate the underlying Superset APIs and host runtimes.

The interaction should stay chat-native. Do not introduce a separate draft UI,
wizard, or per-action confirmation cards. Risk is handled through the existing
Bypass permission mode, scoped internal tools, version history, audit logs, and
rollback.

This is a complete feature scope, not a lightweight first version. Engineering
can land the work in dependency order, but the feature is not considered done
until the floating chat, cloud-synced sessions, management tool execution,
multi-host routing, versioning, rollback, and Automations/Capabilities coverage
all work together.

## Requirements

### Confirmed Facts

- `settings/tools-and-skills` already exposes a Tools & Skills library with zip
  import, capability search, status toggles, details, and raw manifest display.
- Capability packages already use `superset.capability.json` with current
  `skill` and `cli` package types. Package import validates, audits, stores
  artifacts, and creates `capability_package_versions`.
- Automations already bind capability versions and materialize selected
  capabilities into automation run environments.
- Automation prompt version history already exists with restore support, but it
  is prompt-only rather than full configuration versioning.
- The chat runtime already supports `permissionMode: "bypassPermissions"`, and
  the desktop chat UI already exposes a Bypass mode.
- The desktop app already models organization hosts, machine ids, online state,
  and host membership. Some actions can run in cloud APIs; others must execute
  on a selected host or workspace host-service.
- The desired UX is inspired by Multica's bottom-right floating chat panel:
  global floating entry, compact chat window, minimized/expanded states, and
  chat-first operation.

### Product Requirements

- Add a global floating Control Chat entry in authenticated desktop surfaces.
  It should be available outside specific workspace panes, including Settings,
  Automations, and Tools & Skills.
- The floating panel should reuse the existing Superset chat visual language in
  a compact form: messages, tool timeline, input composer, running/stop state,
  attachments where useful, and local open/size persistence.
- Control Chat sessions and messages must sync across machines. A user should be
  able to start a management conversation on one host and continue it on
  another.
- Local UI state such as open/closed, size, and position may remain local to the
  device.
- Control Chat must default to Bypass mode for tool execution. The feature
  should not add custom confirmation cards around destructive or powerful
  actions.
- The system prompt and runtime context must inject Superset management
  capabilities by default, including current organization, current page context,
  available hosts, host online state, and selected resource context when
  present.
- The assistant must operate through typed internal tools rather than directly
  mutating database rows or scraping the renderer UI.
- The initial tool surface must cover Automation management:
  list/get/create/update/pause/resume/run/logs/version history/restore.
- The initial tool surface must cover Capability management:
  list/get/import/update status/delete/version history/restore where applicable.
- Generated capabilities should be created through ordinary chat turns. The user
  can ask the assistant to build a Skill, wrap a GitHub repository, or generate a
  CLI from a website. The result is committed as a capability package version,
  not parked in a special draft screen.
- Versioning must be the primary safety mechanism. Automation and Capability
  changes made by Control Chat must create restorable versions with enough
  metadata to identify the assistant session, user, source instruction, summary,
  and previous version.
- Multi-host execution must be explicit in the runtime model: cloud-only
  operations run in cloud APIs; local operations run on a host; and
  workspace-scoped operations default to the workspace's owning host.
- If a required host is offline or unavailable to the user, the assistant should
  report that in chat and suggest available alternatives. It should not silently
  fall back to an unrelated machine for host-bound operations.
- A single Control Chat session should allow only one active assistant turn at a
  time. Resource writes must include a revision/version precondition so two
  devices cannot accidentally overwrite each other's changes.

### Non-Goals

- Do not replace the existing Settings pages. Settings remain the ledger/admin
  views for explicit browsing, status toggles, version history, and details.
- Do not make this a project-specific chat whose primary job is to inject
  capabilities into a project or session. Project/workspace context may be used
  as input, but the feature manages Superset configuration.
- Do not build a wizard-like Capability Builder or separate draft workspace for
  generated tools.
- Do not add new per-action confirmation cards beyond existing chat permission
  modes and existing product flows.
- Do not let the assistant bypass organization membership, host membership, or
  existing access checks.

## Acceptance Criteria

- [ ] A floating Control Chat entry appears on authenticated desktop surfaces
      and opens a compact chat panel without navigating away from the current
      page.
- [ ] Control Chat sends messages with `permissionMode:
      "bypassPermissions"` by default and does not show additional custom
      confirmation cards for tool calls.
- [ ] Control Chat sessions, messages, tool calls, and run state are persisted
      in cloud-backed storage and can be viewed from another machine signed into
      the same organization.
- [ ] The assistant receives current organization, current page/resource
      context, local machine id, and available host summaries in its default
      context.
- [ ] The assistant can list, inspect, create/update, pause/resume, run, and
      view logs for Automations through typed internal tools.
- [ ] Automation changes made through Control Chat write restorable
      configuration versions, not just prompt snapshots.
- [ ] The assistant can list, inspect, import, enable/disable, delete when safe,
      and describe versions for Tools & Skills capabilities through typed
      internal tools.
- [ ] Capability changes made through Control Chat create capability package
      versions or version metadata sufficient for comparison and rollback.
- [ ] Host-bound tool calls require a selected/derived host target and fail with
      an actionable chat response when the target host is offline or
      inaccessible.
- [ ] Concurrent sends from two devices into the same Control Chat session are
      serialized or rejected with an understandable state response.
- [ ] Resource updates include revision/version preconditions so stale writes do
      not silently overwrite newer configuration.
- [ ] Existing Settings pages continue to work as administrative views and show
      changes made by Control Chat after sync/refetch.

## Product Direction

Use one organization-level Control Chat surface with current page/resource
context injected into each turn. Avoid separate chat histories per Settings page
or resource; the assistant should stay global while still understanding what the
user is currently looking at.
