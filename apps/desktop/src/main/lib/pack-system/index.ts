import { app } from "electron";
import { SUPERSET_HOME_DIR } from "../app-environment";
import {
	loadPackManifestIndex,
	resolveEmbeddedPackManifestIndexPath,
} from "./manifest-index";
import { PackManager } from "./pack-manager";

let packManager: PackManager | null = null;

export function getPackManager(): PackManager {
	packManager ??= new PackManager({
		homeDir: SUPERSET_HOME_DIR,
		manifestIndex: loadPackManifestIndex(
			process.env,
			resolveEmbeddedPackManifestIndexPath({
				appPath: app.getAppPath(),
				bundleDir: __dirname,
				isPackaged: app.isPackaged,
				nodeEnv: process.env.NODE_ENV,
				resourcesPath: process.resourcesPath,
			}),
		),
		appVersion: app.getVersion(),
	});
	return packManager;
}

export { PackManager };
export * from "./types";
