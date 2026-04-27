import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "../process-manager";

export async function screenshot(udid: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "device-bridge-ios-shot-"));
	const file = path.join(dir, "shot.png");
	try {
		const result = await run("xcrun", ["simctl", "io", udid, "screenshot", file], { timeout: 15_000 });
		if (!result.ok) return { ok: false, error: result.stderr };
		const buffer = await readFile(file);
		return { ok: true, dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
