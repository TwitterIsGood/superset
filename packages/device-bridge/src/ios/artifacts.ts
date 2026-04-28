import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const idbDir = resolve(packageRoot, "bin/idb");

export function getDefaultIdbArtifacts() {
	return {
		protoPath: resolve(packageRoot, "proto/idb.proto"),
		companionPath: resolve(idbDir, "idb_companion"),
		companionFrameworkPath: idbDir,
	};
}
