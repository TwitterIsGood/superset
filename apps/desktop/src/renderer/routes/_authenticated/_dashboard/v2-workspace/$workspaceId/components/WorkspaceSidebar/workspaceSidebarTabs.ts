export type SidebarTabId = "changes" | "files" | "review" | "models";

const VALID_TAB_IDS: readonly SidebarTabId[] = [
	"changes",
	"files",
	"review",
	"models",
];

export function isSidebarTabId(tab: string): tab is SidebarTabId {
	return (VALID_TAB_IDS as readonly string[]).includes(tab);
}

export function resolveWorkspaceSidebarActiveTab(tab: unknown): SidebarTabId {
	return typeof tab === "string" && isSidebarTabId(tab) ? tab : "changes";
}
