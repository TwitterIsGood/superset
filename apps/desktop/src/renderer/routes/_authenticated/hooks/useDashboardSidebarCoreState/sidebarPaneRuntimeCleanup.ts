import type { Pane } from "@superset/panes";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";

function getTerminalRuntimeId(pane: Pane<unknown>): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as { terminalId?: unknown };
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function getBrowserRuntimeId(pane: Pane<unknown>): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

export async function cleanupWorkspacePaneRuntimes(
	rows: PaneLifecycleRow[],
): Promise<void> {
	const terminalIds = extractPaneIds(rows, getTerminalRuntimeId);
	const browserIds = extractPaneIds(rows, getBrowserRuntimeId);
	if (terminalIds.size === 0 && browserIds.size === 0) return;

	const [terminalRuntime, browserRuntime] = await Promise.all([
		terminalIds.size > 0
			? import("renderer/lib/terminal/terminal-runtime-registry")
			: Promise.resolve(null),
		browserIds.size > 0
			? import(
					"renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry"
				)
			: Promise.resolve(null),
	]);

	for (const terminalId of terminalIds) {
		terminalRuntime?.terminalRuntimeRegistry.release(terminalId);
	}
	for (const browserId of browserIds) {
		browserRuntime?.browserRuntimeRegistry.destroy(browserId);
	}
}
