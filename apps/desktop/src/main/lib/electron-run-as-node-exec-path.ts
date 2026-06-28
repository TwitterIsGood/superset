import { existsSync } from "node:fs";
import path from "node:path";

function getCurrentElectronAppSymlinkExecPath(execPath: string): string | null {
	const macOSDir = path.dirname(execPath);
	if (path.basename(macOSDir) !== "MacOS") return null;

	const contentsDir = path.dirname(macOSDir);
	if (path.basename(contentsDir) !== "Contents") return null;

	const appBundleDir = path.dirname(contentsDir);
	if (!appBundleDir.endsWith(".app")) return null;

	return path.join(
		path.dirname(appBundleDir),
		"Electron.app",
		"Contents",
		"MacOS",
		path.basename(execPath),
	);
}

export function resolveElectronRunAsNodeExecPath({
	execPath = process.execPath,
	isPackaged,
}: {
	execPath?: string;
	isPackaged: boolean;
}): string {
	if (isPackaged || existsSync(execPath)) return execPath;

	const symlinkExecPath = getCurrentElectronAppSymlinkExecPath(execPath);
	if (symlinkExecPath && existsSync(symlinkExecPath)) {
		return symlinkExecPath;
	}

	return execPath;
}
