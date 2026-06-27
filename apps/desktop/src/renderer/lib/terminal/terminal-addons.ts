import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Utf8Base64 } from "./clipboard-base64";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

function canUseWebglRenderer(): boolean {
	return suggestedRendererType !== "dom";
}

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances. WebGL is deferred to rAF to avoid
 * racing with xterm's post-open viewport sync.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;

	// Utf8Base64 replaces the addon's UTF-8-unsafe default codec (#4839).
	terminal.loadAddon(new ClipboardAddon(new Utf8Base64()));

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

	const progressAddon = new ProgressAddon();
	terminal.loadAddon(progressAddon);

	const rafId = requestAnimationFrame(() => {
		void (async () => {
			if (disposed || !canUseWebglRenderer()) return;

			try {
				const { WebglAddon } = await import("@xterm/addon-webgl");
				if (disposed || !canUseWebglRenderer()) return;

				const addon = new WebglAddon();
				webglAddon = addon;
				addon.onContextLoss(() => {
					addon.dispose();
					if (webglAddon === addon) {
						webglAddon = null;
					}
					suggestedRendererType = "dom";
					terminal.refresh(0, terminal.rows - 1);
				});
				terminal.loadAddon(addon);
			} catch {
				if (!disposed) {
					suggestedRendererType = "dom";
				}
				webglAddon = null;
			}
		})();
	});

	return {
		searchAddon,
		progressAddon,
		dispose: () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			try {
				webglAddon?.dispose();
			} catch {}
			webglAddon = null;
		},
	};
}
