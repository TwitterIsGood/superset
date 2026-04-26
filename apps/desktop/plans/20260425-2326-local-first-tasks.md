# Make Tasks fully usable without the cloud API

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the repository root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. Desktop interprocess communication must use Electron tRPC from `apps/desktop/src/lib/trpc`, renderer code must not import Node.js modules, Bun is the package manager, and generated Drizzle migration files must not be manually edited.

## Purpose / Big Picture

Tasks should work for a desktop user even when `https://api.superset.sh` and the Electric cloud sync service are unavailable. After this change, a user with no cloud session and no JWT can open the Tasks page, see default statuses, create a new task, edit its title and description, change status, priority, and assignee, drag a task between board columns, delete a task, and run selected tasks in local workspaces without any request to the cloud API.

The app will keep cloud behavior when a valid cloud session and JWT exist. The new behavior is a local-first fallback for Tasks only: billing, subscriptions, cloud integrations, multi-device presence, hosted organization membership, Linear sync, and broader cloud-only features remain outside this plan.

## Assumptions

The mode decision is local for Tasks when the renderer has no active cloud organization session or no cloud JWT. The mode decision is cloud for Tasks when the renderer has both an active cloud organization id and a JWT that can authorize Electric shape requests.

Local Tasks will use the desktop SQLite database at `SUPERSET_HOME_DIR/local.db`, initialized by `apps/desktop/src/main/lib/local-db/index.ts`. SQLite migrations are generated from `packages/local-db/src/schema/schema.ts` by Drizzle; migration SQL files under `packages/local-db/drizzle/` are generated artifacts and must not be edited by hand.

Local mode uses one deterministic local organization and one deterministic local user. The existing desktop constant `MOCK_ORG_ID` from `apps/desktop/src/shared/constants.ts` can serve as the local organization id. A new local user id such as `local-user-id` can serve as creator and default assignee identity. These rows must be seeded into local SQLite before local tasks are listed or created.

Tasks-related flows include the list page, board page, task detail page, New issue dialog, status picker, priority picker, assignee picker, context menu delete, task action menu delete, row selection, Run in Workspace, and the Linear CTA check in `TasksView`. Tasks-related flows do not include billing, hosted team administration, Linear OAuth setup, or server-side cloud synchronization.

## Open Questions

No user-facing questions remain for this plan. The user explicitly requested a hybrid local/cloud mode, a local Electron tRPC Tasks backend, local DB schema additions, collection data-source branching, and CreateTaskDialog branching.

Implementation may discover small type-shape differences between local SQLite rows and cloud `SelectTask` / `SelectTaskStatus`. Resolve those inside mapping helpers so the renderer continues to consume the existing cloud-shaped camelCase task objects.

## Progress

- [x] (2026-04-25 23:26 local) Inspected the current local SQLite schema in `packages/local-db/src/schema/schema.ts`; found a legacy `tasks` table with denormalized status fields and no `task_statuses` table or `status_id` relation.
- [x] (2026-04-25 23:26 local) Inspected desktop local DB initialization in `apps/desktop/src/main/lib/local-db/index.ts`; confirmed local SQLite is already available to Electron main process and migrated from `packages/local-db/drizzle`.
- [x] (2026-04-25 23:26 local) Inspected desktop tRPC registration in `apps/desktop/src/lib/trpc/routers/index.ts`; confirmed there is no local Tasks router yet and a new `tasksLocal` router must be registered there.
- [x] (2026-04-25 23:26 local) Inspected renderer collection setup in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`; confirmed `tasks` and `taskStatuses` are Electric collections whose mutations call `apiClient.task.*`.
- [x] (2026-04-25 23:26 local) Inspected Tasks UI mutation paths; confirmed most edits already go through `collections.tasks.update/delete`, while `CreateTaskDialog` and task-detail fallback still call `apiTrpcClient.task.*` directly.
- [x] (2026-04-25 23:26 local) Drafted this ExecPlan for local-first Tasks.
- [x] (2026-04-25 local) Implemented local SQLite schema additions in `packages/local-db/src/schema/schema.ts` and generated `packages/local-db/drizzle/0042_local_first_tasks.sql` with Drizzle.
- [x] (2026-04-25 local) Implemented the Electron main `tasksLocal` tRPC router and registered it in the desktop app router.
- [x] (2026-04-25 local) Implemented local TanStack DB collections for Tasks-related data backed by Electron tRPC list/reload subscriptions.
- [x] (2026-04-25 local) Branched `CollectionsProvider` between cloud and local Tasks data sources using active organization plus JWT presence.
- [x] (2026-04-25 local) Branched CreateTaskDialog and task-detail fallback between cloud API and local tRPC.
- [x] (2026-04-26 local) Added source-level and helper regression tests, then ran targeted tests, changed-file Biome checks, local-db typecheck, and desktop typecheck.
- [x] (2026-04-26 local) Validated manually with desktop automation in no-cloud local mode: Tasks page loaded without the Linear CTA, default Backlog status appeared, creating a local task navigated to `TASK-1`, and task detail showed local user/activity.

## Surprises & Discoveries

- Observation: The desktop app already has a local SQLite `tasks` table, but it is not compatible with the current Tasks UI join pattern.
  Evidence: `packages/local-db/src/schema/schema.ts` defines `tasks.status`, `status_color`, `status_type`, and `status_position`, while renderer Tasks queries join on `tasks.statusId` and `collections.taskStatuses`.

- Observation: The Tasks page can still touch cloud services even after removing the Pro gate.
  Evidence: `CollectionsProvider/collections.ts` defines Electric collections for `tasks`, `task_statuses`, `users`, `organizations`, and `integration_connections`; `CreateTaskDialog.tsx` calls `apiTrpcClient.task.ensureDefaultStatuses.mutate()` and `apiTrpcClient.task.createFromUi.mutate()`.

- Observation: Most edit flows are already well-positioned for local-first behavior because they mutate `collections.tasks` instead of directly calling the cloud API.
  Evidence: status, priority, assignee, board drag, detail title/description, context-menu delete, and action-menu delete all call `collections.tasks.update(...)` or `collections.tasks.delete(...)`.

- Observation: The package migration command only worked from the package directory with Bun's script syntax, not from the repository root.
  Evidence: `bun run generate -- --name=local_first_tasks` at the repo root failed with `Script not found "generate"`; `cd packages/local-db && bun run generate --name=local_first_tasks` generated `0042_local_first_tasks.sql`.

- Observation: Local mode still showed the Linear CTA after local collections were added because the CTA condition only checked whether any Linear integration connection existed.
  Evidence: Desktop automation initially showed `Connect Linear` on `/tasks`; adding `collections.tasksMode === "cloud"` to the CTA condition made local Tasks usable.

- Observation: An old console entry showed a cloud `task.createFromUi` request from before the local-mode HMR update, but a clean console after the final local create flow showed no new logs.
  Evidence: `get_console_logs(clear: true)` after the final create/detail validation returned `No console logs`.

## Decision Log

- Decision: Implement local-first behavior only for Tasks and directly related Tasks flows, not for the whole app.
  Rationale: The user explicitly accepted not touching broader cloud-only systems for now. This limits blast radius while making the requested feature fully usable offline.
  Date/Author: 2026-04-25 / Claude

- Decision: Use mode-based branching rather than replacing the cloud API globally.
  Rationale: Existing cloud users should keep Electric sync and cloud tRPC behavior. Local users should avoid cloud calls for Tasks when they have no session/JWT.
  Date/Author: 2026-04-25 / Claude

- Decision: Add an Electron main tRPC router named `tasksLocal` under `apps/desktop/src/lib/trpc/routers/tasks-local/`.
  Rationale: `apps/desktop/AGENTS.md` requires Electron interprocess communication to use tRPC. Renderer code cannot safely import Node.js or local SQLite directly.
  Date/Author: 2026-04-25 / Claude

- Decision: Return cloud-shaped camelCase task and status objects from the local router and local collections.
  Rationale: Existing Tasks UI imports `SelectTask`, `SelectTaskStatus`, and `SelectUser` from `@superset/db/schema` and already expects fields such as `statusId`, `organizationId`, `assigneeExternalId`, `createdAt`, and `updatedAt`.
  Date/Author: 2026-04-25 / Claude

- Decision: Keep legacy local task status columns during the migration and populate them from `status_id`.
  Rationale: Additive migration is safer for existing local databases. Removing or rewriting old columns can be done later after local-first Tasks is verified.
  Date/Author: 2026-04-25 / Claude

- Decision: Do not manually edit files in `packages/local-db/drizzle/`.
  Rationale: Repository instructions say Drizzle migration files are generated artifacts. Schema changes must be made in `packages/local-db/src/schema/schema.ts`, then generated with Drizzle.
  Date/Author: 2026-04-25 / Claude

- Decision: Suppress the Linear CTA in local Tasks mode.
  Rationale: Local mode intentionally uses an empty local integration connection collection; showing a cloud integration CTA blocks the offline Tasks UI and is outside the local-first Tasks acceptance criteria.
  Date/Author: 2026-04-26 / Claude

## Outcomes & Retrospective

Implemented the local-first Tasks path for desktop. No-cloud local mode now uses local SQLite plus Electron tRPC for task statuses, tasks, users, organizations, and integration connections; the Tasks page loads without the Linear CTA, local task creation navigates to a persisted detail page, and task detail displays local status/user data. Cloud mode remains routed through Electric/cloud tRPC when both an active cloud organization and JWT exist. Full delete/board/run-in-workspace manual coverage was not completed in desktop automation, but the underlying mutation paths now go through local collection `onUpdate`/`onDelete` handlers in local mode.

## Context and Orientation

This work affects the desktop app in `apps/desktop` and the local database package in `packages/local-db`. It also uses type definitions from `packages/db`, because the existing renderer Tasks UI is typed against cloud task records from `@superset/db/schema`.

The desktop app has two processes. The Electron main process can use Node.js modules and local SQLite. The renderer process is the browser UI and must not import Node.js-only modules. Communication between the two processes must go through Electron tRPC, defined under `apps/desktop/src/lib/trpc` and consumed from renderer code through `apps/desktop/src/renderer/lib/electron-trpc.ts` for React hooks or `apps/desktop/src/renderer/lib/trpc-client.ts` for imperative calls.

`packages/local-db/src/schema/schema.ts` defines the local SQLite schema. The local DB is opened in `apps/desktop/src/main/lib/local-db/index.ts`, which creates `SUPERSET_HOME_DIR/local.db`, enables WAL mode, registers a `uuid_v4` function, and runs Drizzle migrations from `packages/local-db/drizzle`.

`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` creates TanStack DB collections. A collection is the reactive data source consumed by `useLiveQuery` in the Tasks UI. Today, `tasks` and `taskStatuses` are Electric collections. Electric is a sync service that streams database table shapes from the cloud through `NEXT_PUBLIC_ELECTRIC_URL`; these requests need a JWT. The collection mutation handlers call `apiClient.task.create/update/delete`, where `apiClient` points at `${NEXT_PUBLIC_API_URL}/api/trpc`, defaulting to `https://api.superset.sh/api/trpc`.

The Tasks list page is implemented under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/`. `useTasksData` and `useTasksTable` join `collections.tasks`, `collections.taskStatuses`, and `collections.users`. The board view in `TasksBoardView.tsx` updates `draft.statusId` when cards are dragged. Table cells and task properties update `draft.statusId`, `draft.priority`, and assignee fields through `collections.tasks.update`. Delete actions call `collections.tasks.delete`. This means those edit flows can become local automatically if the collection mutation handlers are local.

`CreateTaskDialog.tsx` is different: it directly calls `apiTrpcClient.task.ensureDefaultStatuses.mutate()` and `apiTrpcClient.task.createFromUi.mutate()`. The task detail route in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.tsx` also directly calls `apiTrpcClient.task.byId.query` or `apiTrpcClient.task.bySlug.query` as a fallback. These direct cloud calls must branch by mode.

`Task status` means a row such as Backlog, Todo, In Progress, Done, or Canceled. The cloud schema stores these rows in `task_statuses` and stores a task's current status as `tasks.status_id`. The local schema currently stores denormalized fields on `tasks`; this plan adds a local `task_statuses` table and a local `tasks.status_id` field so local Tasks match the current UI model.

## Plan of Work

First, update the local DB schema in `packages/local-db/src/schema/schema.ts`. Import `real` from `drizzle-orm/sqlite-core` because cloud status `position` and `progressPercent` are numeric and can be non-integer. Add a `TaskStatusType` type with the allowed status types: `backlog`, `unstarted`, `started`, `completed`, and `canceled`. Add a `taskStatuses` SQLite table named `task_statuses` with columns `id`, `organization_id`, `name`, `color`, `type`, `position`, `progress_percent`, `external_provider`, `external_id`, `created_at`, and `updated_at`. Add indexes for organization and type. Add a uniqueness rule for local default statuses if Drizzle's SQLite DSL supports the needed expression; otherwise enforce uniqueness in the seeding helper.

In the same schema file, add cloud-compatible columns to the existing local `tasks` table: `status_id`, `assignee_external_id`, `assignee_display_name`, and `assignee_avatar_url`. Keep existing legacy columns `status`, `status_color`, `status_type`, and `status_position` for now. Add indexes for `status_id`, `creator_id`, `external_provider`, and `assignee_external_id`. Do not remove or rename existing columns in this milestone.

Generate the local SQLite migration from the schema change. Use the package's Drizzle command from `packages/local-db`; do not hand-edit generated migration SQL. The migration should be reviewed after generation only to confirm it adds the expected tables, columns, and indexes.

Second, implement local Tasks domain helpers in a new folder `apps/desktop/src/lib/trpc/routers/tasks-local/`. Put the router in `tasks-local.ts` and export it from `index.ts`, following existing router folder patterns such as `apps/desktop/src/lib/trpc/routers/projects/`. Add helper functions in the same folder or nested `utils/` files only when they are used by multiple procedures.

The helper layer must define the same default statuses as `packages/db/src/seed-default-statuses.ts`: Backlog, Todo, In Progress, Done, and Canceled, with colors `#95a2b3`, `#e2e2e2`, `#f2c94c`, `#0e9f6e`, and `#95a2b3`, and positions 0 through 4. Implement `ensureLocalIdentity()` to insert or preserve the local organization, local user, and local organization member. Implement `ensureDefaultStatuses({ organizationId })` to insert missing default statuses and return all statuses ordered by type/position. Implement row mapping helpers that convert SQLite snake_case rows into the camelCase shape the renderer already expects from `@superset/db/schema` types.

The local router must expose at least these procedures:

    health: query(() => ({ mode: "local" }))
    listTasks: query({ organizationId }) => SelectTask[]
    listTaskStatuses: query({ organizationId }) => SelectTaskStatus[]
    listUsers: query({ organizationId }) => SelectUser[]
    listOrganizations: query() => SelectOrganization[]
    listIntegrationConnections: query({ organizationId }) => []
    ensureDefaultStatuses: mutation({ organizationId? }) => SelectTaskStatus[]
    createFromUi: mutation({ title, description, statusId, priority, assigneeId }) => { task, txid }
    byId: query(string) => SelectTask | null
    bySlug: query(string) => SelectTask | null
    update: mutation({ id, changes }) => { task, txid }
    delete: mutation(string) => { txid }
    subscribe: subscription({ organizationId, collection }) => observable events

The `subscribe` procedure must use `observable` from `@trpc/server/observable`, not an async generator, because `trpc-electron` subscriptions only support observables. Use a small `EventEmitter` in the local router module to publish task, status, user, organization, and integration-connection changes after local DB writes. For simplicity, each write can emit an event that causes the renderer collection to reload that collection from the local router. If implementing fine-grained events, emit `insert`, `update`, or `delete` messages with the mapped row.

The `createFromUi` mutation must call `ensureLocalIdentity()` and `ensureDefaultStatuses()` first. If no status id is provided, choose Backlog if present, otherwise the first ordered status. Generate a local slug such as `TASK-1`, `TASK-2`, and so on by scanning existing non-deleted local task slugs for the highest numeric suffix. Insert the task with `priority` defaulting to `none`, `labels` defaulting to an empty array, `creator_id` set to the local user id, `organization_id` set to the local organization id, `created_at` and `updated_at` set to the current ISO timestamp, and legacy `status*` columns populated from the chosen status. Return `{ task, txid }`, where `txid` can be a generated UUID or timestamp string used only to satisfy collection mutation contracts.

The `update` mutation must allow the fields used by current Tasks UI: `title`, `description`, `statusId`, `priority`, `assigneeId`, `assigneeExternalId`, `assigneeDisplayName`, `assigneeAvatarUrl`, `estimate`, `dueDate`, `labels`, `branch`, `prUrl`, `startedAt`, and `completedAt`. If `statusId` changes, verify the status exists in the local organization and update both `status_id` and legacy `status*` columns. Always update `updated_at`. The `delete` mutation should soft-delete by setting `deleted_at` and `updated_at`, matching the existing Tasks queries that filter out deleted tasks.

Register the router in `apps/desktop/src/lib/trpc/routers/index.ts` by importing `createTasksLocalRouter` and adding `tasksLocal: createTasksLocalRouter()` to `createAppRouter`.

Third, add local collection support in the renderer. In `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`, split the current `createOrgCollections` into a cloud path and a local path. The cloud path should preserve the existing Electric collections and `apiClient.task.*` mutation handlers. The local path should create TanStack DB collections for `tasks`, `taskStatuses`, `users`, `organizations`, and `integrationConnections` backed by `electronTrpcClient.tasksLocal.*`. Import `electronTrpcClient` from `apps/desktop/src/renderer/lib/trpc-client.ts`. Do not import local SQLite or Node.js modules in renderer code.

The local collection implementation should use `createCollection` with a custom `sync` config rather than `electricCollectionOptions`. On sync start, call the matching local tRPC list procedure, call `begin`, write each row to the collection, call `commit`, then call `markReady`. Subscribe to `tasksLocal.subscribe` for that collection and either apply incoming row operations or reload the collection by writing the latest list. For mutation handlers, call local tRPC procedures and return `{ txid }`. For `tasks`, `onInsert` is optional because the New issue dialog will use `tasksLocal.createFromUi`; still implement `onUpdate` and `onDelete` because most UI edits use `collections.tasks.update/delete`. For `taskStatuses`, no renderer mutation handlers are required in this plan.

In local mode, `integrationConnections` must be a safe empty local collection so `TasksView` can query it without touching Electric. This prevents the Linear CTA check from making cloud requests. In local mode, `organizations` must contain the local organization row so `CreateTaskDialog` can display a label. In local mode, `users` must contain the local user row so assignee pickers can show at least the local user and support clearing assignee.

Fourth, update `CollectionsProvider.tsx` to decide Tasks mode. Add a small helper such as `getTasksDataMode({ activeOrganizationId, jwt })` in `collections.ts` or a sibling file. The result is `"cloud"` only when `session?.session?.activeOrganizationId` exists and `getJwt()` returns a token; otherwise it is `"local"`. In local mode, use `MOCK_ORG_ID` as the organization id passed to local collections. Cache keys must include both organization id and mode, for example `${mode}:${organizationId}`, so a user who signs in later does not reuse local collections as cloud collections. `preloadCollections` must accept the mode and must not preload cloud Electric collections when mode is local.

Expose the mode on the collections context as `tasksMode: "local" | "cloud"` and `activeOrganizationId`. Existing consumers that only need collections should keep working. New branching code in CreateTaskDialog and task detail fallback can read `collections.tasksMode`.

Fifth, update the direct cloud call sites in Tasks UI. In `CreateTaskDialog.tsx`, keep the current cloud behavior when `collections.tasksMode === "cloud"`. In local mode, call `electronTrpcClient.tasksLocal.ensureDefaultStatuses` when the dialog opens and no statuses are present, and call `electronTrpcClient.tasksLocal.createFromUi` in `handleCreate`. After local creation succeeds, navigate to `/tasks/$taskId` with the new local task id exactly as cloud mode does. Keep the existing status picker empty state, because it is useful if seeding fails.

In `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.tsx`, branch the fallback query. In cloud mode, keep `apiTrpcClient.task.byId` and `apiTrpcClient.task.bySlug`. In local mode, call `electronTrpcClient.tasksLocal.byId` or `electronTrpcClient.tasksLocal.bySlug`. Do not let a local no-cloud route call `api.superset.sh` while showing `Loading task...` or `Syncing task...`.

Review all files returned by a search for `apiTrpcClient.task` under the Tasks route. At the end, the only remaining `apiTrpcClient.task.*` calls under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks` must be inside explicit cloud-mode branches.

Sixth, update or add tests. Prefer focused tests near changed code. Add source-level regression tests under `TasksView` or `CreateTaskDialog` to assert that local mode uses `electronTrpcClient.tasksLocal.ensureDefaultStatuses` and `electronTrpcClient.tasksLocal.createFromUi`, and that cloud API calls are guarded by a `tasksMode === "cloud"` branch. Add tests for local helper functions in `apps/desktop/src/lib/trpc/routers/tasks-local/`, especially default status ordering, slug generation, local row mapping, and soft delete behavior. If direct router tests are difficult because `localDb` is a singleton, keep DB mutation logic in pure helper functions where possible and test those helpers.

Finally, validate manually with desktop automation. Start the desktop app in development mode with the package script so `DESKTOP_AUTOMATION_PORT=9322` is set. On Apple Silicon, use the arm64 Node flow to avoid native module architecture crashes. Confirm that opening `/tasks` with no cloud session shows the Tasks UI, the New issue status dropdown contains default statuses, creating a task navigates to its detail page, edits persist after route changes, board drag updates status, delete hides the task, and console/network logs show no requests to `https://api.superset.sh` for Tasks flows in local mode.

## Concrete Steps

From the repository root, edit the local schema:

    packages/local-db/src/schema/schema.ts

Add the `taskStatuses` table and additive `tasks` columns described above. Then generate a migration from the package directory:

    cd packages/local-db
    bun run generate -- --name=local_first_tasks

Expected result: Drizzle creates a new numbered SQL migration under `packages/local-db/drizzle/` and updates its metadata. Review it, but do not hand-edit it.

Create the local router files:

    apps/desktop/src/lib/trpc/routers/tasks-local/index.ts
    apps/desktop/src/lib/trpc/routers/tasks-local/tasks-local.ts

If helper logic grows, create narrowly scoped helper files under:

    apps/desktop/src/lib/trpc/routers/tasks-local/utils/

Register the router in:

    apps/desktop/src/lib/trpc/routers/index.ts

Update renderer collection branching in:

    apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts
    apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx

Update direct Tasks cloud call sites in:

    apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx
    apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.tsx

Run targeted searches after editing:

    # Use Grep tool or ripgrep locally if running manually.
    rg "apiTrpcClient\.task" apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks
    # Expected: every remaining result is inside an explicit cloud-mode branch.

Run validation from the repository root:

    bun run typecheck
    # Expected: no TypeScript errors.

    bun run lint
    # Expected: no new lint errors from changed files. If unrelated pre-existing lint errors appear, capture them and run Biome on changed files.

    bun test apps/desktop/src/lib/trpc/routers/tasks-local
    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks
    # Expected: all targeted tests pass.

Start desktop dev for manual validation. On Apple Silicon, prefer:

    arch -arm64 zsh -lc 'source ~/.nvm/nvm.sh && nvm use 22 && bun --cwd apps/desktop dev'

Expected result: the desktop app starts in development mode, and Chromium DevTools Protocol is reachable at `http://127.0.0.1:9322/json/version` because the `apps/desktop` `dev` script sets `DESKTOP_AUTOMATION_PORT=9322`.

## Validation and Acceptance

A no-cloud local user can open Tasks without signing in. The page must not remain stuck on a spinner. The table view may show `No tasks found` before a task exists, but the top bar and New issue button must be usable.

Opening New issue in local mode shows the default statuses Backlog, Todo, In Progress, Done, and Canceled. The status dropdown must not be blank. The dialog must not make a request to `https://api.superset.sh/api/trpc/task.ensureDefaultStatuses` in local mode.

Creating a local task with a title and optional description succeeds. The app navigates to the task detail route. The visible slug should be a local slug such as `TASK-1`, and refreshing or navigating away and back should still show the task because it is persisted in local SQLite.

Editing the local task detail title and description persists. Changing status from the detail sidebar persists. Changing priority persists. Changing assignee to the local user or to no assignee persists.

The table status cell, priority cell, assignee cell, and context menu all work in local mode. The board view shows one column per default status and drag-and-drop between columns updates the local task's status.

Deleting a task from the context menu or task action menu soft-deletes it. The task disappears from list and board queries because existing queries filter `deletedAt` / `deleted_at` as null.

Run in Workspace still works for selected local tasks. It already uses local project/workspace/terminal tRPC and builds the agent launch request from the task object; local tasks must include `id`, `slug`, `title`, `description`, `priority`, `status.name`, and `labels` so this flow has the same inputs as cloud tasks.

In local mode, exercising all Tasks flows above should produce no network calls to `https://api.superset.sh` or the Electric proxy for Tasks data, statuses, users, organizations, or integration connections. Cloud-only parts of the app outside Tasks may still use cloud services and are outside this acceptance criterion.

In cloud mode, existing behavior remains: `collections.tasks` and `collections.taskStatuses` use Electric, collection mutations call cloud `apiClient.task.*`, `CreateTaskDialog` calls cloud `apiTrpcClient.task.*`, and task-detail fallback uses cloud by-id/by-slug queries.

## Idempotence and Recovery

The local identity seeding and default status seeding must be idempotent. Running `ensureLocalIdentity()` or `ensureDefaultStatuses()` multiple times must not create duplicate organizations, users, organization members, or default statuses.

The local SQLite migration is additive. If migration generation fails, revert only the schema edits in `packages/local-db/src/schema/schema.ts` and rerun generation. Do not manually patch generated migration files.

The local router's create/update/delete procedures should be safe to retry. Create uses a unique generated slug; if a slug collision occurs, regenerate with the next numeric suffix. Update checks that the target task exists and throws `NOT_FOUND` if it does not. Delete is soft-delete and can treat an already deleted task as success or `NOT_FOUND`, but the chosen behavior must be consistent and covered by tests.

If a user signs in after creating local tasks, local tasks remain in local SQLite and cloud Tasks use cloud collections. This plan does not merge local tasks into cloud. If migration from local to cloud is desired later, write a separate plan.

## Artifacts and Notes

The current cloud Tasks collection in `CollectionsProvider/collections.ts` is shaped like this:

    const tasks = createIndexedCollection(
      electricCollectionOptions<SelectTask>({
        id: `tasks-${organizationId}`,
        shapeOptions: {
          url: electricUrl,
          params: { table: "tasks", organizationId },
          headers: electricHeaders,
          columnMapper,
        },
        getKey: (item) => item.id,
        onInsert: async ({ transaction }) => apiClient.task.create.mutate(...),
        onUpdate: async ({ transaction }) => apiClient.task.update.mutate(...),
        onDelete: async ({ transaction }) => apiClient.task.delete.mutate(...),
      }),
    );

The local replacement must preserve the same `Collection<SelectTask>` surface for Tasks UI consumers, but its sync and mutation handlers must call `electronTrpcClient.tasksLocal.*`.

The current local `tasks` table has legacy status columns:

    status: text("status").notNull(),
    status_color: text("status_color"),
    status_type: text("status_type"),
    status_position: integer("status_position"),

The renderer expects a normalized relation:

    tasks.statusId joins taskStatuses.id

This is why the local migration must add `task_statuses` and `tasks.status_id` rather than only filling the legacy columns.

## Interfaces and Dependencies

The new local router is part of the Electron app router. Register it so renderer code can call:

    electronTrpc.tasksLocal.ensureDefaultStatuses.useMutation(...)
    electronTrpcClient.tasksLocal.createFromUi.mutate(...)
    electronTrpcClient.tasksLocal.byId.query(...)
    electronTrpcClient.tasksLocal.bySlug.query(...)

The router factory should follow this shape:

    export const createTasksLocalRouter = () => {
      return router({
        listTasks: publicProcedure.input(...).query(...),
        listTaskStatuses: publicProcedure.input(...).query(...),
        createFromUi: publicProcedure.input(...).mutation(...),
        update: publicProcedure.input(...).mutation(...),
        delete: publicProcedure.input(z.string()).mutation(...),
        subscribe: publicProcedure.input(...).subscription(({ input }) => {
          return observable<LocalTasksEvent>((emit) => {
            const handler = (event: LocalTasksEvent) => emit.next(event);
            events.on(input.collection, handler);
            return () => events.off(input.collection, handler);
          });
        }),
      });
    };

Use `publicProcedure` because this router is local to the desktop process and does not require a cloud session. Do not use cloud protected procedures for local mode.

The local router depends on:

    apps/desktop/src/main/lib/local-db/index.ts
    packages/local-db/src/schema/schema.ts
    @trpc/server/observable
    drizzle-orm query helpers such as eq, and, isNull, desc
    crypto.randomUUID or uuid helpers for ids and txids

Renderer local collection code depends on:

    apps/desktop/src/renderer/lib/trpc-client.ts
    @tanstack/react-db createCollection and BasicIndex

Renderer code must not depend on `better-sqlite3`, `node:fs`, `node:path`, or `apps/desktop/src/main` modules.

## Revision Notes

2026-04-25: Created this plan because the user wants Tasks and all Tasks-related flows to work completely without the original hosted API backend, while keeping unrelated cloud-only systems out of scope.

2026-04-25: Updated progress after adding local SQLite task status schema, additive task fields, generated migration, and the first `tasksLocal` Electron tRPC router implementation.

2026-04-26: Updated progress, discoveries, and outcomes after wiring local collections/UI branching, adding tests, running validation, and completing desktop automation smoke coverage.
