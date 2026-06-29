# Quality And Testing

## Baseline Checks

Use root checks before pushing broad changes:

- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`
- `bun test`

For focused packages, run the closest script first. Examples:

- `bun run --cwd apps/desktop test`
- `bun run --cwd packages/host-service test`
- `bun run --cwd packages/pty-daemon test`
- `bun run --cwd packages/pty-daemon test:integration`
- `bun run --cwd packages/workspace-fs test`
- `bun run --cwd packages/shared test`

For desktop-facing product behavior, also read `desktop-acceptance-tdd.md` during planning. User-visible desktop changes should name either the Desktop Automation CLI acceptance path that proves the flow or the reason lower-level tests are sufficient.

## Biome Rules

Biome is configured at `biome.jsonc` and should be run from the root. Renderer code has a stricter import boundary that rejects Node builtins and host filesystem implementations. CLI packages intentionally relax `noExplicitAny` and non-null assertion rules because the CLI framework parser types need those escape hatches.

## Type Safety

The shared TypeScript config in `tooling/typescript/base.json` is strict and enables `noUncheckedIndexedAccess`. Prefer inferred types from tRPC routers, Drizzle `$inferSelect/$inferInsert`, and zod schemas. Avoid `any` unless a local config or package wrapper has already documented why the library type cannot express the overload.

## Test Style

Most packages use `bun:test` for unit tests. `packages/pty-daemon` uses Bun for pure unit tests and Node integration tests for real PTY behavior because `node-pty` is not reliable under Bun. `packages/host-service` has node-marked integration tests for daemon and adoption scenarios.

Source-level regression tests are accepted when the bug was missing wiring that is hard to exercise through a full UI mount. Examples:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`
- `packages/host-service/src/no-electron-coupling.test.ts`

Desktop Automation CLI real app checks are required when the risk lives across Electron main/preload/renderer, persisted desktop state, route guards, host-service, or native process boundaries. They should combine deterministic assertions with screenshot/report artifacts; do not rely on visual-only checks as the gate.

For packaged runtime changes, separate artifact validation from runtime
convergence validation. A green canary/release workflow proves the app was
built and published, but it does not prove a user's installed desktop stopped
adopting an older local helper process. If the change affects host-service,
pty-daemon, automation runners, terminal spawn/open, or bundled runtime path
resolution, the validation notes must name the stale-process strategy: version
gate, manifest/socket inspection, fd-handoff test, or explicit process restart.

When a bug report contains a diagnostic string, use that string as a runtime
fingerprint. If the current code would emit additional fields or a different
error shape but the packaged app still emits the old text, treat that as
evidence of stale code adoption before writing another behavioral patch.

## Size And Performance Optimization Safety

Treat package-size, startup-time, dependency-pruning, lazy-loading, and runtime
pack changes as high-risk production changes. These optimizations often remove
or defer code that the type checker cannot see and that source-tree tests do not
execute. The default posture is: preserve product capability first, then keep
the optimization only after a packaged artifact proves the runtime contract.

### Scenario: Desktop Runtime Optimization Gate

#### 1. Scope / Trigger

- Applies when editing desktop packaging, `apps/desktop/runtime-dependencies.ts`,
  `apps/desktop/scripts/*pack*`, `electron-builder.ts`, resource-pack builders,
  native-module pruning, `asarUnpack`, optional dependency materialization,
  route/component lazy-loading, or startup-performance budget code.
- Trigger: a change removes files, moves dependencies out of the base app,
  changes file permissions, changes runtime lookup paths, defers module loading,
  or changes process startup order.

#### 2. Signatures

- Runtime dependency contract:
  `getRequiredPackagedRuntimeFiles({ targetPlatform, targetArch })`.
- Packaged artifact gate:
  `apps/desktop/scripts/validate-packaged-native-runtime.ts`.
- Package pruning hook:
  `afterPack` in `apps/desktop/electron-builder.ts`.
- Native payload pruning:
  `apps/desktop/scripts/prune-packaged-native-payloads.ts`.
- Canary workflow proof:
  `Release Desktop Canary -> build / Build - macOS (arm64) -> Build Electron app (DMG+ZIP)`.

#### 3. Contracts

- Do not merge a size/performance optimization solely because source tests,
  typecheck, or compile succeeded. The optimized packaged artifact must prove
  the runtime still starts the affected feature.
- For every removed, externalized, lazy-loaded, or resource-packed dependency,
  name the capability it serves and the packaged validation that exercises it.
- File-existence checks are not enough for executable helpers or native
  subprocesses. Validate permissions, architecture, platform directory,
  `app.asar.unpacked` location, and the actual command path used by runtime code.
- If a runtime dependency is moved to a resource pack, the base app must fail
  gracefully while the pack is unavailable and must verify pack download/install
  before invoking the capability.
- If an optimization changes a long-lived process such as host-service or
  pty-daemon, include the stale-process convergence strategy: version gate,
  manifest/socket inspection, fd-handoff, or explicit restart.
- If an optimization changes renderer lazy-loading, run an acceptance path that
  navigates to the affected feature and performs the primary user action, not
  just a route-load or screenshot check.

#### 4. Validation & Error Matrix

- Missing packaged file -> release-blocking validation failure.
- Packaged executable helper exists but has no executable bit -> release-blocking
  validation failure.
- Native binding exists for the wrong platform/arch -> release-blocking
  validation failure.
- Source tree can execute a CLI, but `app.asar.unpacked` cannot -> packaging
  failure, not user project failure.
- Compile/build succeeds, but packaged app cannot open terminal, run a bundled
  plugin, or start an agent -> optimization regression; revert or expand the
  packaged runtime contract before publishing.
- Canary build succeeds but installed app emits an old diagnostic shape -> first
  inspect stale local process adoption before changing behavior again.

#### 5. Good/Base/Bad Cases

- Good: prune unused native payloads, keep the target `node-pty` prebuild helper
  executable, validate the packaged app directory, and run a terminal-open smoke
  path before release.
- Good: move a heavy agent SDK into a resource pack, verify object-storage
  upload/download, install the pack, and run the agent preset once.
- Base: lazy-load a low-frequency renderer dialog and run Desktop Automation to
  open that dialog and complete its primary action.
- Bad: remove `node_modules/**` broadly, re-include a hand-written allowlist,
  pass `bun run typecheck`, and publish without executing the packaged feature.
- Bad: use package-size budget success as proof of runtime safety. Budget gates
  only prove size; they do not prove the app can use what remains.

#### 6. Tests Required

- Focused unit/source tests for dependency lists and pruning behavior.
- Packaged artifact validation for every native/runtime dependency moved or
  pruned. Assertions must include permission bits for executable helpers.
- At least one runtime smoke for the affected product capability:
  terminal open, automation run, agent preset open, bundled plugin init, or
  route primary action, depending on the touched area.
- Canary/release notes must mention the exact workflow run or local packaged
  artifact command that exercised `afterPack`.

#### 7. Wrong vs Correct

Wrong:

```text
The bundle is smaller and typecheck passes, so the optimization is safe.
```

Correct:

```text
The optimized packaged artifact includes the target runtime files with correct
permissions, `afterPack` validation passed, and the affected product capability
was exercised through the packaged/runtime path.
```

## Background Services

Long-lived services must clean up best-effort and independently. `packages/host-service/src/app.ts` isolates cleanup steps so one failed stop does not leak the rest. `apps/relay/src/index.ts` drains tunnels on SIGINT and SIGTERM before process exit.

## Local Dev Service Contracts

Local dev setup must keep `.env`, Docker published ports, and generated service files in sync. Setup scripts should replace their managed `.env` block instead of appending another copy, and should treat existing Docker port mappings as the source of truth after a stack has been created. For local Neon HTTP proxy URLs, prefer `localhost` over `db.localtest.me`; `db.localtest.me` can resolve away from loopback on this machine and cause `fetch failed` auth/database errors.

For worktree-local desktop or E2E validation, prefer the lifecycle scripts over hand-starting processes: `bun run dev:worktree:start`, `bun run dev:worktree:status`, `bun run dev:worktree:stop`, and `bun run dev:worktree:cleanup -- --e2e-slug <slug> [--worktree-name <dir-name>]`. Seed disposable workspace/project rows with `bun run e2e:workspace-fixture -- seed ...` and clean them with `bun run e2e:workspace-fixture -- cleanup --slug <slug>` or the lifecycle cleanup command. See `desktop-acceptance-tdd.md` for the full contract.

Worktree setup tests should cover two same-named physical worktree paths producing different compose projects, stale managed `.env` detection, and refusal of non-local critical URLs before migrations, seed, stop, or cleanup.

When changing dev, worktree, online, Electric, Redis/KV, or relay startup scripts, validate the actual runtime contract, not just process existence:

- API auth/session endpoint responds.
- Neon HTTP proxy can execute a real SQL query.
- Electric proxy returns the expected auth-gated response.
- Relay health responds.
- Redis/KV URL matches the Docker-published host port.
- Desktop renderer reaches the sign-in or authenticated route without repeated renderer errors.

## CI Performance Budget Semantics

Canary duration checks must keep the user-facing path as the hard gate:

- Hard-fail the lane when artifact-ready or published-release critical path exceeds its lane hard limit.
- Hard-fail product-controlled phases such as compile, Electron ZIP packaging, install, release update, and resource-pack build/upload/verify when those phase limits are exceeded.
- Treat external cache-maintenance phases such as dependency cache restore/save and post-cache cleanup as diagnostics. If they exceed their phase limit while the artifact-ready/critical path still meets the lane hard limit, emit a warning, not a failure.
- Preserve phase timings in logs even when a phase is diagnostic; otherwise future regressions cannot be attributed.

For artifact-only quick Canary validation, a green run with artifact-ready under the 3-minute target is stronger evidence than a red run caused only by dependency-cache variance.

## Final Pass

Before finishing spec or doc work, search `.trellis/spec` for generated scaffold language and stale status markers. The docs should describe this repository with concrete paths, not generic framework advice.
