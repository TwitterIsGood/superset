# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after edits that affect source files.
- Run `bun run lint` before pushing; warnings fail CI.
- Run focused tests for touched packages and `bun run typecheck` for broad type changes.
- Keep tests co-located with logic-heavy components, hooks, parsers, stores, and utilities.
- For desktop-facing flows that cross auth, routing, Electron IPC, persisted state, host-service, terminal, or multi-pane runtime behavior, define and run Desktop Automation CLI acceptance per `.trellis/spec/guides/desktop-acceptance-tdd.md`, or record why lower-level tests are sufficient.

## Large Sidebar And Pane Performance Contract

### 1. Scope / Trigger

- Applies when editing desktop workspace sidebars, pane tabs, file trees,
  changes lists, or any route-local surface that can render hundreds of rows or
  run expensive hooks on tab switches.

### 2. Signatures

- Lazy tab boundary: `React.lazy(() => import("./HeavyTab"))`.
- Keep-warm trigger: large data threshold plus visited-tab state scoped by
  `workspaceId`.
- Virtualized list: a shared scroll container with a stable attribute such as
  `data-changes-scroll-container` and row virtualization via
  `@tanstack/react-virtual`.

### 3. Contracts

- Preserve first-load lazy imports unless a task explicitly accepts startup
  regression with measurement.
- Do not fix repeat tab switching by eagerly mounting every heavy tab at route
  load.
- Large lists must virtualize visible rows; memoizing grouped data is not enough
  if thousands of DOM rows still mount.
- If a virtualized warm tab must stay mounted, do not hide it with
  `display:none` when return latency depends on retained row measurement. Use a
  bounded hidden layer (`absolute`, `invisible`, `pointer-events-none`,
  `aria-hidden`, `inert`) and prove the DOM/memory trade-off is acceptable.
- Hidden warm content must not remain focusable or pointer-interactive.

### 4. Validation & Error Matrix

- Heavy tab imported by the sidebar shell before first use -> startup regression.
- Repeated cached tab switch creates thousands of row nodes -> virtualization
  failure.
- Cached switch has a single long task above the accepted budget -> inspect
  hidden-layer strategy, row component weight, and virtualizer measurement.
- Hidden warm tab can receive focus/clicks -> accessibility and interaction
  regression.

### 5. Good/Base/Bad Cases

- Good: first-load shell keeps heavy tabs lazy; large visited `Files` /
  `Changes` tabs stay warm only above a threshold; repeated cached switches are
  measured with RAF delay and long-task data.
- Base: small repos keep the simpler active-only rendering path.
- Bad: deleting lazy imports to fix a large repo, or using screenshots only to
  claim a performance fix.

### 6. Tests Required

- Source/unit test that guards lazy imports and keep-warm thresholds.
- Source/unit test that guards virtualization and the shared scroll container.
- Desktop Automation measurement on a large workspace with recorded RAF delay,
  long-task max, visible row count, DOM node count, screenshots, and renderer
  console logs.

### 7. Wrong vs Correct

#### Wrong

```tsx
{activeTabDef?.content}
```

This can remount a heavy tab and recreate large row DOM on every switch.

#### Correct

```tsx
<div aria-hidden={!isActive} inert={isActive ? undefined : true}>
  <VirtualizedRows />
</div>
```

Use this only for bounded, threshold-gated warm tabs; keep first-load lazy
imports intact.

## Review Checklist

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.
- Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.
- Prefer non-brittle acceptance assertions: route/hash state, accessible labels/roles, persisted files/state, service probes, Desktop Automation CLI `wait-for` checks, and screenshot/report artifacts. Avoid CSS class or deep DOM selectors for desktop gates.

## Clone Progress Contract

- Scope / trigger: desktop clone UX changes must cover both entry points, not only workspace creation. `New Workspace` can use workspace creation progress, while `Add repository -> Clone a repository` uses `project.create` through `NewProjectModal`.
- Signature: the project clone path passes `progressRequestId` into `client.project.create.mutate(...)` and listens for `project:create-progress` events on the host-service event bus keyed by the same request id.
- Contract: visible progress must appear in the modal while it is open, and a persistent toast must continue updating after the user hides the modal. Hiding the modal must not cancel the clone.
- Validation / errors: clone failures should replace the progress toast with a readable error and should not leak raw SQL error envelopes into the renderer UI.
- Good: E2E the actual `Add repository -> Clone from URL` modal with a large enough repo to observe `Receiving objects` progress, then click `Hide` and verify progress continues in the toast.
- Bad: only testing `New Workspace` creation progress and assuming the repository modal uses the same path.
- Tests required: add or update a source/unit test that asserts `NewProjectModal` passes `progressRequestId`, subscribes to `project:create-progress`, renders progress text/percent, and exposes `Hide` while work continues.

## Clone Stop Contract

### 1. Scope / Trigger

- Trigger: desktop `Add repository -> Clone from URL` needs a user-visible Stop action for an in-progress clone.
- Scope: Stop is explicit cancellation. Hiding the modal keeps the clone running in the background; Stop cancels the host-service `git clone`, removes the partial target directory, and leaves the form retryable when the modal is still open.
- Pause/resume is out of scope; do not add process suspension or resumable clone state unless a new PRD requires it.

### 2. Signatures

- Start clone: `client.project.create.mutate({ name, progressRequestId, mode: { kind: "clone", parentDir, url } })`.
- Stop clone: `client.project.cancelCreate.mutate({ progressRequestId })`.
- Stop result: `{ status: "canceling" } | { status: "not_found" }`.
- Event stages include `canceling` and `canceled` in addition to the existing project create progress stages.

### 3. Contracts

- The renderer must reuse the same `progressRequestId` for `project.create`, `project.cancelCreate`, the progress toast id, and `project:create-progress` subscription filtering.
- The host-service cancellation registry is process-local and cancelable only during the clone phase. After the clone resolves and project registration begins, stop requests should return `not_found` instead of deleting registered work.
- `cloneRepoInto` owns the claimed target directory and is responsible for removing it on cancellation. Renderer state must not try to remove clone directories directly.
- `NewProjectModal` should show Stop in the modal while the clone is cancelable, show a Stop action in the progress toast for hidden/background clones, and show a disabled/stopping state after Stop is requested.
- Renderer state must only switch `progress.stage` to `canceling` after `project.cancelCreate` confirms `{ status: "canceling" }` or after the matching progress event arrives. A `{ status: "not_found" }` stop response must clear local stopping UI instead of leaving the modal stuck on "Stopping".

### 4. Validation & Error Matrix

- Active clone + Stop -> emit `canceling`, kill the git process tree, remove the partial target directory, emit `canceled`, and surface "Clone stopped".
- Stop clicked twice -> the second request is ignored in the renderer or returns `canceling` / `not_found`; it must not show a generic create failure.
- Stop after clone phase -> return `not_found`; do not delete the cloned repo or any registered project/workspace rows.
- Stop after clone phase in the renderer -> do not keep a locally-forced `canceling` progress state; restore/keep the latest real progress and make the UI retryable or allow normal completion.
- Host-service unavailable while stopping -> show a stop-specific failure toast and leave the current progress state visible.
- Real clone failure -> keep the existing failed progress behavior and call the parent error path; do not classify real git failures as canceled.

### 5. Good/Base/Bad Cases

- Good: start a real clone from `Add repository -> Clone from URL`, observe modal progress plus Stop, click Stop, verify form values remain, Clone is enabled again, no `git clone` process remains, the partial directory is gone, and no local/cloud project row exists.
- Base: start the same clone, click Hide, then Stop from the toast. Verify the clone stops without reopening the modal and cleanup still occurs.
- Bad: only dismissing the modal, only hiding the toast, or only setting React state while the host-service git process continues running.

### 6. Tests Required

- Host-service clone utility test: abort signal kills an in-progress clone and removes the partial target directory.
- Router/source or integration test: `project.cancelCreate` is exposed by `progressRequestId`, registers only during clone, and gracefully returns `not_found` after the cancelable phase.
- Event bus/workspace-client tests: `canceling` / `canceled` progress payloads dispatch by request id.
- Renderer test: `NewProjectModal` wires Stop to `client.project.cancelCreate`, does not call `onError` for "Clone stopped", keeps Hide behavior, and exposes modal/toast Stop actions.
- Desktop Automation CLI acceptance: use a disposable clone parent under `.tmp`, test both modal Stop and hidden toast Stop, save screenshots, and verify no process/directory/DB residue.

### 7. Wrong vs Correct

#### Wrong

```ts
setWorking(false);
toast.dismiss(toastId);
```

This only hides UI. The host-service `git clone` can keep running and leave a partial directory.

#### Correct

```ts
await client.project.cancelCreate.mutate({ progressRequestId });
```

Host-service owns cancellation, kills the process tree, cleans the claimed target directory, and reports `canceled` through `project:create-progress`.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
