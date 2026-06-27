import { useLocation, useParams } from "@tanstack/react-router";
import { Wifi } from "lucide-react";
import { lazy, Suspense } from "react";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { NavigationControls } from "../NavigationControls";
import { SidebarToggle } from "../SidebarToggle";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { WindowControls } from "./components/WindowControls";

const LazyOpenInMenuButton = lazy(async () => ({
	default: (await import("./components/OpenInMenuButton")).OpenInMenuButton,
}));

const LazyRightSidebarToggle = lazy(async () => ({
	default: (await import("./components/RightSidebarToggle")).RightSidebarToggle,
}));

const LazyV2WorkspaceOpenInButton = lazy(async () => ({
	default: (await import("./components/V2WorkspaceOpenInButton"))
		.V2WorkspaceOpenInButton,
}));

const LazyV2WorkspaceTitle = lazy(async () => ({
	default: (await import("./components/V2WorkspaceTitle")).V2WorkspaceTitle,
}));

export function TopBar() {
	const location = useLocation();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const v2WorkspaceMatch = location.pathname.match(/^\/v2-workspace\/([^/]+)/);
	const v2WorkspaceId = v2WorkspaceMatch?.[1] ?? null;
	const isV2WorkspaceRoute = v2WorkspaceId !== null;
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId && !isV2WorkspaceRoute },
	);
	const isOnline = useOnlineStatus();
	const isSidebarOpen = useWorkspaceSidebarStore((s) => s.isOpen);
	const isSidebarCollapsed = useWorkspaceSidebarStore((s) => s.isCollapsed());
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";
	// In v2 the expanded sidebar lives outside the TopBar column, so the TopBar
	// starts to the right of it and the sidebar header hosts the traffic-light
	// pad + SidebarToggle. When the sidebar is closed or collapsed (too narrow
	// for the pad), bring the toggle and pad back into the TopBar.
	const sidebarHostsChrome = isSidebarOpen && !isSidebarCollapsed;

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-muted/45 border-b border-border relative dark:bg-muted/35">
			<div
				className="flex items-center gap-1.5 h-full"
				style={{
					paddingLeft: isMac && !sidebarHostsChrome ? "80px" : "16px",
				}}
			>
				{!sidebarHostsChrome && (
					<>
						<SidebarToggle />
						<NavigationControls />
					</>
				)}
			</div>

			<div className="flex min-w-0 flex-1 items-center justify-start">
				{isV2WorkspaceRoute && v2WorkspaceId && (
					<Suspense fallback={null}>
						<LazyV2WorkspaceTitle workspaceId={v2WorkspaceId} />
					</Suspense>
				)}
			</div>

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{!sidebarHostsChrome && <ResourceConsumption surface="v2" />}
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<Wifi className="size-3.5" />
						<span>Offline</span>
					</div>
				)}
				{isV2WorkspaceRoute && v2WorkspaceId ? (
					<Suspense fallback={null}>
						<LazyV2WorkspaceOpenInButton workspaceId={v2WorkspaceId} />
					</Suspense>
				) : workspace?.worktreePath ? (
					<Suspense fallback={null}>
						<LazyOpenInMenuButton
							worktreePath={workspace.worktreePath}
							branch={workspace.worktree?.branch}
							projectId={workspace.project?.id}
						/>
					</Suspense>
				) : null}
				{isV2WorkspaceRoute && (
					<Suspense fallback={null}>
						<LazyRightSidebarToggle />
					</Suspense>
				)}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
