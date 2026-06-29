import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRequiredPackagedRuntimeFiles } from "../runtime-dependencies";
import { validatePackagedNativeRuntime } from "./validate-packaged-native-runtime";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const path = join(
		tmpdir(),
		`superset-packaged-native-runtime-${Date.now()}-${Math.random()
			.toString(16)
			.slice(2)}`,
	);
	mkdirSync(path, { recursive: true });
	tempDirs.push(path);
	return path;
}

function touch(path: string): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, "");
}

afterEach(() => {
	for (const path of tempDirs.splice(0)) {
		rmSync(path, { force: true, recursive: true });
	}
});

describe("validatePackagedNativeRuntime", () => {
	test("accepts a packaged macOS app with all native runtime bindings", () => {
		const appOutDir = makeTempDir();
		const nodeModulesDir = join(
			appOutDir,
			"Superset Canary.app",
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		);

		for (const file of getRequiredPackagedRuntimeFiles({
			targetArch: "arm64",
			targetPlatform: "darwin",
		})) {
			const path = join(nodeModulesDir, file.relativePath);
			touch(path);
			if (file.mustBeExecutable) {
				chmodSync(path, 0o755);
			}
		}

		const result = validatePackagedNativeRuntime({
			appOutDir,
			targetArch: "arm64",
			targetPlatform: "darwin",
		});

		expect(result.missingFiles).toEqual([]);
		expect(result.nonExecutableFiles).toEqual([]);
		expect(result.nodeModulesDir).toBe(nodeModulesDir);
		expect(result.requiredFiles).toContain(
			"better-sqlite3/build/Release/better_sqlite3.node",
		);
		expect(result.requiredFiles).toContain(
			"node-pty/prebuilds/darwin-arm64/spawn-helper",
		);
		expect(result.requiredFiles).toContain("ws/package.json");
		expect(result.requiredFiles).toContain("@xterm/headless/package.json");
		expect(result.requiredFiles).toContain(
			"@xterm/addon-serialize/package.json",
		);
	});

	test("rejects a packaged app that only contains native module JavaScript", () => {
		const appOutDir = makeTempDir();
		const nodeModulesDir = join(
			appOutDir,
			"Superset Canary.app",
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		);

		mkdirSync(join(nodeModulesDir, "better-sqlite3", "lib"), {
			recursive: true,
		});
		writeFileSync(join(nodeModulesDir, "better-sqlite3", "package.json"), "{}");
		expect(
			existsSync(
				join(
					nodeModulesDir,
					"better-sqlite3",
					"build",
					"Release",
					"better_sqlite3.node",
				),
			),
		).toBe(false);

		expect(() =>
			validatePackagedNativeRuntime({
				appOutDir,
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toThrow("better-sqlite3/build/Release/better_sqlite3.node");
	});

	test("rejects a packaged app missing the host-service websocket runtime package", () => {
		const appOutDir = makeTempDir();
		const nodeModulesDir = join(
			appOutDir,
			"Superset Canary.app",
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		);

		for (const file of getRequiredPackagedRuntimeFiles({
			targetArch: "arm64",
			targetPlatform: "darwin",
		})) {
			if (file.relativePath === "ws/package.json") {
				continue;
			}
			const path = join(nodeModulesDir, file.relativePath);
			touch(path);
			if (file.mustBeExecutable) {
				chmodSync(path, 0o755);
			}
		}

		expect(() =>
			validatePackagedNativeRuntime({
				appOutDir,
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toThrow("ws/package.json");
	});

	test("rejects a packaged macOS app with a non-executable node-pty spawn helper", () => {
		const appOutDir = makeTempDir();
		const nodeModulesDir = join(
			appOutDir,
			"Superset Canary.app",
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		);

		for (const file of getRequiredPackagedRuntimeFiles({
			targetArch: "arm64",
			targetPlatform: "darwin",
		})) {
			touch(join(nodeModulesDir, file.relativePath));
		}
		chmodSync(
			join(nodeModulesDir, "node-pty/prebuilds/darwin-arm64/spawn-helper"),
			0o644,
		);

		expect(() =>
			validatePackagedNativeRuntime({
				appOutDir,
				targetArch: "arm64",
				targetPlatform: "darwin",
			}),
		).toThrow("Not executable: node-pty/prebuilds/darwin-arm64/spawn-helper");
	});
});
