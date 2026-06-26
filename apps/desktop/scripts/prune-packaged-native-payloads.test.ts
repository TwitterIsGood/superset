import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	normalizeBuilderArch,
	prunePackagedNativePayloads,
} from "./prune-packaged-native-payloads";

const tempDirs: string[] = [];

function createTempAppOutDir(mac = true): {
	appOutDir: string;
	nodeModulesDir: string;
} {
	const root = mkdtempSync(join(tmpdir(), "superset-native-prune-"));
	tempDirs.push(root);

	const appOutDir = join(root, mac ? "mac-arm64" : "linux-unpacked");
	const appBundleDir = join(appOutDir, "Superset.app");
	const nodeModulesDir = mac
		? join(
				appBundleDir,
				"Contents",
				"Resources",
				"app.asar.unpacked",
				"node_modules",
			)
		: join(appOutDir, "resources", "app.asar.unpacked", "node_modules");
	mkdirSync(nodeModulesDir, { recursive: true });

	return { appOutDir, nodeModulesDir };
}

function touch(path: string): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, "fixture");
}

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

describe("normalizeBuilderArch", () => {
	test("maps electron-builder numeric arch ids to Node arch names", () => {
		expect(normalizeBuilderArch(0)).toBe("ia32");
		expect(normalizeBuilderArch(1)).toBe("x64");
		expect(normalizeBuilderArch(3)).toBe("arm64");
		expect(normalizeBuilderArch(4)).toBe("universal");
		expect(normalizeBuilderArch("3")).toBe("arm64");
		expect(normalizeBuilderArch("arm64")).toBe("arm64");
	});
});

describe("prunePackagedNativePayloads", () => {
	test("removes non-target native payloads from a mac arm64 app bundle", async () => {
		const { appOutDir, nodeModulesDir } = createTempAppOutDir(true);

		touch(
			join(
				nodeModulesDir,
				"onnxruntime-node/bin/napi-v3/darwin/arm64/onnxruntime_binding.node",
			),
		);
		touch(
			join(
				nodeModulesDir,
				"onnxruntime-node/bin/napi-v3/darwin/x64/onnxruntime_binding.node",
			),
		);
		touch(
			join(
				nodeModulesDir,
				"onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node",
			),
		);

		touch(join(nodeModulesDir, "koffi/build/koffi/darwin_arm64/koffi.node"));
		touch(join(nodeModulesDir, "koffi/build/koffi/darwin_x64/koffi.node"));
		touch(join(nodeModulesDir, "koffi/build/koffi/linux_x64/koffi.node"));
		touch(join(nodeModulesDir, "koffi/doc/index.html"));
		touch(join(nodeModulesDir, "koffi/src/koffi/source.cc"));
		touch(
			join(nodeModulesDir, "koffi/vendor/node-api-headers/include/node_api.h"),
		);

		touch(join(nodeModulesDir, "node-pty/prebuilds/darwin-arm64/pty.node"));
		touch(join(nodeModulesDir, "node-pty/prebuilds/darwin-x64/pty.node"));
		touch(join(nodeModulesDir, "node-pty/prebuilds/win32-x64/pty.node"));
		touch(join(nodeModulesDir, "node-pty/prebuilds/win32-x64/pty.pdb"));
		touch(join(nodeModulesDir, "node-pty/build/Release/pty.node"));
		touch(join(nodeModulesDir, "node-pty/deps/winpty/README.md"));
		touch(join(nodeModulesDir, "node-pty/third_party/conpty/README.md"));

		const result = await prunePackagedNativePayloads({
			appOutDir,
			targetArch: "arm64",
			targetPlatform: "darwin",
		});

		expect(result.nodeModulesDir).toBe(nodeModulesDir);
		expect(
			existsSync(
				join(
					nodeModulesDir,
					"onnxruntime-node/bin/napi-v3/darwin/arm64/onnxruntime_binding.node",
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(nodeModulesDir, "onnxruntime-node/bin/napi-v3/darwin/x64"),
			),
		).toBe(false);
		expect(
			existsSync(join(nodeModulesDir, "onnxruntime-node/bin/napi-v3/linux")),
		).toBe(false);

		expect(
			existsSync(join(nodeModulesDir, "koffi/build/koffi/darwin_arm64")),
		).toBe(true);
		expect(
			existsSync(join(nodeModulesDir, "koffi/build/koffi/darwin_x64")),
		).toBe(false);
		expect(existsSync(join(nodeModulesDir, "koffi/doc"))).toBe(false);
		expect(existsSync(join(nodeModulesDir, "koffi/src"))).toBe(false);
		expect(existsSync(join(nodeModulesDir, "koffi/vendor"))).toBe(false);

		expect(
			existsSync(join(nodeModulesDir, "node-pty/prebuilds/darwin-arm64")),
		).toBe(true);
		expect(
			existsSync(join(nodeModulesDir, "node-pty/prebuilds/darwin-x64")),
		).toBe(false);
		expect(
			existsSync(join(nodeModulesDir, "node-pty/prebuilds/win32-x64")),
		).toBe(false);
		expect(existsSync(join(nodeModulesDir, "node-pty/build"))).toBe(false);
		expect(existsSync(join(nodeModulesDir, "node-pty/deps"))).toBe(false);
		expect(existsSync(join(nodeModulesDir, "node-pty/third_party"))).toBe(
			false,
		);
	});

	test("keeps Linux build fallback while pruning unrelated payloads", async () => {
		const { appOutDir, nodeModulesDir } = createTempAppOutDir(false);

		touch(
			join(
				nodeModulesDir,
				"onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node",
			),
		);
		touch(
			join(
				nodeModulesDir,
				"onnxruntime-node/bin/napi-v3/darwin/arm64/onnxruntime_binding.node",
			),
		);

		touch(join(nodeModulesDir, "koffi/build/koffi/linux_x64/koffi.node"));
		touch(join(nodeModulesDir, "koffi/build/koffi/musl_x64/koffi.node"));
		touch(join(nodeModulesDir, "koffi/build/koffi/darwin_arm64/koffi.node"));

		touch(join(nodeModulesDir, "node-pty/build/Release/pty.node"));
		touch(join(nodeModulesDir, "node-pty/prebuilds/darwin-arm64/pty.node"));

		await prunePackagedNativePayloads({
			appOutDir,
			targetArch: "x64",
			targetPlatform: "linux",
		});

		expect(
			existsSync(
				join(
					nodeModulesDir,
					"onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node",
				),
			),
		).toBe(true);
		expect(
			existsSync(join(nodeModulesDir, "onnxruntime-node/bin/napi-v3/darwin")),
		).toBe(false);

		expect(
			existsSync(join(nodeModulesDir, "koffi/build/koffi/linux_x64")),
		).toBe(true);
		expect(existsSync(join(nodeModulesDir, "koffi/build/koffi/musl_x64"))).toBe(
			true,
		);
		expect(
			existsSync(join(nodeModulesDir, "koffi/build/koffi/darwin_arm64")),
		).toBe(false);

		expect(
			existsSync(join(nodeModulesDir, "node-pty/build/Release/pty.node")),
		).toBe(true);
		expect(
			existsSync(join(nodeModulesDir, "node-pty/prebuilds/darwin-arm64")),
		).toBe(false);
	});
});
