# Sync Model Configuration Across All Project Workspaces

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and this template.

## Purpose / Big Picture

When a user changes model configuration (Haiku/Sonnet/Opus model picks) in the Settings sidebar, the change should be persisted to **every workspace belonging to the same project**, not just the currently active workspace. Today the save only writes to one workspace's `.claude/settings.local.json`. After this change, the user configures models once per project and all worktrees/branches under that project inherit the same model settings.

The user-visible behavior: change model picks in any workspace's Settings tab, switch to another workspace in the same project, and see the same model selections reflected there immediately.

## Assumptions

- A "project" is the unit of model configuration scope, matching the user's intent. Cross-project leakage is undesirable.
- All workspaces under a project should receive identical model settings. There is no "per-workspace override" concept after this change.
- The existing `readWorkspaceModelSettings` procedure still reads from the active workspace's file on disk. Since all files will be in sync after a save, this is fine.
- The `mergeWorkspaceModelSettings` function and its merge semantics (preserve non-model env keys) remain unchanged. Each workspace file is still independently merged.
- The `read` procedure does **not** need to change. It reads from the active workspace, which will have the correct data after sync.

## Open Questions

None. The scope is well-defined from prior analysis.

## Progress

- [x] Step 1: Add `getProjectWorkspaceRoots` helper to `workspace-settings.ts`
- [x] Step 2: Create `saveProjectModelSettings` function in `workspace-settings.ts`
- [x] Step 3: Update tRPC router `save` mutation to use project-wide save
- [x] Step 4: Add unit tests for the new function
- [x] Step 5: Run typecheck and lint
- [ ] Step 6: Manual validation

## Surprises & Discoveries

- `better-sqlite3` native module cannot run under Bun's test runner (ABI mismatch on Apple Silicon). Tests use `bun:sqlite` + `drizzle-orm/bun-sqlite` with in-memory databases and `mock.module()` to inject the test DB as `localDb`.
- Pre-existing typecheck error in `service.ts` (`ModelProviderProtocol` not found) is unrelated to this change.

## Decision Log

- Decision: Keep the tRPC `save` procedure signature accepting `workspaceId` (not `projectId`). The backend resolves the `projectId` from the workspace, then fans out to all sibling workspaces.
  Rationale: Minimal UI changes. The UI already knows `workspaceId` from URL params. Deriving `projectId` in the backend keeps the contract simple and backward-compatible.
  Date/Author: 2026-04-26 / plan author

## Outcomes & Retrospective

Implementation complete. All code changes pass typecheck (no new errors), lint, and 10/10 tests pass. The only remaining step is manual validation in the running desktop app.

## Context and Orientation

This work lives entirely in the **desktop app** (`apps/desktop`). No other apps or shared packages are affected.

### Key files (all under `apps/desktop/src/`):

- **`lib/trpc/routers/model-proxy/workspace-settings.ts`** — Contains `getWorkspaceRoot(workspaceId)` which resolves a workspace to its filesystem path, and `saveWorkspaceModelSettings()` which writes model env vars to `.claude/settings.local.json`. This is where the fan-out logic will be added.

- **`lib/trpc/routers/model-proxy/workspace-settings-merge.ts`** — Pure function `mergeWorkspaceModelSettings(existingText, env)` that merges model env keys into a JSON string, preserving unrelated keys. Not modified by this plan.

- **`lib/trpc/routers/model-proxy/index.ts`** — tRPC router definitions. `createWorkspaceModelSettingsRouter()` exposes `read` and `save` procedures. The `save` mutation will be updated to call the new project-wide function.

- **`renderer/screens/main/components/WorkspaceView/RightSidebar/ModelsPanel/ModelsPanel.tsx`** — UI component. Calls `workspaceModelSettings.save` mutation with `{ workspaceId, haikuModel, sonnetModel, opusModel }`. Not modified by this plan.

### Database schema (from `packages/local-db/src/schema/schema.ts`):

- **`workspaces`** table: has `id` (text PK), `projectId` (text FK to projects), `worktreeId` (nullable FK to worktrees), `type` ("worktree" | "branch"), `deletingAt` (nullable integer; non-null means deletion in progress).
- **`worktrees`** table: has `id` (text PK), `projectId` (text FK), `path` (filesystem path).
- **`projects`** table: has `id` (text PK), `mainRepoPath` (text).

### How workspace paths are resolved today (`getWorkspaceRoot`):

- `type === "worktree"` with `worktreeId`: look up `worktrees.path`.
- `type === "branch"`: look up `projects.mainRepoPath`.

A project has at most one branch-type workspace (enforced by partial unique index). Worktree-type workspaces are unlimited.

### What `saveWorkspaceModelSettings` does today:

1. Resolve the filesystem root via `getWorkspaceRoot(workspaceId)`.
2. Create `.claude/` directory if needed.
3. Read existing `.claude/settings.local.json` if present.
4. Merge model env vars via `mergeWorkspaceModelSettings()`.
5. Write the merged JSON back.
6. Return diagnostic info (created files, preserved keys, etc.).

## Plan of Work

### Step 1: Add `getProjectWorkspaceRoots` helper

In `apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.ts`, add a new exported function `getProjectWorkspaceRoots(projectId: string): string[]`.

This function queries the `workspaces` table for all workspaces where `projectId` matches and `deletingAt IS NULL`, then resolves each workspace's filesystem root using the same logic as `getWorkspaceRoot` (worktree path for worktree-type, project mainRepoPath for branch-type). It returns an array of unique filesystem paths. Duplicates are possible if a project has a branch workspace and multiple worktree workspaces — each worktree has its own path, but the branch workspace shares the project's `mainRepoPath`. Deduplicate by path to avoid writing the same file twice.

Implementation sketch:

```typescript
import { and, eq, isNull } from "drizzle-orm";

export function getProjectWorkspaceRoots(projectId: string): string[] {
  const rows = localDb
    .select()
    .from(workspaces)
    .where(
      and(eq(workspaces.projectId, projectId), isNull(workspaces.deletingAt))
    )
    .all();

  const paths = new Set<string>();
  for (const ws of rows) {
    if (ws.type === "worktree" && ws.worktreeId) {
      const wt = localDb
        .select()
        .from(worktrees)
        .where(eq(worktrees.id, ws.worktreeId))
        .get();
      if (wt?.path) paths.add(wt.path);
    } else {
      const proj = localDb
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
      if (proj?.mainRepoPath) paths.add(proj.mainRepoPath);
    }
  }
  return [...paths];
}
```

### Step 2: Create `saveProjectModelSettings` function

In the same file, add a new exported async function `saveProjectModelSettings` that accepts the same parameters as `saveWorkspaceModelSettings` plus derives the project scope internally.

```typescript
export async function saveProjectModelSettings(args: {
  workspaceId: string;
  baseUrl: string;
  token: string;
  haikuModel: string;
  sonnetModel: string;
  opusModel: string;
}): Promise<SaveWorkspaceModelSettingsResult> {
  // Resolve projectId from the workspace
  const workspace = localDb
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, args.workspaceId))
    .get();
  if (!workspace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Workspace ${args.workspaceId} not found`,
    });
  }

  const roots = getProjectWorkspaceRoots(workspace.projectId);
  if (roots.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No workspace paths found for project",
    });
  }

  const env = {
    ANTHROPIC_AUTH_TOKEN: args.token,
    ANTHROPIC_BASE_URL: args.baseUrl,
    API_TIMEOUT_MS: "3000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModel,
  };

  let lastResult: SaveWorkspaceModelSettingsResult | undefined;
  for (const root of roots) {
    lastResult = await writeModelSettingsToRoot(root, env);
  }
  return lastResult!;
}
```

Extract the existing write logic from `saveWorkspaceModelSettings` into a private helper `writeModelSettingsToRoot(root: string, env: Record<...>)` to avoid duplication. The original `saveWorkspaceModelSettings` should be refactored to call this helper too, keeping backward compatibility.

The extracted helper:

```typescript
async function writeModelSettingsToRoot(
  root: string,
  env: Record<(typeof WORKSPACE_MODEL_ENV_KEYS)[number], string>,
): Promise<SaveWorkspaceModelSettingsResult> {
  const claudeDir = path.join(root, ".claude");
  const settingsPath = path.join(claudeDir, "settings.local.json");
  let createdClaudeDirectory = false;
  try {
    await fs.mkdir(claudeDir, { recursive: false });
    createdClaudeDirectory = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  let existingText: string | null = null;
  let createdSettingsFile = false;
  try {
    existingText = await fs.readFile(settingsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    createdSettingsFile = true;
  }
  const merged = mergeWorkspaceModelSettings(existingText, env);
  await fs.writeFile(settingsPath, merged.text, "utf8");
  return {
    settingsPath,
    createdClaudeDirectory,
    createdSettingsFile,
    replacedInvalidJson: merged.replacedInvalidJson,
    replacedNonObjectEnv: merged.replacedNonObjectEnv,
    preservedEnvKeys: merged.preservedEnvKeys,
    writtenEnvKeys: [...WORKSPACE_MODEL_ENV_KEYS],
  };
}
```

Then refactor `saveWorkspaceModelSettings` to delegate:

```typescript
export async function saveWorkspaceModelSettings(args: {
  workspaceId: string;
  baseUrl: string;
  token: string;
  haikuModel: string;
  sonnetModel: string;
  opusModel: string;
}): Promise<SaveWorkspaceModelSettingsResult> {
  const root = getWorkspaceRoot(args.workspaceId);
  return writeModelSettingsToRoot(root, {
    ANTHROPIC_AUTH_TOKEN: args.token,
    ANTHROPIC_BASE_URL: args.baseUrl,
    API_TIMEOUT_MS: "3000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: args.haikuModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: args.sonnetModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: args.opusModel,
  });
}
```

### Step 3: Update tRPC router

In `apps/desktop/src/lib/trpc/routers/model-proxy/index.ts`, update the `save` mutation in `createWorkspaceModelSettingsRouter` to call `saveProjectModelSettings` instead of `saveWorkspaceModelSettings`.

Change the import to add `saveProjectModelSettings` and update the mutation body:

```typescript
.save: publicProcedure
  .input(
    z.object({
      workspaceId: z.string(),
      haikuModel: z.string().min(1),
      sonnetModel: z.string().min(1),
      opusModel: z.string().min(1),
    }),
  )
  .mutation(async ({ input }) => {
    const status = await modelProxyService.status();
    const baseUrl =
      status.baseUrl ?? (await modelProxyService.start()).baseUrl;
    if (!baseUrl) throw new Error("Model proxy is not running");
    return saveProjectModelSettings({
      ...input,
      baseUrl,
      token: modelProxyService.getToken(),
    });
  }),
```

The tRPC procedure signature and input schema remain unchanged. The UI does not need modification.

### Step 4: Add unit tests

Add tests in `apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts`.

Since the new functions (`getProjectWorkspaceRoots`, `saveProjectModelSettings`) interact with the local SQLite database, the tests need the database to be seeded with test data. Check how other tests in this codebase handle local DB setup.

At minimum, test:

1. `getProjectWorkspaceRoots` returns correct paths for a project with multiple worktree workspaces and one branch workspace.
2. `getProjectWorkspaceRoots` deduplicates when multiple workspaces resolve to the same path.
3. `getProjectWorkspaceRoots` excludes workspaces with `deletingAt IS NOT NULL`.
4. `saveProjectModelSettings` writes to all workspace roots for the project.

If seeding the local DB for tests is complex or the existing test patterns only test pure functions, it is acceptable to test `getProjectWorkspaceRoots` as an integration test and skip it if the DB isn't available. The critical logic to test is that the fan-out happens correctly.

### Step 5: Run typecheck and lint

    cd /Users/biangwua/Documents/biang/小玩意/superset
    bun run typecheck
    bun run lint:fix

### Step 6: Manual validation

1. Start the desktop app.
2. Open a project with multiple worktree workspaces.
3. In workspace A's Settings sidebar, change the model configuration and save.
4. Switch to workspace B. Open Settings. Verify the same model selections appear.
5. Verify the `.claude/settings.local.json` files in each worktree directory contain the updated model env vars.

## Concrete Steps

After implementing the code changes:

    cd /Users/biangwua/Documents/biang/小玩意/superset
    bun run typecheck
    # Expected: No errors

    bun run lint:fix
    # Expected: No errors or auto-fixed issues

    bun test apps/desktop/src/lib/trpc/routers/model-proxy/workspace-settings.test.ts
    # Expected: All tests pass

## Validation and Acceptance

Behavior to verify:

1. After saving model settings in any workspace, all sibling workspaces in the same project have updated `.claude/settings.local.json` files.
2. Workspaces in a different project are NOT affected.
3. Each workspace's non-model env keys (e.g., `CUSTOM_FLAG`) are preserved during the fan-out write.
4. The tRPC `read` procedure returns the correct (updated) values when called from any workspace in the project.
5. The UI save button works without errors, and the success feedback is unchanged.

Run validation commands:

    bun run typecheck   # No type errors
    bun run lint        # No lint errors
    bun test            # All tests pass

## Idempotence and Recovery

- The `writeModelSettingsToRoot` function is idempotent: running it multiple times with the same inputs produces the same file content (modulo preserved env keys which are not touched).
- If the save fails partway through (e.g., file permission error on one worktree), the workspaces that were written before the failure will have the new settings, and the remaining ones won't. This is acceptable because (a) the user gets an error notification, and (b) re-saving will write to all again. A transactional approach across filesystem writes is not necessary.

## Artifacts and Notes

_No special artifacts. All changes are in-repo._

## Interfaces and Dependencies

**Imports needed in `workspace-settings.ts`:**

```typescript
import { and, isNull } from "drizzle-orm";
```

`and` and `isNull` are already used elsewhere in the codebase (e.g., in `status.ts` procedures). The `drizzle-orm` package is already a dependency.

**No new packages required.** The implementation uses only existing dependencies: `drizzle-orm`, `@superset/local-db`, `@trpc/server`, and Node.js `fs`/`path`.
