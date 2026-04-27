# Adapt Desktop Auto-Update Releases to the New GitHub Repository

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows the root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the Superset ExecPlan template. In this repository, Bun is the package manager, Biome is the root formatter/linter, and Electron desktop interprocess communication must use tRPC as implemented under `apps/desktop/src/lib/trpc`.

## Purpose / Big Picture

Superset Desktop currently checks GitHub releases in the old `superset-sh/superset` repository when it looks for application updates. The local git remote now points at `TwitterIsGood/superset`, so packaged desktop builds will keep polling the wrong release feed unless the auto-update configuration and release publish configuration are adapted. After this work, a packaged stable build will check `TwitterIsGood/superset/releases/latest/download`, a packaged canary build will check `TwitterIsGood/superset/releases/download/desktop-canary`, and Electron Builder will publish desktop update assets to the same repository.

The visible result is that the existing desktop update flow still behaves the same, but it uses the new repository as the source of truth. A user can open the packaged app, choose `Check for Updates...` from the macOS app menu, and the app will check the new repository instead of the old one. In development, the existing simulated update menu items remain available for UI validation.

## Assumptions

The current remote repository is `https://github.com/TwitterIsGood/superset.git`, based on `git remote -v` run on 2026-04-26.

The intended release owner is `TwitterIsGood` and the intended release repository name is `superset`. This plan does not rename the app, the npm package, or the Superset product branding.

The desired scope is desktop auto-update and desktop release publishing only. Test fixtures and historical plan files that mention `superset-sh/superset` should not be mass-edited unless they directly affect the desktop update feed, release publish target, or visible releases link.

The release asset naming convention should stay the same. Stable releases should continue to expose `latest-mac.yml`, `latest-linux.yml`, `Superset-arm64.dmg`, `Superset-x64.dmg`, and `Superset-x64.AppImage` style assets as produced by `.github/workflows/release-desktop.yml`. Canary should continue to use the rolling `desktop-canary` release and expose canary manifests such as `canary-mac.yml`, `canary-linux.yml`, and `latest-linux.yml` as produced by `.github/workflows/release-desktop-canary.yml`.

## Open Questions

Should the desktop package metadata at `apps/desktop/package.json` field `repository.url` be updated from `https://github.com/superset-sh/superset.git` to `https://github.com/TwitterIsGood/superset.git` as part of this change? This affects package metadata, not the update feed. Decision Log placeholder: `Package metadata repository URL`.

Should the generated changelog prompt and tests that contain example `superset-sh/superset` URLs be updated in the same PR, or should this PR stay narrowly focused on runtime update behavior and release publishing? This affects Plan of Work and Validation because a broad replacement could require updating many snapshots or test expectations. Decision Log placeholder: `Scope of non-runtime URL replacements`.

Does `TwitterIsGood/superset` already contain a valid stable desktop release and a `desktop-canary` release/tag with the expected update manifests? This affects acceptance because pointing the app to a repository without assets will make update checks fail with 404 until the first release is created. Decision Log placeholder: `New repository release asset readiness`.

## Progress

- [x] (2026-04-26 15:33 local) Confirmed the local git remote points to `https://github.com/TwitterIsGood/superset.git`.
- [x] (2026-04-26 15:33 local) Found hardcoded old update feed URLs in `apps/desktop/src/main/lib/auto-updater.ts`.
- [x] (2026-04-26 15:33 local) Found old GitHub publish owner in `apps/desktop/electron-builder.ts` and `apps/desktop/electron-builder.canary.ts`.
- [x] (2026-04-26 15:33 local) Found old visible releases URL in `apps/desktop/src/shared/auto-update.ts`.
- [x] (2026-04-26 15:33 local) Created this ExecPlan for the repository migration adaptation.
- [x] (2026-04-26 local) Resolved the open questions needed for this implementation and recorded explicit decisions below.
- [x] (2026-04-26 local) Implemented the minimal code and config changes described in Plan of Work.
- [x] (2026-04-26 local) Ran scoped validation commands and desktop typecheck; results are recorded in Outcomes & Retrospective.
- [ ] If a PR completes this work, move this plan to `apps/desktop/plans/done/`.

## Surprises & Discoveries

- Observation: The desktop update feed does not derive from the local git remote. It is hardcoded in the desktop main process.
  Evidence: `apps/desktop/src/main/lib/auto-updater.ts` defines `UPDATE_FEED_URL` with `https://github.com/superset-sh/superset/releases/...`.

- Observation: Release workflow upload commands mostly use `github.repository`, but Electron Builder still has a hardcoded publish owner and repository.
  Evidence: `.github/workflows/release-desktop.yml` generates notes using `gh api repos/${{ github.repository }}/...`, while `apps/desktop/electron-builder.ts` sets `publish.owner` to `superset-sh` and `publish.repo` to `superset`.

## Decision Log

- Decision: Treat this as a desktop-app scoped change and create the plan under `apps/desktop/plans/`.
  Rationale: The runtime behavior being fixed is in `apps/desktop/src/main/lib/auto-updater.ts`, the user-visible release link is in `apps/desktop/src/shared/auto-update.ts`, and Electron Builder config lives under `apps/desktop/`.
  Date/Author: 2026-04-26 / Claude

- Decision: Keep the product name, app IDs, update cadence, status model, tRPC procedures, and UI flow unchanged.
  Rationale: The problem is a repository migration. Changing update behavior, app identity, or UI would expand blast radius and make validation harder.
  Date/Author: 2026-04-26 / Claude

- Decision: Package metadata repository URL: update it to `https://github.com/TwitterIsGood/superset.git`.
  Rationale: Although `apps/desktop/package.json` does not drive the runtime update feed, it is package metadata for the same repository migration and was explicitly allowed by the implementation scope.
  Date/Author: 2026-04-26 / Claude

- Decision: Scope of non-runtime URL replacements: keep this implementation narrow and do not edit historical plans, tests, or changelog prompt examples.
  Rationale: Those references are examples or historical records and are not required for desktop runtime update behavior or Electron Builder release publishing.
  Date/Author: 2026-04-26 / Claude

- Decision: New repository release asset readiness: not validated in this implementation.
  Rationale: The requested validation was lightweight local validation only. Real packaged update acceptance still depends on `TwitterIsGood/superset` containing the expected stable and `desktop-canary` release assets.
  Date/Author: 2026-04-26 / Claude

## Outcomes & Retrospective

Implemented the desktop repository migration with minimal runtime/config edits. Stable and canary auto-update feed URLs in `apps/desktop/src/main/lib/auto-updater.ts` now point at `TwitterIsGood/superset`; the visible releases URL in `apps/desktop/src/shared/auto-update.ts` also points at the new repository. Electron Builder stable and canary publish owners now use `TwitterIsGood` with repo `superset`. `apps/desktop/package.json` repository metadata was updated to the new git URL.

Validation completed on 2026-04-26:

    git grep -n "TwitterIsGood/superset/releases" -- apps/desktop/src/main/lib/auto-updater.ts apps/desktop/src/shared/auto-update.ts
    # Passed: stable, canary, and releases page URLs point at github.com/TwitterIsGood/superset.

    git grep -n "owner: \"TwitterIsGood\"" -- apps/desktop/electron-builder.ts apps/desktop/electron-builder.canary.ts
    # Passed: both Electron Builder configs use owner: "TwitterIsGood".

    git grep -n "superset-sh/superset\|github.com/superset-sh" -- apps/desktop/src/main/lib/auto-updater.ts apps/desktop/src/shared/auto-update.ts apps/desktop/electron-builder.ts apps/desktop/electron-builder.canary.ts apps/desktop/package.json
    # Passed: no output for the scoped migrated files.

    cd apps/desktop && bun run typecheck
    # Passed: pretypecheck generated icons/routes, then tsc --noEmit completed successfully.

No publishing commands, packaging commands, broad lint/test runs, or real packaged update checks were run. Real update acceptance remains dependent on the expected release assets existing in `TwitterIsGood/superset`.

## Context and Orientation

This plan affects the desktop app only. The relevant app is `apps/desktop`. No database packages, web app packages, API routes, or shared package migrations are required.

Superset Desktop is an Electron app. Electron has a main process and a renderer process. The main process runs Node.js code and owns operating-system integrations such as menus, tray, windows, and auto-update. The renderer process runs browser UI code. This repo exposes Electron main-process functionality to the renderer through tRPC, which is a type-safe remote procedure call system. In `apps/desktop/AGENTS.md`, desktop IPC work must use tRPC under `apps/desktop/src/lib/trpc`; this plan does not need new IPC because update procedures already exist.

The desktop update mechanism is centered in `apps/desktop/src/main/lib/auto-updater.ts`. It imports `autoUpdater` from `electron-updater`. `electron-updater` is the library that checks a release feed, downloads app update artifacts, verifies update metadata, and installs downloaded updates. The file decides whether the current build is stable or canary using `semver.prerelease(app.getVersion())`. A stable version has no prerelease suffix, for example `1.5.10`. A canary version has a prerelease suffix, for example `1.5.10-canary.20260426120000`.

`apps/desktop/src/main/lib/auto-updater.ts` currently builds `UPDATE_FEED_URL` like this: canary uses `https://github.com/superset-sh/superset/releases/download/desktop-canary`; stable uses `https://github.com/superset-sh/superset/releases/latest/download`. Because these strings are hardcoded, changing the local git remote does not change update behavior.

`apps/desktop/src/lib/trpc/routers/auto-update/index.ts` exposes update status and actions to the renderer. It has a `subscribe` tRPC subscription that uses an observable to push update status changes from `autoUpdateEmitter`. It also has `check`, `install`, `dismiss`, and development-only simulation procedures. This file should not need behavior changes for a repository URL migration.

`apps/desktop/src/renderer/components/UpdateToast/useUpdateListener.tsx` subscribes to update status. It shows a persistent toast for `downloading`, `ready`, and `error` states. `apps/desktop/src/renderer/components/UpdateToast/UpdateToast.tsx` renders the toast, opens the changelog, and calls the install mutation. These UI files should not need behavior changes unless the visible release URL is shown through a related action.

`apps/desktop/src/shared/auto-update.ts` defines update status constants and `RELEASES_URL`. `RELEASES_URL` is currently `https://github.com/superset-sh/superset/releases`. It should point at the new repository if any UI or support action sends users to the releases page.

`apps/desktop/electron-builder.ts` configures Electron Builder for stable desktop packaging. Electron Builder is the packaging tool that creates macOS, Linux, and Windows installers and update manifests. It currently has a `publish` block with `provider: "github"`, `owner: "superset-sh"`, and `repo: "superset"`. This publish target should match the repository used by the updater feed.

`apps/desktop/electron-builder.canary.ts` extends the stable builder config for the canary app. Canary has a separate app ID, `com.superset.desktop.canary`, and can be installed side-by-side with stable. Its `publish` block also points at `superset-sh/superset` and should be adapted to `TwitterIsGood/superset`.

The release workflow `.github/workflows/release-desktop.yml` creates stable GitHub releases for tags matching `desktop-v*.*.*`. It downloads desktop build artifacts, merges macOS update manifests, creates stable-named copies for `/releases/latest/download/` URLs, and creates a draft release. The workflow creates assets whose names are expected by the generic update feed.

The canary release workflow `.github/workflows/release-desktop-canary.yml` runs on a schedule or manually. It creates a rolling `desktop-canary` prerelease, deletes the prior `desktop-canary` release and tag, uploads fresh artifacts, and creates canary manifest names. The canary update feed depends on that rolling release name.

## Plan of Work

First, confirm the new repository target. If the migration is definitely to `TwitterIsGood/superset`, keep the constants explicit rather than deriving them from git. Packaged applications cannot read the developer's local git remote, and using explicit URLs makes release behavior deterministic.

Edit `apps/desktop/src/main/lib/auto-updater.ts` in the `UPDATE_FEED_URL` definition. Change the stable feed URL from `https://github.com/superset-sh/superset/releases/latest/download` to `https://github.com/TwitterIsGood/superset/releases/latest/download`. Change the canary feed URL from `https://github.com/superset-sh/superset/releases/download/desktop-canary` to `https://github.com/TwitterIsGood/superset/releases/download/desktop-canary`. Keep the stable-versus-canary selection logic unchanged.

Edit `apps/desktop/src/shared/auto-update.ts`. Change `RELEASES_URL` from `https://github.com/superset-sh/superset/releases` to `https://github.com/TwitterIsGood/superset/releases`. Do not change `AUTO_UPDATE_STATUS` values because they are part of the existing status model consumed by the renderer.

Edit `apps/desktop/electron-builder.ts`. In the `publish` block, change `owner` from `superset-sh` to `TwitterIsGood` and keep `repo` as `superset`. Do not change `generateUpdatesFilesForAllChannels`, target platforms, artifact names, app ID, product name, or signing configuration.

Edit `apps/desktop/electron-builder.canary.ts`. In the canary `publish` block, change `owner` from `superset-sh` to `TwitterIsGood` and keep `repo` as `superset`. Do not change `releaseType: "prerelease"`, canary app ID, product name, or artifact names.

If the open question about `apps/desktop/package.json` is answered yes, edit its `repository.url` from `https://github.com/superset-sh/superset.git` to `https://github.com/TwitterIsGood/superset.git`. If not answered, leave it unchanged because it does not drive the auto-update feed.

Do not replace old URLs in historical desktop plans, test fixtures for GitHub URL parsing, or `.github/prompts/generate-changelog.md` unless the scope question is resolved to include them. Those references are examples or historical records and are not required for update checks.

After edits, search for the old owner in files that should be in scope. The scoped search should include `apps/desktop/src/main/lib/auto-updater.ts`, `apps/desktop/src/shared/auto-update.ts`, `apps/desktop/electron-builder.ts`, and `apps/desktop/electron-builder.canary.ts`. There should be no `superset-sh/superset` references left in those four files.

## Concrete Steps

From the repository root, inspect the current remote and scoped old references:

    git remote -v
    # Expected: origin points to https://github.com/TwitterIsGood/superset.git for fetch and push.

    git grep -n "superset-sh/superset\|github.com/superset-sh" -- apps/desktop/src/main/lib/auto-updater.ts apps/desktop/src/shared/auto-update.ts apps/desktop/electron-builder.ts apps/desktop/electron-builder.canary.ts apps/desktop/package.json
    # Expected before implementation: old references appear in auto-updater, shared auto-update, builder configs, and maybe package metadata.
    # Expected after implementation: no old references remain in the files that were intentionally migrated.

Apply the edits described in Plan of Work using the repository's normal editing tools. Do not edit generated release artifacts or migration files.

Run desktop type checking from the desktop app directory:

    cd apps/desktop
    bun run typecheck
    # Expected: TypeScript completes with no errors.

Run desktop tests from the desktop app directory:

    cd apps/desktop
    bun test
    # Expected: Bun test runner completes successfully. Existing unrelated failures, if any, must be recorded in this plan with the failing test names and evidence.

Run root lint from the repository root:

    bun run lint
    # Expected: Biome reports no lint errors. If it reports unrelated existing issues, record them and verify the changed files are clean.

Optionally validate package configuration without publishing. From `apps/desktop`, run a non-publishing build only if the environment has enough time and native dependencies are installed:

    cd apps/desktop
    bun run build
    # Expected: Electron Builder completes with --publish never because the package script sets electron-builder --publish never.
    # This proves the builder config still loads without publishing assets.

Do not run `bun run release` or `bun run package` with publishing enabled unless explicitly asked. Publishing would create or modify external GitHub release state.

## Validation and Acceptance

Acceptance is met when the runtime feed and publish target both point to the new repository and the existing update UI remains unchanged.

A code-level acceptance check should show the new feed URLs in `apps/desktop/src/main/lib/auto-updater.ts`:

    git grep -n "TwitterIsGood/superset/releases" -- apps/desktop/src/main/lib/auto-updater.ts apps/desktop/src/shared/auto-update.ts
    # Expected: stable, canary, and releases page URLs all point to github.com/TwitterIsGood/superset.

A packaging configuration acceptance check should show Electron Builder publishing to the new owner:

    git grep -n "owner: \"TwitterIsGood\"" -- apps/desktop/electron-builder.ts apps/desktop/electron-builder.canary.ts
    # Expected: both stable and canary builder configs contain owner: "TwitterIsGood".

A negative acceptance check should show no old owner references in the scoped runtime and publish files:

    git grep -n "superset-sh/superset\|github.com/superset-sh" -- apps/desktop/src/main/lib/auto-updater.ts apps/desktop/src/shared/auto-update.ts apps/desktop/electron-builder.ts apps/desktop/electron-builder.canary.ts
    # Expected: no output.

Functional acceptance for development UI should use existing simulations rather than real update downloads. Start the desktop app using the Apple Silicon startup flow preferred for this project, not a generic `bun dev`, if running on the user's machine with the known arm64/Rosetta issue. From `apps/desktop`, use the established arm64 dev startup command from project memory or ask the user to run their normal desktop dev command. In the app, open the `Dev` menu and click `Simulate Update Downloading`, `Simulate Update Ready`, and `Simulate Update Error`. The bottom-right update toast should still appear for each simulated state. This validates that the tRPC subscription and renderer toast were not broken by the URL migration.

Functional acceptance for real update checks requires a packaged app and release assets in `TwitterIsGood/superset`. If assets exist, install a packaged version older than the latest release, open the app, choose `Check for Updates...`, and observe that the app finds or reports updates from the new feed. If assets do not exist yet, record that real update acceptance is blocked by release asset readiness and verify only that the feed URLs are correct.

## Idempotence and Recovery

The planned edits are simple string and configuration changes and can be repeated safely. Running the scoped `git grep` commands multiple times is read-only and safe.

If type checking or linting fails because of these edits, revert only the changed URL/config lines and rerun the validation command to confirm the failure is resolved. Do not use destructive git commands such as `git reset --hard` or `git checkout .` because this repository already has unrelated modified files in the working tree.

If a real packaged update check returns 404, do not change the app back immediately. First verify whether the expected release assets exist in `TwitterIsGood/superset`. The likely recovery is to publish the missing stable or canary release assets, not to point the app back to the old repository.

If the new repository is private or requires authentication for release assets, `electron-updater` generic public GitHub URLs may not work for end users. In that case, pause implementation and revise this plan because the solution may require a different release hosting strategy, not just changing URLs.

## Artifacts and Notes

Initial discovery transcript from 2026-04-26:

    git remote -v
    origin https://github.com/TwitterIsGood/superset.git (fetch)
    origin https://github.com/TwitterIsGood/superset.git (push)

Scoped old runtime feed references found during discovery:

    apps/desktop/src/main/lib/auto-updater.ts:51
      "https://github.com/superset-sh/superset/releases/download/desktop-canary"

    apps/desktop/src/main/lib/auto-updater.ts:52
      "https://github.com/superset-sh/superset/releases/latest/download"

    apps/desktop/src/shared/auto-update.ts:12
      export const RELEASES_URL = "https://github.com/superset-sh/superset/releases";

Builder publish references found during discovery:

    apps/desktop/electron-builder.ts
      publish: {
        provider: "github",
        owner: "superset-sh",
        repo: "superset",
      }

    apps/desktop/electron-builder.canary.ts
      publish: {
        provider: "github",
        owner: "superset-sh",
        repo: "superset",
        releaseType: "prerelease",
      }

## Interfaces and Dependencies

This work uses the existing `electron-updater` dependency declared by `apps/desktop/package.json`. No new dependency should be added.

The main interface to preserve is the update status event shape in `apps/desktop/src/main/lib/auto-updater.ts`:

    export interface AutoUpdateStatusEvent {
      status: AutoUpdateStatus;
      version?: string;
      error?: string;
    }

The status constants in `apps/desktop/src/shared/auto-update.ts` must remain:

    idle
    checking
    downloading
    ready
    error

The existing tRPC router in `apps/desktop/src/lib/trpc/routers/auto-update/index.ts` must continue to expose `subscribe`, `getStatus`, `check`, `install`, `dismiss`, `simulateReady`, `simulateDownloading`, and `simulateError`. No new tRPC procedure is needed.

The external service dependency is GitHub Releases. Stable update checks rely on GitHub serving the latest non-prerelease release assets from `/releases/latest/download`. Canary update checks rely on a rolling `desktop-canary` GitHub release. Both feeds must be reachable without user authentication for packaged desktop users.

## Revision Notes

- 2026-04-26: Initial plan created to adapt desktop auto-update feed and release publish configuration from `superset-sh/superset` to `TwitterIsGood/superset`. The plan exists because discovery showed the local git remote had changed while runtime and packaging configuration still pointed at the old repository.
- 2026-04-26: Implemented the migration in desktop auto-update URLs, visible releases URL, Electron Builder publish owner, and desktop package repository metadata. Recorded scoped grep and typecheck validation results.
