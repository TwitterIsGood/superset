import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveElectronRunAsNodeExecPath } from "./electron-run-as-node-exec-path";

const roots: string[] = [];

function makeRoot(): string {
	const root = path.join(
		tmpdir(),
		`electron-run-as-node-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	mkdirSync(root, { recursive: true });
	roots.push(root);
	return root;
}

function touchExecutable(filePath: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, "");
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe("resolveElectronRunAsNodeExecPath", () => {
	test("keeps packaged execPath unchanged even if the file is missing", () => {
		const missingPath = path.join(makeRoot(), "Missing.app/Contents/MacOS/App");

		expect(
			resolveElectronRunAsNodeExecPath({
				execPath: missingPath,
				isPackaged: true,
			}),
		).toBe(missingPath);
	});

	test("keeps development execPath unchanged when it exists", () => {
		const execPath = path.join(
			makeRoot(),
			"Electron.app/Contents/MacOS/Electron",
		);
		touchExecutable(execPath);

		expect(
			resolveElectronRunAsNodeExecPath({
				execPath,
				isPackaged: false,
			}),
		).toBe(execPath);
	});

	test("falls back to the current Electron.app symlink when a branded dev bundle went stale", () => {
		const root = makeRoot();
		const currentBundle = path.join(root, "Superset (current).app");
		const currentExec = path.join(currentBundle, "Contents/MacOS/Electron");
		const staleExec = path.join(
			root,
			"Superset (stale).app/Contents/MacOS/Electron",
		);
		touchExecutable(currentExec);
		symlinkSync(currentBundle, path.join(root, "Electron.app"));

		expect(existsSync(staleExec)).toBe(false);
		expect(
			resolveElectronRunAsNodeExecPath({
				execPath: staleExec,
				isPackaged: false,
			}),
		).toBe(path.join(root, "Electron.app/Contents/MacOS/Electron"));
	});
});
