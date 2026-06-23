# Implementation Plan

1. Baseline and task setup
   - Validate current git state.
   - Start this Trellis task.
   - Record the crash/root-cause decision in PRD/design.

2. Config layer
   - Add `apps/mobile/config/` profile resolver.
   - Reuse the resolver in `apps/mobile/lib/env.ts`.
   - Refactor `apps/mobile/app.config.ts` to generate native ATS from the resolver.

3. Script/profile alignment
   - Update `scripts/superset-online.sh` mobile env writer to include profile/relay URL keys and preserve non-managed config.
   - Update `scripts/dev-worktree.ts` managed mobile keys if required.
   - Update `apps/mobile/eas.json` with explicit env profile blocks.

4. Local unsigned IPA command
   - Add a package script and implementation for unsigned iOS archive packaging.
   - Include preflight and Info.plist/ATS verification.
   - Keep proxy support through inherited `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`.

5. Validation
   - Focused env/profile/script tests.
   - `bun run --cwd apps/mobile typecheck`.
   - `bun run lint`.
   - Run unsigned IPA command or documented smoke path and open the IPA in Finder.

6. Finish
   - Update Trellis journal/context.
   - Commit and push to `TwitterIsGood/superset`.
