import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { useHotkey } from "renderer/hotkeys";
import { useDashboardSidebarWorkspaceRemoval } from "renderer/routes/_authenticated/hooks/useDashboardSidebarWorkspaceRemoval";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { TopBar } from "./components/TopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

const DashboardSidebar = lazy(() =>
	import("./components/DashboardSidebar").then((module) => ({
		default: module.DashboardSidebar,
	})),
);

const DashboardSidebarDeleteDialog = lazy(() =>
	import(
		"./components/DashboardSidebar/components/DashboardSidebarDeleteDialog"
	).then((module) => ({
		default: module.DashboardSidebarDeleteDialog,
	})),
);

const DevSeedV2Sidebar = lazy(() =>
	import(
		"renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar/DevSeedV2Sidebar"
	).then((module) => ({
		default: module.DevSeedV2Sidebar,
	})),
);

interface DeleteTarget {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
}

function DashboardLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const collections = useCollections();
	const removeWorkspaceFromSidebar = useDashboardSidebarWorkspaceRemoval();

	const matchRoute = useMatchRoute();
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentV2WorkspaceId =
		v2WorkspaceMatch !== false ? v2WorkspaceMatch.workspaceId : null;

	const { data: currentV2Workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) =>
					eq(workspaces.id, currentV2WorkspaceId ?? ""),
				),
		[collections, currentV2WorkspaceId],
	);
	const currentV2Workspace =
		currentV2WorkspaceId != null ? (currentV2Workspaces[0] ?? null) : null;

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }));
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
		if (!isWorkspaceSidebarOpen) {
			setWorkspaceSidebarOpen(true);
		} else {
			toggleWorkspaceSidebarCollapsed();
		}
	});
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspaceModal(currentV2Workspace?.projectId),
	);

	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (
				currentV2WorkspaceId &&
				currentV2Workspace &&
				currentV2Workspace.type !== "main"
			) {
				setDeleteTarget({
					workspaceId: currentV2WorkspaceId,
					workspaceName: currentV2Workspace.name || currentV2Workspace.branch,
					open: true,
				});
			}
		},
		{
			enabled:
				!!currentV2WorkspaceId &&
				!!currentV2Workspace &&
				currentV2Workspace.type !== "main",
		},
	);

	const sidebarPanel = isWorkspaceSidebarOpen && (
		<ResizablePanel
			width={workspaceSidebarWidth}
			onWidthChange={setWorkspaceSidebarWidth}
			isResizing={isWorkspaceSidebarResizing}
			onResizingChange={setWorkspaceSidebarIsResizing}
			minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
			maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
			handleSide="right"
			clampWidth={false}
			onDoubleClickHandle={() =>
				setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
			}
		>
			<Suspense fallback={null}>
				<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
			</Suspense>
		</ResizablePanel>
	);

	const sidebarOutsideColumn =
		isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed();
	const isStandaloneChatRoute = location.pathname === "/chat";

	return (
		<div className="flex h-full w-full overflow-hidden">
			<CommandPaletteHost />
			{isWorkspaceSidebarOpen && (
				<Suspense fallback={null}>
					<DevSeedV2Sidebar />
				</Suspense>
			)}
			{sidebarOutsideColumn && sidebarPanel}
			<div className="flex flex-1 flex-col min-w-0 min-h-0">
				{!isStandaloneChatRoute && <TopBar />}
				<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
					{!sidebarOutsideColumn && sidebarPanel}
					<div className="flex flex-1 min-h-0 min-w-0">
						<Outlet />
					</div>
				</div>
			</div>
			<div id="workspace-right-sidebar-slot" className="flex h-full shrink-0" />
			<AddRepositoryModals />
			{deleteTarget && (
				<Suspense fallback={null}>
					<DashboardSidebarDeleteDialog
						workspaceId={deleteTarget.workspaceId}
						workspaceName={deleteTarget.workspaceName}
						open={deleteTarget.open}
						onOpenChange={(open) => {
							setDeleteTarget((target) =>
								target ? { ...target, open } : target,
							);
						}}
						onDeleted={() => {
							removeWorkspaceFromSidebar(deleteTarget.workspaceId);
							setDeleteTarget(null);
						}}
					/>
				</Suspense>
			)}
		</div>
	);
}
