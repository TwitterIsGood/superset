# Design

## Problem Shape

The crash came from a missing `EXPO_PUBLIC_POSTHOG_KEY`, but the root issue is broader: mobile config is currently assembled from several places that can drift independently:

- `apps/mobile/lib/env.ts` validates runtime Expo public env.
- `apps/mobile/app.config.ts` loads root `.env` and owns native Info.plist/ATS.
- `apps/mobile/eas.json` declares build profiles without Superset URL/profile semantics.
- `scripts/superset-online.sh` writes `apps/mobile/.env.local`.
- `scripts/dev-worktree.ts` writes worktree-local mobile URLs.
- Local unsigned IPA packaging currently depends on manual command knowledge.

## Proposed Architecture

Create a small mobile config layer under `apps/mobile/config/`.

- `profiles.ts`
  - Owns profile names and default public URLs.
  - Exports `MOBILE_PROFILE_NAMES`, `MOBILE_PROFILE_DEFAULTS`, allowlisted HTTP hosts, and helper types.
- `resolveMobileEnv.ts`
  - Resolves process env + profile defaults.
  - Validates required public URLs with Zod.
  - Treats PostHog as optional.
  - Rejects unapproved public HTTP.
  - Produces app-facing public env and app-config-facing native network config.
- `app.config.ts`
  - Loads env files without overriding explicit shell/EAS env.
  - Calls the resolver.
  - Generates ATS exception domains from the resolver output.
  - Stores resolved profile in `extra` for diagnostics.
- `lib/env.ts`
  - Reuses the same public schema, so runtime and app config agree.

Keep the layer dependency-free beyond `zod`/Node-compatible code already available to the mobile package. Do not import React Native-only modules into config code used by Node during Expo config evaluation.

## Build And Script Contract

- Add a local build script, likely `apps/mobile/scripts/build-ios-unsigned.ts`, called by `bun run --cwd apps/mobile build:ios:unsigned`.
- The script should:
  - Set/require `SUPERSET_MOBILE_PROFILE`.
  - Run an env preflight through the resolver.
  - Run Expo prebuild when needed.
  - Run `xcodebuild archive` with signing disabled.
  - Package `/tmp/superset-mobile-ipa/Superset-unsigned.ipa`.
  - Verify generated `Info.plist` ATS domains before reporting success.
- Update `scripts/superset-online.sh` and `scripts/dev-worktree.ts` to write `EXPO_PUBLIC_SUPERSET_PROFILE` / `SUPERSET_MOBILE_PROFILE` plus the managed public URLs.
- Update `apps/mobile/eas.json` to use explicit `env` blocks for `development`, `preview`/`online-canary`, and `production`.

## Test Strategy

- Unit tests for profile resolution:
  - missing optional PostHog
  - required URL failure
  - canary HTTP allowlist
  - arbitrary public HTTP rejected
  - explicit env overrides profile defaults
- Unit/source tests for script contracts:
  - online script writes only managed URL/profile keys
  - EAS profiles contain resolver-known profile names and required URL keys
- Build smoke:
  - `bun run --cwd apps/mobile typecheck`
  - `bun run lint`
  - unsigned IPA script or at least its preflight + plist verification when a full archive is too slow.

## Non-Goals

- No production HTTPS migration in this task.
- No production DB or auth data changes.
- No TestFlight/App Store signing or credential setup.
