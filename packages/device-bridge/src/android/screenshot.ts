import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function screenshot(
	deviceId?: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
	const args = deviceId
		? ["-s", deviceId, "exec-out", "screencap", "-p"]
		: ["exec-out", "screencap", "-p"];
	try {
		const result = await execFileAsync("adb", args, {
			timeout: 12_000,
			maxBuffer: 1024 * 1024 * 20,
			encoding: "buffer",
		});
		return {
			ok: true,
			dataUrl: `data:image/png;base64,${result.stdout.toString("base64")}`,
		};
	} catch (error) {
		const failed = error as Partial<{ stderr: unknown; message: unknown }>;
		return { ok: false, error: String(failed.stderr ?? failed.message) };
	}
}
