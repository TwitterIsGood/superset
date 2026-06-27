# Desktop Resource Pack Release Runbook

Desktop installers are intentionally thin. Trellis, Claude Agent, MastraCode,
and CLI payloads are built as on-demand resource packs and served from object
storage through a public download URL. GitHub Releases remain the installer
distribution channel; S3 or compatible object storage is only for resource
packs.

## Required Repository Secrets

Published desktop builds that use no bundled CLI require these GitHub repository
secrets:

- `SUPERSET_OBJECT_STORAGE_ENDPOINT`
- `SUPERSET_OBJECT_STORAGE_BUCKET`
- `SUPERSET_OBJECT_STORAGE_REGION` (optional; defaults to `us-east-1`)
- `SUPERSET_OBJECT_STORAGE_ACCESS_KEY`
- `SUPERSET_OBJECT_STORAGE_SECRET_KEY`
- `SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE` (optional; use `0` for virtual-hosted S3)
- `SUPERSET_RESOURCE_PACK_BASE_URL`

`SUPERSET_RESOURCE_PACK_BASE_URL` must be a public HTTP(S) URL for the `packs/`
prefix, for example `https://downloads.superset.sh/packs`. It must not point at
localhost in release builds, and it must not include query parameters or hash
fragments.

## Storage Layout

The workflow uploads files under:

```text
packs/<pack-id>/<version>/manifest.json
packs/<pack-id>/<version>/pack.zip
```

When a manifest contains `archive`, the desktop app downloads `pack.zip` first,
extracts it into the local pack cache, and still verifies every file listed in
`files[]` by size and SHA-256. Release upload and verification are archive-only
by default so Canary publication does not spend time uploading or HEADing
thousands of package files. For a one-off compatibility investigation, pass
`--include-loose-files=true` to both upload and verification commands to publish
and validate the per-file fallback layout:

```text
packs/<pack-id>/<version>/<pack files>
```

The `capability-packages/` prefix is separate and should remain private.

## Bucket And CDN Policy

The release workflow signs S3-compatible `PUT` and `HEAD` requests with the
`SUPERSET_OBJECT_STORAGE_*` credentials. End users download packs through
unsigned HTTP(S), so the CDN or bucket policy must allow public `GET` and `HEAD`
for `packs/*`.

Keep public access scoped to `packs/*`. Do not make the whole bucket public.

## Preflight

Before enabling a published no-CLI Canary or stable release, verify the secrets
and public URL shape:

```bash
cd apps/desktop
bun run check:resource-pack-release-readiness
```

For local MinIO-only validation, use:

```bash
cd apps/desktop
bun run check:resource-pack-release-readiness -- --allow-local-base-url
```

The local escape hatch is not valid for GitHub release builds.

## Local Public MinIO Smoke

The online-like Docker stack includes MinIO on local port `43018`, but it binds
to `127.0.0.1` by default. That proves local S3-compatible upload/download
behavior, but it is not reachable from GitHub Actions or a Canary client on
another machine.

For a short public resource-pack smoke through a soft-router mapping, expose
only the MinIO API port:

```bash
SUPERSET_ONLINE_EXPOSE_RESOURCE_PACKS_PUBLIC=1 bun run online:start:loaded
```

Then map the public router port to this machine's `43018`. Do not expose the
MinIO console port `43019`.

When MinIO is exposed directly, the public base URL must include the bucket and
`packs` prefix:

```bash
export SUPERSET_OBJECT_STORAGE_ENDPOINT=http://localhost:43018
export SUPERSET_OBJECT_STORAGE_BUCKET=superset-artifacts
export SUPERSET_OBJECT_STORAGE_REGION=us-east-1
export SUPERSET_OBJECT_STORAGE_ACCESS_KEY=superset
export SUPERSET_OBJECT_STORAGE_SECRET_KEY=superset-local-artifacts
export SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE=1
export SUPERSET_RESOURCE_PACK_BASE_URL=http://<public-domain>:<public-port>/superset-artifacts/packs

cd apps/desktop
bun run check:resource-pack-release-readiness
bun run upload:resource-packs -- --pack-dir dist/resource-packs --prefix packs --include-loose-files=false
bun run verify:resource-pack-downloads -- --index dist/resource-packs/pack-manifest-index.json --include-loose-files=false
```

This is still a smoke environment, not the final production CDN. The production
release path should use repository secrets and a durable public bucket/CDN URL.

## Release Verification

Published build jobs run this sequence after pack construction:

```bash
bun run check:resource-pack-release-readiness
bun run upload:resource-packs -- --pack-dir dist/resource-packs --prefix packs --include-loose-files=false
bun run verify:resource-pack-downloads -- --index dist/resource-packs/pack-manifest-index.json --include-loose-files=false
```

`verify:resource-pack-downloads` fetches each remote pack manifest, issues a
`HEAD` for each archive, verifies `content-length` when present, and hash-checks
archives below the configured byte ceiling. When `--include-loose-files=true` is
set, it also verifies every file URL. A release should not be published if this
step fails.

## Production Smoke Workflow

After configuring or rotating the production object-storage secrets, run the
manual `Verify Desktop Resource Packs` GitHub Actions workflow before publishing
a no-CLI Canary or stable release. The workflow does not update GitHub Releases.
It builds the macOS arm64, macOS x64, and Linux x64 packs, uploads them to the
configured object storage, then verifies the public download URL by fetching
remote manifests and archives.

Use the default `include_loose_files=false` setting for normal release readiness.
Set `include_loose_files=true` only when investigating legacy per-file fallback
serving.

## Failure Matrix

- Missing object-storage secret: configure the missing GitHub secret and rerun
  the workflow. Published builds fail intentionally.
- `SUPERSET_RESOURCE_PACK_BASE_URL` points at localhost: replace it with the
  public CDN or bucket URL for `packs/`.
- Upload succeeds but download verification fails: check CDN origin mapping,
  cache invalidation, and public `GET` / `HEAD` policy for `packs/*`.
- `403` on `HEAD` only: the public policy likely allows `GET` but not `HEAD`.
  Allow both methods; the app and CI both rely on `HEAD`.
- Hash mismatch: delete the bad object for that pack version or publish a new
  pack version. Do not overwrite a verified pack version in place.
