import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

function runBash(script: string) {
	return spawnSync("bash", ["-lc", script], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
	});
}

function shellString(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function expectShellSuccess(result: ReturnType<typeof spawnSync>): void {
	if (result.status !== 0) {
		throw new Error(
			`Shell command failed with status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}
}

function withWorkRoot(run: (workRoot: string) => void): void {
	const workRoot = mkdtempSync(join(tmpdir(), "superset-worktree-shell-"));
	try {
		run(workRoot);
	} finally {
		rmSync(workRoot, { recursive: true, force: true });
	}
}

function worktreePathHash(root: string): string {
	return createHash("sha1")
		.update(realpathSync(root))
		.digest("hex")
		.slice(0, 10);
}

function sanitizeName(value: string): string {
	return (
		value
			.toLowerCase()
			.replaceAll(/[^a-z0-9._-]/g, "-")
			.replaceAll(/--+/g, "-")
			.replaceAll(/^-|-$/g, "")
			.slice(0, 48) || "workspace"
	);
}

function defaultWorkspaceName(root: string): string {
	const physical = realpathSync(root);
	const base = sanitizeName(basename(physical)).slice(0, 36);
	return `${base}-${worktreePathHash(root)}`;
}

function defaultDbProject(root: string): string {
	return `superset-${defaultWorkspaceName(root)}`;
}

function expectedHomeDir(root: string): string {
	return `${realpathSync(root)}/superset-dev-data`;
}

function writeManagedEnv(envPath: string, root: string): void {
	writeFileSync(
		envPath,
		[
			"# ===== Local workspace overrides (setup.local.sh) =====",
			`SUPERSET_WORKTREE_ID="${worktreePathHash(root)}"`,
			`SUPERSET_WORKTREE_ROOT="${realpathSync(root)}"`,
			`SUPERSET_HOME_DIR="${expectedHomeDir(root)}"`,
			'SUPERSET_PORT_BASE="3000"',
			`LOCAL_DB_PROJECT="${defaultDbProject(root)}"`,
			'LOCAL_PG_PORT="3014"',
			'LOCAL_ELECTRIC_PORT="3009"',
			'LOCAL_REDIS_PORT="3016"',
			'LOCAL_KV_REST_PORT="3017"',
			'LOCAL_S3_PORT="3019"',
			'LOCAL_S3_CONSOLE_PORT="3020"',
			'API_PORT="3001"',
			'DESKTOP_VITE_PORT="3005"',
			'CADDY_ELECTRIC_PORT="3010"',
			'WRANGLER_PORT="3012"',
			'RELAY_PORT="3013"',
			'DATABASE_URL="postgres://postgres:postgres@localhost:3014/main"',
			'DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"',
			'KV_REST_API_URL="http://localhost:3017"',
			'KV_URL="redis://localhost:3016"',
			'ELECTRIC_URL="http://localhost:3009/v1/shape"',
			'NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"',
			'NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"',
			'NEXT_PUBLIC_API_URL="http://localhost:3001"',
			'NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"',
			'RELAY_URL="http://localhost:3013"',
			'NEXT_PUBLIC_RELAY_URL="http://localhost:3013"',
			"",
		].join("\n"),
	);
}

describe("worktree local shell helpers", () => {
	test("derives different default compose projects for same-named worktree paths", () => {
		withWorkRoot((workRoot) => {
			const first = join(workRoot, "first", "superset");
			const second = join(workRoot, "second", "superset");
			mkdirSync(first, { recursive: true });
			mkdirSync(second, { recursive: true });

			const result = runBash(`
					set -euo pipefail
					source .superset/lib/worktree-local.sh
					first_project="$(worktree_default_db_project ${shellString(first)})"
			second_project="$(worktree_default_db_project ${shellString(second)})"
			[[ "$first_project" == superset-superset-* ]]
			[[ "$second_project" == superset-superset-* ]]
				[[ "$first_project" != "$second_project" ]]
			`);

			expectShellSuccess(result);
		});
	});

	test("detects missing or stale managed local setup", () => {
		withWorkRoot((workRoot) => {
			const root = join(workRoot, "review", "superset");
			const envPath = join(workRoot, ".env");
			mkdirSync(root, { recursive: true });
			writeManagedEnv(envPath, root);

			const validEnv = runBash(`
				set -euo pipefail
				source .superset/lib/worktree-local.sh
				root=${shellString(root)}
				env_path=${shellString(envPath)}
				worktree_env_requires_local_setup "$root" "$env_path"
			`);
			if (validEnv.status !== 1) {
				throw new Error(
					`Expected valid env status 1, got ${validEnv.status}\nstdout:\n${validEnv.stdout}\nstderr:\n${validEnv.stderr}\nenv:\n${readFileSync(envPath, "utf8")}`,
				);
			}

			const originalEnv = readFileSync(envPath, "utf8");
			writeFileSync(
				envPath,
				originalEnv.replace(
					/^DATABASE_URL=.*$/m,
					'DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"',
				),
			);
			const remoteDatabaseEnv = runBash(`
				set -euo pipefail
				source .superset/lib/worktree-local.sh
				root=${shellString(root)}
				env_path=${shellString(envPath)}
				worktree_env_requires_local_setup "$root" "$env_path"
			`);
			expect(remoteDatabaseEnv.status).toBe(0);

			writeFileSync(
				envPath,
				originalEnv.replace(
					/^NEXT_PUBLIC_ELECTRIC_URL=.*$/m,
					'NEXT_PUBLIC_ELECTRIC_URL="https://localhost:3010"',
				),
			);
			const caddyEnv = runBash(`
				set -euo pipefail
				source .superset/lib/worktree-local.sh
				root=${shellString(root)}
				env_path=${shellString(envPath)}
				worktree_env_requires_local_setup "$root" "$env_path"
			`);
			expect(caddyEnv.status).toBe(0);

			writeFileSync(
				envPath,
				originalEnv.replace(
					/^SUPERSET_WORKTREE_ID=.*$/m,
					'SUPERSET_WORKTREE_ID="stale"',
				),
			);
			const staleEnv = runBash(`
				set -euo pipefail
				source .superset/lib/worktree-local.sh
				root=${shellString(root)}
				env_path=${shellString(envPath)}
				worktree_env_requires_local_setup "$root" "$env_path"
			`);
			expect(staleEnv.status).toBe(0);
		});
	}, 10_000);

	test("rejects non-local service URLs before destructive worktree actions", () => {
		withWorkRoot((workRoot) => {
			const root = join(workRoot, "remote-env", "superset");
			mkdirSync(root, { recursive: true });

			const result = runBash(`
			set -euo pipefail
			source .superset/lib/common.sh
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			export SUPERSET_WORKTREE_ID="$(worktree_path_hash "$root")"
			export SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
			export SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
			export SUPERSET_PORT_BASE=3000
			export LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
			export LOCAL_PG_PORT=3014
			export LOCAL_ELECTRIC_PORT=3009
			export LOCAL_REDIS_PORT=3016
			export LOCAL_KV_REST_PORT=3017
			export LOCAL_S3_PORT=3019
			export LOCAL_S3_CONSOLE_PORT=3020
			export API_PORT=3001
			export DESKTOP_VITE_PORT=3005
			export WRANGLER_PORT=3012
			export CADDY_ELECTRIC_PORT=3010
			export RELAY_PORT=3013
			export DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"
			export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
			export KV_REST_API_URL="http://localhost:3017"
			export KV_URL="redis://localhost:3016"
			export ELECTRIC_URL="http://localhost:3009/v1/shape"
			export NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"
			export NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"
			export NEXT_PUBLIC_API_URL="http://localhost:3001"
			export NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
			export RELAY_URL="http://localhost:3013"
			export NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
			set +e
			assert_output="$(worktree_assert_current_local_env "$root" 2>&1)"
			assert_status="$?"
			set -e
			printf '%s\n' "$assert_output"
			[ "$assert_status" -ne 0 ]
		`);

			expect(result.status).not.toBe(0);
		});
	});

	test("rejects caddy Electric URLs because worktree dev only starts Wrangler", () => {
		withWorkRoot((workRoot) => {
			const root = join(workRoot, "caddy-env", "superset");
			mkdirSync(root, { recursive: true });

			const result = runBash(`
			set -euo pipefail
			source .superset/lib/common.sh
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			export SUPERSET_WORKTREE_ID="$(worktree_path_hash "$root")"
			export SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
			export SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
			export SUPERSET_PORT_BASE=3000
			export LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
			export LOCAL_PG_PORT=3014
			export LOCAL_ELECTRIC_PORT=3009
			export LOCAL_REDIS_PORT=3016
			export LOCAL_KV_REST_PORT=3017
			export LOCAL_S3_PORT=3019
			export LOCAL_S3_CONSOLE_PORT=3020
			export API_PORT=3001
			export DESKTOP_VITE_PORT=3005
			export WRANGLER_PORT=3012
			export CADDY_ELECTRIC_PORT=3010
			export RELAY_PORT=3013
			export DATABASE_URL="postgres://postgres:postgres@localhost:3014/main"
			export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
			export KV_REST_API_URL="http://localhost:3017"
			export KV_URL="redis://localhost:3016"
			export ELECTRIC_URL="http://localhost:3009/v1/shape"
			export NEXT_PUBLIC_ELECTRIC_URL="https://localhost:3010"
			export NEXT_PUBLIC_ELECTRIC_PROXY_URL="https://localhost:3010"
			export NEXT_PUBLIC_API_URL="http://localhost:3001"
			export NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
			export RELAY_URL="http://localhost:3013"
			export NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
			set +e
			assert_output="$(worktree_assert_current_local_env "$root" 2>&1)"
			assert_status="$?"
			set -e
			printf '%s\n' "$assert_output"
			[ "$assert_status" -ne 0 ]
		`);

			expect(result.status).not.toBe(0);
		});
	});
});
