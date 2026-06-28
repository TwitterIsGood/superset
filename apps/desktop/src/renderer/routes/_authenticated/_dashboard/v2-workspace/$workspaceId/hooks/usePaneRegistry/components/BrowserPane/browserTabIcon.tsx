import type { Tab } from "@superset/panes";
import type { BrowserPaneData, PaneViewerData } from "../../../../types";

function getSingleBrowserPane(
	tab: Tab<PaneViewerData>,
): { id: string; data: BrowserPaneData } | null {
	const paneIds = Object.keys(tab.panes);
	if (paneIds.length !== 1) return null;
	const pane = tab.panes[paneIds[0]];
	if (pane.kind !== "browser") return null;
	return { id: pane.id, data: pane.data as BrowserPaneData };
}

export function renderBrowserTabIcon(tab: Tab<PaneViewerData>) {
	const browser = getSingleBrowserPane(tab);
	if (!browser?.data.faviconUrl) return null;
	return (
		<img src={browser.data.faviconUrl} alt="" className="size-3.5 shrink-0" />
	);
}
