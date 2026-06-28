import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "src/resources/public/file-icons");
const manifestPath = resolve(outDir, "manifest.json");

function hasGeneratedIcons(): boolean {
	if (!existsSync(manifestPath)) return false;
	if (!existsSync(outDir)) return false;
	return readdirSync(outDir).some((entry) => entry.endsWith(".svg"));
}

if (hasGeneratedIcons()) {
	console.log(`[desktop] file icons already exist at ${outDir}`);
} else {
	console.log("[desktop] file icons missing; generating them now");
	await import("./generate-file-icons");
}
