import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const idbDir = resolve(
	import.meta.dir,
	"../../../packages/device-bridge/bin/idb",
);

for (const relativePath of [
	"FBDeviceControl.framework/Versions/A/Frameworks",
	"FBSimulatorControl.framework/Versions/A/Frameworks",
	"XCTestBootstrap.framework/Versions/A/Frameworks",
]) {
	mkdirSync(join(idbDir, relativePath), { recursive: true });
}
