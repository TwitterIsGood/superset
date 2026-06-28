# Auth And Routing

## Scenario: V2-only desktop account entry

### 1. Scope / Trigger

- Trigger: desktop auth and route-entry changes that cross renderer, Electron token persistence, and cloud Better Auth.
- Applies to `apps/desktop/src/renderer/routes/sign-in/page.tsx`, `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx`, authenticated route guards, and desktop workspace route redirects.

### 2. Signatures

- Email sign-in endpoint: `POST /api/auth/sign-in/email` with `{ email: string, password: string }`.
- Email sign-up endpoint: `POST /api/auth/sign-up/email` with `{ name: string, email: string, password: string }`.
- Token persistence: `electronTrpc.auth.persistToken.mutateAsync({ token, expiresAt })`.
- Successful desktop navigation target: `/v2-workspaces`.

### 3. Contracts

- Desktop remains account-gated: unauthenticated users must land on `/sign-in`, not the app shell.
- `packages/auth/src/server.ts` must keep `emailAndPassword.enabled: true` for production password auth.
- Sign-up must use email-format accounts and password only. Do not add email verification, one-time email codes, or password reset unless a separate task scopes those flows.
- Persist the Better Auth session token through Electron before calling `setAuthToken(token)` and refreshing the JWT with `authClient.token()`.
- V2 is the only primary workspace surface: root, legacy workspace routes, and retired onboarding routes redirect to `/v2-workspaces`.

### 4. Validation & Error Matrix

- Invalid email/password -> render a selectable inline error on the sign-in page.
- Existing account during sign-up -> tell the user to sign in instead.
- Missing token in a successful response -> fail the form with a selectable error; do not enter the app shell.
- Missing active organization after authentication -> keep the authenticated shell blocked and show account setup recovery actions.
- Legacy `/workspace`, `/workspaces`, `/project`, or `/onboarding` route -> redirect to `/v2-workspaces`.

### 5. Good/Base/Bad Cases

- Good: fresh user signs up with name, email, and password; token is persisted; JWT refreshes; app navigates to `/v2-workspaces`.
- Base: existing user signs in with email and password; existing OAuth buttons remain secondary.
- Bad: reintroducing a `useIsV2CloudEnabled` product switch, V1 import modal, onboarding gate, or Task paywall gate in active desktop navigation.

### 6. Tests Required

- Source or unit test that sign-in includes both email endpoints, persists the token, and targets `/v2-workspaces`.
- Source or route test that legacy workspace and onboarding route files redirect to `/v2-workspaces`.
- Source test that deleted V2 opt-in/V1 migration artifacts stay deleted.
- Task authorization tests in `packages/trpc/src/router/task/task.test.ts` must continue to pass when removing desktop Task paywall gates.

### 7. Wrong vs Correct

#### Wrong

```tsx
if (!useIsV2CloudEnabled()) {
	return <WorkspaceSidebar />;
}
```

#### Correct

```tsx
return <DashboardSidebar isCollapsed={isCollapsed} />;
```

#### Wrong

```tsx
gateFeature(GATED_FEATURES.TASKS, () => navigate({ to: "/tasks" }));
```

#### Correct

```tsx
navigate({ to: "/tasks", search: tasksSearchFromFilters(filters) });
```

## Scenario: Hash-router workspace detail fallback

### 1. Scope / Trigger

- Trigger: v2 workspace route/layout changes under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace`.
- Applies when a route shell renders child content manually for compatibility with optional trailing slashes or hash-router refreshes.

### 2. Signatures

- Primary route: `/_authenticated/_dashboard/v2-workspace/$workspaceId/`.
- Direct user URL: `#/v2-workspace/:workspaceId`.
- Layout fallback helper: accepts router `matchRoute()` output plus `location.pathname` and `window.location.hash`.

### 3. Contracts

- Do not rely only on `matchRoute()` for exact workspace detail rendering. Hash-router refreshes can leave `matchRoute()` without a workspace id while the browser URL still contains `#/v2-workspace/:workspaceId`.
- Exact workspace detail rendering must extract `workspaceId` from, in order: router match, normalized pathname, normalized hash.
- Nested routes such as `/v2-workspace/:workspaceId/chat` or `/work` must still render through `<Outlet />`; the exact-route fallback is only for `/v2-workspace/:workspaceId`.
- Workspace detail content that portals into dashboard layout slots must retry slot lookup after first render. A one-shot `document.getElementById(...)` can race the parent layout and leave toggles visible with empty portal content.

### 4. Validation & Error Matrix

- `#/v2-workspace/:id` after renderer refresh -> workspace detail body renders and includes the selected workspace id.
- Slot missing on first render -> retry until `#workspace-right-sidebar-slot` exists, then portal the right sidebar.
- Nested workspace route -> fallback must not swallow the route; render child outlet.

### 5. Good/Base/Bad Cases

- Good: `extractV2WorkspaceId({ pathname: "/", hash: "#/v2-workspace/abc" })` returns `abc`, and `isDefaultV2WorkspaceRoute(...)` returns true for the exact route.
- Base: router match provides `workspaceId`; helper uses it without parsing browser strings.
- Bad: `location.pathname.replace(/\/$/, "") === "/v2-workspace/${workspaceId}"` as the only fallback condition.

### 6. Tests Required

- Unit/source test for exact workspace route with and without trailing slash.
- Unit/source test for hash-router refresh where pathname is `/` and hash is `#/v2-workspace/:id`.
- Regression test that the page retries `#workspace-right-sidebar-slot` lookup with cleanup.
- Loaded Desktop Automation gate for a host-backed workspace detail plus right sidebar open.

### 7. Wrong vs Correct

#### Wrong

```tsx
const isDefaultWorkspaceRoute =
	workspaceId !== null &&
	location.pathname.replace(/\/$/, "") === `/v2-workspace/${workspaceId}`;
```

#### Correct

```tsx
const workspaceId = extractV2WorkspaceId({
	matchedWorkspaceId,
	pathname: location.pathname,
	hash: window.location.hash,
});
```
