# Remove the desktop startup sign-in gate

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template used by `/create-plan`.

## Purpose / Big Picture

The desktop app currently blocks first launch behind a `Sign in to get started` screen and then requires a signed-in session with an active organization before the main workspace UI can render. After this change, a user who starts the desktop app can enter the local workspace experience immediately without signing in or creating an organization. The user-visible proof is that launching the desktop app loads `/workspace` or the workspace welcome flow directly, with no sign-in page and no forced create-organization page.

This plan intentionally removes the startup authentication gate only. It keeps non-startup authentication infrastructure, such as provider OAuth for AI model accounts and existing token-aware API helpers, so cloud-specific functionality can still be revisited separately without blocking local desktop usage.

## Assumptions

The phrase "首页直接让用户进来" means the root route should keep sending users to the workspace entry point at `/workspace`, and the workspace entry point should either restore the last local workspace or show the existing local welcome/onboarding screen when no workspace exists.

The approved scope is "启动门禁": remove the startup sign-in page, the authenticated route guard, and the forced organization creation redirect. Do not delete every auth utility in the app, because some auth-adjacent code also supports provider connections or cloud integrations that are outside this startup gate.

The desktop app can use `MOCK_ORG_ID` from `shared/constants` as the local anonymous organization identifier when there is no signed-in Superset account. This constant is already used in development bypass paths and lets local TanStack DB collections initialize without a remote organization.

## Open Questions

There are no open questions after clarification. The user selected the "启动门禁" scope, which means the implementation should focus on making startup enter the app directly while preserving non-startup login/provider infrastructure.

## Progress

- [x] (2026-04-25 15:50 local) Located the startup sign-in UI in `apps/desktop/src/renderer/routes/sign-in/page.tsx`.
- [x] (2026-04-25 15:50 local) Located the root redirect in `apps/desktop/src/renderer/routes/page.tsx`, which already sends `/` to `/workspace`.
- [x] (2026-04-25 15:50 local) Located the route gate in `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`, which redirects unauthenticated users to `/sign-in` and users without `activeOrganizationId` to `/create-organization`.
- [x] (2026-04-25 15:50 local) Located `AuthProvider` in `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx`, which currently delays rendering while token hydration runs.
- [x] (2026-04-25 15:50 local) Located `CollectionsProvider` in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`, which currently returns `null` without an active organization.
- [x] (2026-04-25 15:50 local) Clarified scope with the user: remove the startup gate, not every auth/provider feature.
- [x] (2026-04-25 local) Implemented startup gate removal in the authenticated desktop layout; missing Superset account, token, and active organization no longer redirect startup to `/sign-in` or `/create-organization`.
- [x] (2026-04-25 local) Updated `CollectionsProvider` to use `MOCK_ORG_ID` when no signed-in active organization exists.
- [x] (2026-04-25 local) Made `AuthProvider` render children immediately while preserving background token hydration and token-change subscription behavior.
- [x] (2026-04-25 local) Neutralized the sign-in route by replacing it with an immediate `/workspace` redirect and removed the sign-in-only session recovery hook.
- [x] (2026-04-25 local) Adjusted anonymous account/menu UI so remote account profile, organization management, organization switching, and sign-out controls are hidden when no Superset session exists.
- [x] (2026-04-25 local) Regenerated the TanStack Router route tree via `bun run generate:routes`; no route tree diff was produced because the sign-in route remains as a redirect.
- [x] (2026-04-25 local) Validated desktop typecheck, desktop tests, route generation, and focused searches. Root lint only reports pre-existing `.claude/settings.json` formatting, which is unrelated and intentionally untouched.
- [x] (2026-04-25 local) Filled in Outcomes & Retrospective.

## Surprises & Discoveries

- Observation: The app already routes `/` to `/workspace`, so the root route does not need a new destination.
  Evidence: `apps/desktop/src/renderer/routes/page.tsx` renders `<Navigate to="/workspace" replace />`.

- Observation: Removing only the visible sign-in page is not enough, because `_authenticated/layout.tsx` also redirects unauthenticated users to `/sign-in` and redirects users without an active organization to `/create-organization`.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` has redirects at the unauthenticated and missing-organization checks.

- Observation: The workspace UI depends on `CollectionsProvider`, and `CollectionsProvider` currently returns `null` if no active organization exists.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` computes `collections` from `activeOrganizationId` and returns `null` when collections are absent.

## Decision Log

- Decision: Remove only the desktop startup authentication gate and keep non-startup auth infrastructure.
  Rationale: The user selected the "启动门禁" scope. This gives the desired local-first startup behavior without creating a broad, risky rewrite of cloud account, provider OAuth, or API token code.
  Date/Author: 2026-04-25 / Claude

- Decision: Use `MOCK_ORG_ID` as the fallback local organization id when there is no signed-in session.
  Rationale: The dashboard and local collections already expect an organization id. This existing constant is already used by the development bypass path and provides a minimal way to let local collections initialize without forcing account creation.
  Date/Author: 2026-04-25 / Claude

- Decision: Keep the root route destination as `/workspace`.
  Rationale: The current root route already points at the workspace entry route, and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx` already handles restoring the last workspace or sending users to `/welcome` when no workspace exists.
  Date/Author: 2026-04-25 / Claude

## Outcomes & Retrospective

Implemented the approved startup-gate removal without deleting non-startup auth/provider infrastructure. Changed files:

- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`: removed the startup auth/session/token/offline checks and the redirects to `/sign-in` and `/create-organization`, leaving the existing desktop provider tree and subscriptions intact.
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`: changed active organization selection to `session?.session?.activeOrganizationId ?? MOCK_ORG_ID` so local anonymous startup can initialize collections.
- `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx`: removed the full-screen auth hydration loader and now renders children immediately while token hydration and JWT refresh continue in the background.
- `apps/desktop/src/renderer/routes/sign-in/page.tsx`: replaced the visible OAuth sign-in screen with an immediate redirect to `/workspace`.
- `apps/desktop/src/renderer/routes/sign-in/hooks/useSessionRecovery/`: removed the sign-in-only session recovery hook.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown/OrganizationDropdown.tsx`: hid remote organization management, organization switching, and sign-out controls unless a Superset user session exists; anonymous users see a local workspace label.
- `apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx`: hid remote profile editing and sign-out controls for anonymous local usage and shows a local-desktop account message instead.
- `apps/desktop/plans/20260425-1550-remove-startup-sign-in-gate.md`: updated progress and outcomes.

Validation run:

- `cd apps/desktop && bun run generate:routes` passed.
- `cd apps/desktop && bun run typecheck` passed. This also ran `generate:icons` and `generate:routes` via `pretypecheck`.
- `cd apps/desktop && bun test` passed: 1830 pass, 0 fail.
- Focused searches found no `Sign in to get started`, no `_authenticated` startup redirect to `/sign-in`, and no remaining `useSessionRecovery` usage under `apps/desktop/src`. The `/sign-in` route remains only as a redirect, and `create-organization` still has its own non-startup unauthenticated fallback.
- `cd /Users/biangwua/Documents/biang/小玩意/superset && bun run lint` failed only on pre-existing `.claude/settings.json` formatting. Changed source files no longer appear in lint output, and `.claude/settings.json` was intentionally not touched per user instruction.

Manual Electron startup verification was not run in this pass. Based on static validation, `/` continues to route to `/workspace`; `_authenticated/layout.tsx` no longer blocks anonymous startup; and `CollectionsProvider` now falls back to `MOCK_ORG_ID`, so the app should enter the existing workspace or welcome flow without showing sign-in or forcing organization creation.

## Context and Orientation

This work affects the desktop app only, under `apps/desktop`. The renderer process is the browser-like React UI inside Electron. The main process is the Node.js side of Electron. This plan primarily changes renderer routing and startup behavior. No new Electron IPC channel is required; IPC means inter-process communication between renderer and main, and this change does not need a new renderer-to-main request.

The relevant route files use TanStack Router file-based routing. In this repository, files under `apps/desktop/src/renderer/routes` define routes, and `apps/desktop/src/renderer/routeTree.gen.ts` is generated route metadata. If route files are deleted, run the route generator so `routeTree.gen.ts` stops importing deleted files.

The current route structure uses a pathless `_authenticated` folder as a layout group. "Pathless" means the folder participates in route nesting and layout composition without adding `_authenticated` to the URL. The public URL `/workspace` is implemented by a file under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx`.

The current startup chain is:

    / -> /workspace
    /workspace -> renders inside /_authenticated layout
    /_authenticated/layout.tsx -> checks authClient.useSession()
    if no session -> /sign-in
    if no active organization -> /create-organization

The files to inspect and edit are:

`apps/desktop/src/renderer/routes/page.tsx` already redirects `/` to `/workspace` and should remain functionally unchanged unless implementation reveals an issue.

`apps/desktop/src/renderer/routes/_authenticated/layout.tsx` is the central startup gate. It imports `authClient`, `getAuthToken`, `env`, `Button`, `Spinner`, `Navigate`, and `HiOutlineWifi` for the current sign-in/offline/organization guard. The implementation should remove the guard paths that redirect to `/sign-in` and `/create-organization`.

`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` initializes local database collections for the active organization. It currently falls back to `MOCK_ORG_ID` only when `env.SKIP_ENV_VALIDATION` is true. The implementation should make unauthenticated local desktop usage also fall back to `MOCK_ORG_ID`.

`apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` currently blocks rendering while it hydrates any stored auth token. After this change, token hydration should be non-blocking so local startup is not delayed behind auth. Keep the subscription and token hydration behavior if it remains useful, but do not return a full-screen auth loading state before rendering children.

`apps/desktop/src/renderer/routes/sign-in/page.tsx` contains the visible `Sign in to get started` UI. Under the approved scope, remove this route or replace it with an immediate redirect to `/workspace` if deletion causes too much route churn. Deletion is preferred if no remaining code needs the page.

`apps/desktop/src/renderer/routes/sign-in/hooks/useSessionRecovery/useSessionRecovery.ts` is only used by the sign-in page and should be removed if the sign-in route is removed.

`apps/desktop/src/renderer/routes/create-organization/page.tsx` is the forced organization creation page. Since the approved scope is startup gate removal, do not delete this page unless it becomes unused and clearly safe. The critical change is to stop automatically redirecting users to it during startup.

`apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx` and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown/OrganizationDropdown.tsx` show account/sign-out UI. They do not block startup, but they should not show broken sign-out or account-management actions when there is no signed-in session. Adjust them minimally if validation shows anonymous startup exposes confusing or broken account controls.

## Plan of Work

First, update `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` so it no longer treats the absence of a Superset account as a blocker. Remove the `isPending`, `isRefetching`, `refetch`, `hasLocalToken`, `isOnline`, and `isSignedIn` gate logic if they are no longer needed. Remove the redirects to `/sign-in` and `/create-organization`. Keep the non-auth layout behavior: agent hook listeners, update listeners, notification subscriptions, menu subscriptions, workspace initialization subscriptions, global providers, and the dashboard outlet. Define `activeOrganizationId` as `session?.session?.activeOrganizationId ?? MOCK_ORG_ID`, or remove the local variable entirely if no longer needed in this file.

Second, update `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`. Keep `authClient.useSession()` so signed-in users can still use their real active organization when it exists. Change the active organization calculation from `env.SKIP_ENV_VALIDATION ? MOCK_ORG_ID : session?.session?.activeOrganizationId` to a local-first fallback such as `session?.session?.activeOrganizationId ?? MOCK_ORG_ID`. Remove the `env` import if it becomes unused. This ensures `CollectionsProvider` always creates collections for local desktop usage and no longer returns `null` on first launch just because there is no remote session.

Third, update `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` so auth hydration is non-blocking. Keep loading any saved token and listening for token changes, because that preserves existing signed-in users and provider-aware API behavior. Remove the full-screen loading return that shows `SupersetLogo`, and render children immediately. If the `SupersetLogo` import becomes unused, remove it. Ensure JWT refresh only runs when a token has been hydrated or when the existing logic can safely call `authClient.token()` without creating visible errors for anonymous users. The result should be that auth work can happen in the background but cannot block local startup.

Fourth, remove the sign-in route UI. Prefer deleting `apps/desktop/src/renderer/routes/sign-in/page.tsx` and the sign-in-only hook folder `apps/desktop/src/renderer/routes/sign-in/hooks/useSessionRecovery/`. Also remove `apps/desktop/src/renderer/routes/sign-in/components/SupersetLogo/` if no other file imports it. If route deletion produces excessive unrelated route-tree churn or hidden references, replace the sign-in page with a minimal redirect to `/workspace` as an intermediate step, then revisit deletion after tests pass.

Fifth, clean up visible startup-login remnants that become broken in anonymous mode. In `OrganizationDropdown`, if `session?.user` is absent, do not show user email, switch-organization, manage-members, or sign-out actions that require a remote account. Keep settings, docs, feedback, social links, and local desktop actions. In `AccountSettings`, if there is no `session?.user`, avoid rendering profile editing and sign-out controls that call remote account APIs. Show a small local-desktop message or simply omit those sections, using existing settings-search visibility helpers so search does not expose removed sign-out behavior.

Sixth, regenerate TanStack Router output if route files changed. From `apps/desktop`, run the existing route generation script:

    bun run generate:routes

Review `apps/desktop/src/renderer/routeTree.gen.ts` to ensure it no longer imports deleted sign-in files if the sign-in route was deleted.

Seventh, remove imports and code made unused by these edits. Use the existing project rules: prefer editing existing files, keep one component per file, avoid new abstractions, and do not introduce `any` or `@ts-ignore`.

## Concrete Steps

Work from the repository root unless a command explicitly changes directory.

Start by checking the current worktree so unrelated files are not touched:

    git status --short
    # Expected: existing unrelated local files may appear, but implementation should only stage files needed for this auth-gate change.

Edit `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` to remove startup auth redirects and unused imports. Keep the provider tree around `<Outlet />` intact.

Edit `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` to use the local fallback organization id:

    const activeOrganizationId = session?.session?.activeOrganizationId ?? MOCK_ORG_ID;

Edit `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` to render children immediately instead of returning the full-screen auth hydration loader. Keep token hydration in a background effect if the code remains useful.

Delete or neutralize `apps/desktop/src/renderer/routes/sign-in/page.tsx` and delete sign-in-only children after confirming no imports remain. Use `Grep` for `routes/sign-in`, `useSessionRecovery`, and `Sign in to get started` to verify removal.

If route files were deleted, regenerate routes:

    cd apps/desktop
    bun run generate:routes
    # Expected: routeTree.gen.ts updates successfully and no missing route import errors are printed.

Run focused searches:

    # Use Grep rather than shell grep in Claude Code.
    Search for "Sign in to get started" under apps/desktop/src.
    Search for "Navigate to=\"/sign-in\"" under apps/desktop/src.
    Search for "createFileRoute(\"/sign-in" under apps/desktop/src.

The expected result is no startup route or visible startup text remains. Some strings such as model provider OAuth sign-in may remain if they are unrelated to the desktop startup gate.

## Validation and Acceptance

Run typechecking for the desktop app:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript exits successfully with no errors.

Run relevant tests if there are changed test targets or nearby tests. At minimum, run the desktop test script if time permits:

    cd apps/desktop
    bun test
    # Expected: tests pass. If unrelated existing failures appear, document them with the failing test names and evidence.

Run root lint after implementation:

    cd /Users/biangwua/Documents/biang/小玩意/superset
    bun run lint
    # Expected: no lint errors from the changed files.

Start the desktop app using the required Apple Silicon startup path for this machine. Do not use a generic `bun dev` for this desktop startup check because this machine requires arm64 Node through nvm:

    pkill -TERM -f 'npm exec electron-vite dev --watch -c electron\.vite\.config\.ts|node .*/node_modules/.bin/electron-vite dev --watch -c electron\.vite\.config\.ts|/node_modules/electron/dist/Electron\.app/Contents/MacOS/Electron( |$)|apps/desktop/dist/main/terminal-host\.js' 2>/dev/null || true

    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && arch -arm64 bash -c '
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    nvm use 22
    export NODE_ENV=development
    cd /Users/biangwua/Documents/biang/小玩意/superset/apps/desktop
    bun run clean:dev 2>/dev/null
    bun run generate:icons 2>/dev/null
    bun run scripts/clean-launch-services.ts 2>/dev/null
    bun run scripts/patch-dev-protocol.ts 2>/dev/null
    exec npx electron-vite dev --watch -c electron.vite.config.ts
    '

Manual acceptance is satisfied when the Electron window loads without showing `Sign in to get started`, without requiring GitHub or Google OAuth, and without redirecting to `Create Organization`. If there are existing workspaces, `/workspace` should open the most recent workspace or the first workspace. If there are no workspaces, `/workspace` should navigate to the existing welcome/onboarding screen.

Also verify anonymous settings behavior. Open the organization/topbar menu and account settings. They must not expose a broken sign-out action or profile editing form that depends on a missing remote user. Cloud-only actions can remain hidden or inert, but the local workspace flow must keep working.

## Idempotence and Recovery

The implementation is safe to repeat. Editing the route guard and collection fallback is deterministic, and running `bun run generate:routes` can be repeated whenever route files change.

If deleting the sign-in route causes generated route errors, recover by restoring `apps/desktop/src/renderer/routes/sign-in/page.tsx` as a minimal redirect component:

    import { createFileRoute, Navigate } from "@tanstack/react-router";

    export const Route = createFileRoute("/sign-in/")({
      component: () => <Navigate to="/workspace" replace />,
    });

Then rerun `bun run generate:routes`, typecheck, and continue. This fallback still satisfies the startup behavior because `/sign-in` no longer shows login UI.

If anonymous startup renders a blank screen, inspect `CollectionsProvider` first. A blank screen likely means `activeOrganizationId` is still `null` and the provider returned `null`. Ensure the fallback to `MOCK_ORG_ID` is active when there is no session.

If API calls fail because no bearer token exists, classify whether they are part of the local startup flow. Local workspace list, local database migrations, local host service, and welcome screen must work without a token. Cloud-only calls may need to be hidden for anonymous users rather than made mandatory during startup.

Rollback is straightforward: revert the commit that implements this plan, regenerate routes if needed, and restart the desktop app.

## Artifacts and Notes

Current startup gate evidence:

    // apps/desktop/src/renderer/routes/sign-in/page.tsx
    <p className="text-sm text-muted-foreground">
      {hasLocalToken ? "Restoring your session" : "Sign in to get started"}
    </p>

Current unauthenticated redirect evidence:

    // apps/desktop/src/renderer/routes/_authenticated/layout.tsx
    if (isPending && !hasLocalToken && !env.SKIP_ENV_VALIDATION) {
      return <Navigate to="/sign-in" replace />;
    }

    if (!isSignedIn) {
      return <Navigate to="/sign-in" replace />;
    }

    if (!activeOrganizationId) {
      return <Navigate to="/create-organization" replace />;
    }

Current collection initialization blocker:

    // apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx
    const activeOrganizationId = env.SKIP_ENV_VALIDATION
      ? MOCK_ORG_ID
      : session?.session?.activeOrganizationId;

    const collections = activeOrganizationId
      ? getCollections(activeOrganizationId)
      : null;

    if (!collections || isSwitching) {
      return null;
    }

Target behavior is that these checks no longer block startup when `session?.user` is absent.

## Interfaces and Dependencies

No new package dependency is needed. Use existing React, TanStack Router, Electron tRPC, and local database collection utilities.

No new IPC channel is needed. Existing tRPC subscriptions in `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` should remain intact because they drive notifications, workspace initialization progress, menu navigation, and terminal lifecycle updates.

The important interface after implementation is the local organization fallback in `CollectionsProvider`:

    const activeOrganizationId = session?.session?.activeOrganizationId ?? MOCK_ORG_ID;

The route guard in `AuthenticatedLayout` must no longer depend on this interface:

    session?.user
    getAuthToken()
    env.SKIP_ENV_VALIDATION
    activeOrganizationId

for deciding whether to render the dashboard. It may still read session data for optional cloud-aware behavior, but absence of that data must not prevent rendering `<Outlet />`.

## Revision Notes

Initial plan created on 2026-04-25 after locating the desktop sign-in page, authenticated layout guard, auth provider, and collections provider. The plan reflects the user's clarified scope: remove the startup login gate and let users enter the app directly while preserving non-startup auth/provider infrastructure.
