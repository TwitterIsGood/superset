# Fix the New Issue status dropdown in Tasks

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the repository root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. The affected app is the Electron desktop app in `apps/desktop`. The relevant shared package is `packages/trpc`, which exposes API procedures consumed by the desktop renderer. No database schema migration is required.

## Purpose / Big Picture

Users can open the Tasks panel, click the New issue button, click the Status control, and see usable status choices such as Backlog, Todo, In Progress, Done, and Canceled. Today that dropdown can open with no contents because the create-task dialog reads status rows only from the live Electric-backed `taskStatuses` collection, and a new or unsynced organization may have no local rows available yet. After this change, opening the New issue dialog will ensure the active organization has default task statuses before the picker is used, so users can choose a status immediately and create the task with the chosen status.

The working behavior is visible in the desktop app: navigate to `/tasks`, open New issue, click Status, and observe populated status menu items. Creating an issue should still work and should store the selected status.

## Assumptions

The active organization is available from the authenticated session in the API context. This is consistent with `packages/trpc/src/router/task/task.ts`, where `createFromUi` already calls `requireActiveOrgMembership(ctx)` before creating a task.

The empty dropdown is caused by `CreateTaskDialog` receiving an empty `statuses` array from `useLiveQuery` over `collections.taskStatuses`, not by the dropdown UI failing to render non-empty data. Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx` passes `statuses={statuses}` to `CreateTaskStatusPicker`, and `CreateTaskStatusPicker.tsx` disables its trigger when `sortedStatuses.length === 0`.

Default statuses should be organization-scoped rows in the `task_statuses` table, not hard-coded fake client options. Evidence: `packages/db/src/seed-default-statuses.ts` already has an idempotent `seedDefaultStatuses(organizationId, executor)` helper that inserts the default workflow statuses for an organization and returns the Backlog status id.

## Open Questions

There are no blocking open questions. The implementation should proceed with the server-backed default-status seeding approach described below because it matches existing backend behavior in `task.createFromUi` and avoids client-only status ids that cannot be submitted to the API.

## Progress

- [x] (2026-04-25 22:56Z) Reviewed the create-task dialog and status picker files to locate where the empty dropdown is produced.
- [x] (2026-04-25 22:56Z) Reviewed the task router and default status seeding helper to identify the existing server-side mechanism for creating organization statuses.
- [x] (2026-04-25 22:56Z) Drafted this ExecPlan with a concrete implementation path and validation steps.
- [x] (2026-04-25 23:15Z) Added `task.ensureDefaultStatuses` as a protected mutation that seeds defaults for the active organization and returns ordered status rows.
- [x] (2026-04-25 23:18Z) Updated the desktop New issue dialog to request default statuses when opened with no live status rows and use API-returned statuses until Electric catches up.
- [x] (2026-04-25 23:20Z) Updated the status picker to keep the trigger clickable and render a disabled `No statuses available` empty-state item.
- [x] (2026-04-25 23:22Z) Added regression tests for the API procedure and dialog/picker source wiring.
- [x] (2026-04-25 23:30Z) Validated focused tests, changed-file Biome checks, and full typecheck.
- [x] (2026-04-25 23:33Z) Attempted desktop automation verification; automation connected and verified the empty-state picker behavior, but live/API-seeded status population could not complete because the API request was blocked by CORS in the running dev app.

## Surprises & Discoveries

- Observation: `task.createFromUi` can already seed default statuses when no `statusId` is provided, but the New issue dialog asks the user to pick a status before creation.
  Evidence: `packages/trpc/src/router/task/task.ts` calls `seedDefaultStatuses(organizationId, tx)` when `input.statusId` is absent, while `CreateTaskStatusPicker.tsx` disables the status trigger when it has no status rows.

- Observation: The existing status picker is data-driven and should not need a visual rewrite.
  Evidence: `CreateTaskStatusPicker.tsx` sorts and renders `StatusMenuItems` from a `statuses: SelectTaskStatus[]` prop. `StatusMenuItems.tsx` maps every status into a menu item.

- Observation: The default workflow status definitions already exist in shared database code.
  Evidence: `packages/db/src/seed-default-statuses.ts` defines Backlog, Todo, In Progress, Done, and Canceled and inserts them idempotently per organization.

- Observation: The existing task router test mocks use a minimal Drizzle chain, so the new status query needed the mocked `taskStatuses.position` field to support `orderBy(taskStatuses.position)` assertions indirectly.
  Evidence: `packages/trpc/src/router/task/task.test.ts` previously mocked only `id` and `organizationId` for `taskStatuses`.

- Observation: Desktop automation connected to the running app on `/tasks`, but the new API call failed before seeding statuses because the cloud API rejected the localhost preflight with an invalid empty `Access-Control-Allow-Origin` header.
  Evidence: Renderer console logged `Access to fetch at 'https://api.superset.sh/api/trpc/task.ensureDefaultStatuses?batch=1' from origin 'http://localhost:5173' has been blocked by CORS policy` followed by `Failed to ensure default task statuses TRPCClientError: Failed to fetch`.

## Decision Log

- Decision: Seed statuses through the API rather than hard-coding client-side placeholder statuses.
  Rationale: A status selection must submit a real `task_statuses.id` accepted by `getScopedStatusId` in `packages/trpc/src/router/task/task.ts`. Fake client ids would make task creation fail or require special-case translation.
  Date/Author: 2026-04-25 / Claude

- Decision: Add the ensure-default-status behavior to the existing task router.
  Rationale: The bug is specific to the Tasks feature and the router already imports `taskStatuses`, `seedDefaultStatuses`, `dbWs`, and active-organization helpers. Keeping it in `taskRouter` avoids a new API surface area elsewhere.
  Date/Author: 2026-04-25 / Claude

- Decision: Use returned API rows as a temporary local source in the dialog until Electric sync provides the same rows.
  Rationale: Electric-backed collections can lag or be unavailable. The dialog needs immediate usable options after the API confirms default statuses exist.
  Date/Author: 2026-04-25 / Claude

- Decision: Keep task creation non-blocking when `ensureDefaultStatuses` fails and rely on the picker empty state plus existing `createFromUi` fallback seeding.
  Rationale: The dialog should remain usable even when the pre-open seeding call is unavailable; `createFromUi` already seeds a default status if no status id is supplied.
  Date/Author: 2026-04-25 / Claude

## Outcomes & Retrospective

Implemented the server-backed default status path and desktop fallback wiring. The New issue dialog now attempts to seed real organization-scoped statuses through `task.ensureDefaultStatuses` when opened without live Electric status rows, then uses those returned rows until Electric catches up. The status picker no longer renders a blank disabled control when empty; it opens and shows `No statuses available`.

Focused automated validation passed. Desktop automation connected to the running dev app and verified the explicit empty state, but it could not verify populated status menu items because the running app's request to `https://api.superset.sh/api/trpc/task.ensureDefaultStatuses` was blocked by CORS from `http://localhost:5173`.

## Context and Orientation

This work affects the desktop app only from the user's point of view. The relevant renderer code lives under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks`. The relevant API code lives in `packages/trpc/src/router/task/task.ts`. The relevant database helper is `packages/db/src/seed-default-statuses.ts`.

The desktop renderer is browser code. It must not import Node.js-only modules. It can call the cloud API through `apiTrpcClient` from `apps/desktop/src/renderer/lib/api-trpc-client.ts`, which is already used by `CreateTaskDialog.tsx` for `task.createFromUi`.

Electric is the live sync layer used by `@tanstack/react-db` collections. In this repository, `collections.taskStatuses` is an Electric-backed collection created in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`. A `useLiveQuery` over that collection returns locally synced rows. If no status rows have been synced yet, the UI sees `statusData` as empty or undefined.

The current New issue flow is:

`apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx` opens a dialog with title, description, status, priority, and assignee controls. It reads statuses with:

    const { data: statusData } = useLiveQuery(
      (q) =>
        q
          .from({ taskStatuses: collections.taskStatuses })
          .select(({ taskStatuses }) => ({ ...taskStatuses })),
      [collections],
    );

It converts that to:

    const statuses = useMemo(() => statusData ?? [], [statusData]);

Then it renders:

    <CreateTaskStatusPicker
      statuses={statuses}
      value={statusId}
      onChange={setStatusId}
    />

`CreateTaskStatusPicker.tsx` sorts `statuses` and passes them to `StatusMenuItems`. If there are zero rows, its button is disabled:

    disabled={sortedStatuses.length === 0}

The backend already has `seedDefaultStatuses(organizationId, executor)` in `packages/db/src/seed-default-statuses.ts`. That helper inserts these default statuses for an organization if a non-Linear Backlog status does not already exist:

    Backlog, Todo, In Progress, Done, Canceled

It is already used by `task.createFromUi` when no status id is supplied. The missing piece is making those real status rows available before the user clicks the status dropdown.

No Electron IPC work is required. IPC means inter-process communication between Electron main and renderer processes. This task uses existing HTTP/tRPC API calls from the renderer to the cloud API, not Electron main-process channels.

## Plan of Work

First, add a new protected task procedure in `packages/trpc/src/router/task/task.ts`, near `createFromUi`, named `ensureDefaultStatuses`. It should call `requireActiveOrgMembership(ctx)` to get the active organization id, call `seedDefaultStatuses(organizationId, dbWs)` to idempotently create default rows, then query `taskStatuses` for all statuses belonging to that organization ordered by `position`. It should return the status rows. The helper returns only the Backlog id, so the procedure needs a follow-up select to return all rows for the dropdown.

The procedure shape should be a mutation rather than a query because it may write rows. Its outline should be:

    ensureDefaultStatuses: protectedProcedure.mutation(async ({ ctx }) => {
      const organizationId = await requireActiveOrgMembership(ctx);
      await seedDefaultStatuses(organizationId, dbWs);
      return db
        .select()
        .from(taskStatuses)
        .where(eq(taskStatuses.organizationId, organizationId))
        .orderBy(taskStatuses.position);
    }),

Use whichever database executor is already standard in this file for reads after writes. If the file distinguishes websocket/write database and regular read database, keep the write in `dbWs` and the read in the normal `db` unless tests or existing patterns require one executor.

Second, update `CreateTaskDialog.tsx` to fetch default statuses when the dialog opens and `statuses` is empty. Add a local state variable such as `seededStatuses` typed as `SelectTaskStatus[]`. Because the file currently imports only `TaskPriority`, add a type import for `SelectTaskStatus` from `@superset/db/schema`.

Compute the visible statuses from Electric rows first and fallback API rows second:

    const statuses = useMemo(
      () => (statusData?.length ? statusData : seededStatuses),
      [seededStatuses, statusData],
    );

Add an effect that runs when `open` is true and the Electric status data is empty. The effect should call `apiTrpcClient.task.ensureDefaultStatuses.mutate()`, store the returned rows in `seededStatuses`, and avoid duplicate concurrent calls with a ref such as `ensureStatusesRequestRef`. If the call fails, log a concise warning and leave the dropdown disabled or showing an empty-state item. Do not block the dialog from opening.

Third, improve `CreateTaskStatusPicker.tsx` so an empty status list gives a clear non-selectable message rather than a blank dropdown. Keep the existing styling and `StatusMenuItems` rendering for non-empty data. Remove the disabled trigger or only disable it during creation if needed; this picker does not know creation state, so prefer keeping it clickable and rendering one disabled item saying `No statuses available` when `sortedStatuses.length === 0`. The menu should never appear as empty white space.

If `DropdownMenuItem` does not support `disabled` in the local type used by `StatusMenuItems`, render a direct `DropdownMenuItem disabled` in `CreateTaskStatusPicker.tsx` only for the empty state, outside `StatusMenuItems`. Do not change shared `StatusMenuItems` unless required.

Fourth, add regression tests. Existing Tasks tests are source-level tests in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`. Add or create a co-located test under `CreateTaskDialog`, for example `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.test.ts`, that reads source files and verifies:

- `CreateTaskDialog.tsx` calls `apiTrpcClient.task.ensureDefaultStatuses.mutate()`.
- `CreateTaskDialog.tsx` keeps `seededStatuses` as a fallback when `statusData` is empty.
- `CreateTaskStatusPicker.tsx` no longer disables the trigger solely because `sortedStatuses.length === 0`.
- `CreateTaskStatusPicker.tsx` renders an explicit empty-state message such as `No statuses available`.

Also extend `packages/trpc/src/router/task/task.test.ts` or add a focused test in the same directory to verify `ensureDefaultStatuses` calls `seedDefaultStatuses` and returns statuses for the active organization. Follow the existing mock style in that file; it already mocks `@superset/db/seed-default-statuses`.

## Concrete Steps

From the repository root, inspect the files if needed:

    Read apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx
    Read apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/components/CreateTaskStatusPicker/CreateTaskStatusPicker.tsx
    Read packages/trpc/src/router/task/task.ts
    Read packages/db/src/seed-default-statuses.ts

Edit the backend first:

    packages/trpc/src/router/task/task.ts

Add `ensureDefaultStatuses` to `taskRouter` as a protected mutation. It should require the active org, call `seedDefaultStatuses`, and return ordered status rows for that org.

Edit the dialog:

    apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx

Add local fallback state and an effect that calls `apiTrpcClient.task.ensureDefaultStatuses.mutate()` when the dialog opens without synced statuses. Use the returned statuses for the picker until `statusData` has rows.

Edit the picker:

    apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/components/CreateTaskStatusPicker/CreateTaskStatusPicker.tsx

Allow the trigger to open even if the list is empty. Render an explicit empty state inside `DropdownMenuContent` when no statuses exist.

Add tests:

    apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.test.ts
    packages/trpc/src/router/task/task.test.ts

Run focused validations:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.test.ts
    # Expected: all CreateTaskDialog regression tests pass.

    bun test packages/trpc/src/router/task/task.test.ts
    # Expected: task router tests pass, including ensureDefaultStatuses.

Run changed-file formatting and lint checks from the repository root:

    bunx biome check \
      packages/trpc/src/router/task/task.ts \
      packages/trpc/src/router/task/task.test.ts \
      apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx \
      apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.test.ts \
      apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/components/CreateTaskStatusPicker/CreateTaskStatusPicker.tsx
    # Expected: Checked files with no formatter or lint errors.

Run typecheck from the repository root:

    bun run typecheck
    # Expected: all package typechecks pass.

## Validation and Acceptance

Automated acceptance is:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.test.ts
    bun test packages/trpc/src/router/task/task.test.ts
    bun run typecheck

All commands should finish with zero failures.

Manual desktop acceptance is:

1. Start desktop development using the Apple Silicon-safe startup path with the automation port enabled. On this machine, prefer the arm64 flow rather than generic `bun dev` because native modules can crash under Rosetta x64 Node. The key environment variable for desktop automation is `DESKTOP_AUTOMATION_PORT=9322`.
2. Open the desktop app.
3. Navigate to Tasks.
4. Click New issue.
5. Click the Status control.
6. Observe menu items for Backlog, Todo, In Progress, Done, and Canceled, or any existing organization-specific statuses.
7. Pick a status, type a title, create the task, and verify the task opens with that status.

Desktop automation acceptance should use the desktop automation MCP after the dev app is listening on port 9322. The automation should inspect the DOM, click Tasks, click New issue, click Status, and verify status menu text is visible. If automation cannot connect to `http://127.0.0.1:9322/json/version`, first verify the Electron process was launched with `DESKTOP_AUTOMATION_PORT=9322`; this is required by `apps/desktop/src/lib/electron-app/factories/app/setup.ts`.

## Idempotence and Recovery

The backend seeding operation is safe to retry because `seedDefaultStatuses` is idempotent. It checks for an existing non-Linear Backlog status before inserting the default workflow rows.

If the API call succeeds but Electric sync is slow, the dialog still uses returned API rows locally, so the dropdown remains populated. When Electric later syncs `taskStatuses`, `statusData` takes precedence and the dialog naturally uses the live collection rows.

If the API call fails, the dialog remains open and the status picker should show a clear empty state instead of a blank menu. Task creation can still proceed without a `statusId`, and `task.createFromUi` will attempt to seed statuses during creation as it does today.

If tests fail because `task.test.ts` mocks do not support the new select path, update only the test mocks needed for `taskStatuses` selection. Do not change production database schema or manually edit generated migration files.

## Artifacts and Notes

Important current code in `CreateTaskStatusPicker.tsx`:

    <button
      type="button"
      className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60"
      disabled={sortedStatuses.length === 0}
    >

This disables the status control exactly when the status list is empty. The implementation should remove that dependency and render an explicit empty state in the dropdown.

Important current code in `CreateTaskDialog.tsx`:

    const { data: statusData } = useLiveQuery(
      (q) =>
        q
          .from({ taskStatuses: collections.taskStatuses })
          .select(({ taskStatuses }) => ({ ...taskStatuses })),
      [collections],
    );

    const statuses = useMemo(() => statusData ?? [], [statusData]);

This should become a live-data-first, API-fallback status source.

Important backend helper in `packages/db/src/seed-default-statuses.ts`:

    export async function seedDefaultStatuses(
      organizationId: string,
      executor: Executor = dbWs,
    ): Promise<string>

It returns the Backlog status id, not all statuses, so the new task router procedure must query and return all status rows after calling it.

## Interfaces and Dependencies

The new API interface should be available on the existing `taskRouter` in `packages/trpc/src/router/task/task.ts`:

    ensureDefaultStatuses: protectedProcedure.mutation(async ({ ctx }) => {
      // returns SelectTaskStatus[] for the active organization
    })

The desktop renderer should call it through the existing `apiTrpcClient`:

    const defaultStatuses = await apiTrpcClient.task.ensureDefaultStatuses.mutate();

No new dependencies should be added. Use existing libraries already present in the touched files: React hooks, `@tanstack/react-db`, `apiTrpcClient`, Drizzle query helpers already imported in `task.ts`, and the existing `seedDefaultStatuses` helper.

No Electron IPC channel is needed. No database schema migration is needed. No production database operations should be run manually.

## Revision Notes

2026-04-25: Initial ExecPlan created after investigating the New issue dialog, status picker, task router, and default status seeding helper. The plan chooses server-backed default status seeding because the dropdown needs real organization-scoped status ids, not client-only placeholder options.

2026-04-25: Implementation completed without changing the database schema or adding migrations. Validation commands were run as planned. Desktop automation was possible, but populated-status acceptance remains blocked by the running dev environment's API CORS response rather than by the renderer automation connection.
