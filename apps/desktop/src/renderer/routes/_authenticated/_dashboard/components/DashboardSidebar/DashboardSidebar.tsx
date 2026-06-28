import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo } from "react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { DashboardModeSwitcher } from "./components/DashboardModeSwitcher";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarHelpMenu } from "./components/DashboardSidebarHelpMenu";
import { DashboardSidebarHoverCardOverlay } from "./components/DashboardSidebarHoverCardOverlay";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { DashboardSidebarSectionRenameProvider } from "./components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { DashboardSidebarHoverProvider } from "./providers/DashboardSidebarHoverProvider";
import type { DashboardSidebarProject } from "./types";
import {
	type DashboardMode,
	getDashboardModeForPath,
} from "./utils/dashboardMode";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

const DashboardSidebarProjectsDndList = lazy(() =>
	import("./components/DashboardSidebarProjectsDndList").then((module) => ({
		default: module.DashboardSidebarProjectsDndList,
	})),
);

const DashboardSidebarPortsList = lazy(() =>
	import("./components/DashboardSidebarPortsList").then((module) => ({
		default: module.DashboardSidebarPortsList,
	})),
);

const DashboardChatSidebar = lazy(() =>
	import("./components/DashboardChatSidebar").then((module) => ({
		default: module.DashboardChatSidebar,
	})),
);

const DashboardWorkSidebar = lazy(() =>
	import("./components/DashboardWorkSidebar").then((module) => ({
		default: module.DashboardWorkSidebar,
	})),
);

const V2SetupScriptCard = lazy(() =>
	import("./components/V2SetupScriptCard").then((module) => ({
		default: module.V2SetupScriptCard,
	})),
);

function shouldEnableDashboardSidebarDnd(pathname: string): boolean {
	return pathname === "/v2-workspaces" || pathname.startsWith("/v2-workspace/");
}

function getDashboardRoutePathname(routerPathname: string): string {
	if (typeof window === "undefined") return routerPathname;
	const hashPathname = window.location.hash.match(/^#([^?]*)/)?.[1];
	return hashPathname && hashPathname !== "/" ? hashPathname : routerPathname;
}

interface DashboardSidebarStaticProjectsListProps {
	groups: DashboardSidebarProject[];
	isCollapsed: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
}

function DashboardSidebarStaticProjectsList({
	groups,
	isCollapsed,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
}: DashboardSidebarStaticProjectsListProps) {
	return (
		<>
			{groups.map((project) => (
				<DashboardSidebarProjectSection
					key={project.id}
					project={project}
					isSidebarCollapsed={isCollapsed}
					enableDnd={false}
					workspaceShortcutLabels={workspaceShortcutLabels}
					onWorkspaceHover={onWorkspaceHover}
					onToggleCollapse={onToggleCollapse}
				/>
			))}
		</>
	);
}

function getSearchStringValue(search: unknown, key: string): string | null {
	if (!search || typeof search !== "object") return null;
	const value = (search as Record<string, unknown>)[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { groups, refreshWorkspacePullRequest, toggleProjectCollapsed } =
		useDashboardSidebarData();
	const navigate = useNavigate();
	const location = useLocation();
	const matchRoute = useMatchRoute();
	const dashboardMode = getDashboardModeForPath(location.pathname);
	const activeChatSessionId = getSearchStringValue(
		location.search,
		"chatSessionId",
	);
	const settingsHotkey = useHotkeyDisplay("OPEN_SETTINGS").text;
	const isSettingsOpen = !!matchRoute({ to: "/settings", fuzzy: true });
	const { activeHostUrl } = useLocalHostService();
	const dashboardRoutePathname = getDashboardRoutePathname(location.pathname);
	const activeV2WorkspaceId =
		dashboardRoutePathname.match(/^\/v2-workspace\/([^/]+)/)?.[1] ?? null;
	const shouldEnableDnd = shouldEnableDashboardSidebarDnd(
		dashboardRoutePathname,
	);
	const orderedGroups = groups;

	const workspaceShortcutLabels = useDashboardSidebarShortcuts(orderedGroups);

	const activeV2Project = useMemo(() => {
		if (!activeV2WorkspaceId) return null;
		for (const project of groups) {
			for (const child of project.children) {
				if (
					child.type === "workspace" &&
					child.workspace.id === activeV2WorkspaceId
				) {
					return project;
				}
				if (child.type === "section") {
					for (const ws of child.section.workspaces) {
						if (ws.id === activeV2WorkspaceId) return project;
					}
				}
			}
		}
		return null;
	}, [groups, activeV2WorkspaceId]);

	const handleModeChange = useCallback(
		(nextMode: DashboardMode) => {
			if (nextMode === "code") {
				if (activeV2WorkspaceId) {
					void navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: activeV2WorkspaceId },
						search: {},
					});
					return;
				}
				void navigate({ to: "/v2-workspaces" });
				return;
			}

			if (nextMode === "chat") {
				void navigate({ to: "/chat" });
				return;
			}

			if (activeV2WorkspaceId) {
				void navigate({
					to: "/v2-workspace/$workspaceId/work",
					params: { workspaceId: activeV2WorkspaceId },
				});
				return;
			}
			void navigate({ to: "/work" });
		},
		[activeV2WorkspaceId, navigate],
	);

	return (
		<DashboardSidebarSectionRenameProvider>
			<DashboardSidebarHoverProvider>
				<DashboardSidebarHoverCardOverlay>
					<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
						<DashboardSidebarHeader
							isCollapsed={isCollapsed}
							modeSwitcher={
								<DashboardModeSwitcher
									mode={dashboardMode}
									isCollapsed={isCollapsed}
									onModeChange={handleModeChange}
								/>
							}
							showCodeNavigation={dashboardMode === "code"}
						/>

						{dashboardMode === "code" ? (
							<>
								<div className="flex-1 overflow-y-auto hide-scrollbar">
									{shouldEnableDnd ? (
										<Suspense
											fallback={
												<DashboardSidebarStaticProjectsList
													groups={orderedGroups}
													isCollapsed={isCollapsed}
													workspaceShortcutLabels={workspaceShortcutLabels}
													onWorkspaceHover={refreshWorkspacePullRequest}
													onToggleCollapse={toggleProjectCollapsed}
												/>
											}
										>
											<DashboardSidebarProjectsDndList
												groups={orderedGroups}
												isCollapsed={isCollapsed}
												workspaceShortcutLabels={workspaceShortcutLabels}
												onWorkspaceHover={refreshWorkspacePullRequest}
												onToggleCollapse={toggleProjectCollapsed}
											/>
										</Suspense>
									) : (
										<DashboardSidebarStaticProjectsList
											groups={orderedGroups}
											isCollapsed={isCollapsed}
											workspaceShortcutLabels={workspaceShortcutLabels}
											onWorkspaceHover={refreshWorkspacePullRequest}
											onToggleCollapse={toggleProjectCollapsed}
										/>
									)}
								</div>
								{!isCollapsed && (
									<Suspense fallback={null}>
										<DashboardSidebarPortsList />
									</Suspense>
								)}
								{!isCollapsed && activeV2Project && activeHostUrl && (
									<Suspense fallback={null}>
										<V2SetupScriptCard
											hostUrl={activeHostUrl}
											projectId={activeV2Project.id}
											projectName={activeV2Project.name}
										/>
									</Suspense>
								)}
							</>
						) : dashboardMode === "chat" ? (
							<Suspense fallback={null}>
								<DashboardChatSidebar
									activeSessionId={activeChatSessionId}
									isCollapsed={isCollapsed}
								/>
							</Suspense>
						) : (
							<Suspense fallback={null}>
								<DashboardWorkSidebar isCollapsed={isCollapsed} />
							</Suspense>
						)}
						<div
							className={cn(
								"border-t border-border",
								isCollapsed
									? "flex flex-col items-center gap-1 py-1"
									: "flex items-center gap-1 px-2 py-1",
							)}
						>
							{isCollapsed ? (
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<button
											type="button"
											aria-label="Settings"
											onClick={() => navigate({ to: "/settings/account" })}
											className={cn(
												"flex size-8 items-center justify-center rounded-md transition-colors",
												isSettingsOpen
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
											)}
										>
											<Settings className="size-4" />
										</button>
									</TooltipTrigger>
									<TooltipContent side="right">Settings</TooltipContent>
								</Tooltip>
							) : (
								<button
									type="button"
									onClick={() => navigate({ to: "/settings/account" })}
									className={cn(
										"group flex flex-1 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
										isSettingsOpen
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
									)}
								>
									<Settings className="size-4 shrink-0" />
									<span className="flex-1 text-left">Settings</span>
									{settingsHotkey !== "Unassigned" && (
										<span
											className={cn(
												"shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground/60",
												"opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
											)}
										>
											{settingsHotkey}
										</span>
									)}
								</button>
							)}

							<DashboardSidebarHelpMenu isCollapsed={isCollapsed} />
						</div>
					</div>
				</DashboardSidebarHoverCardOverlay>
			</DashboardSidebarHoverProvider>
		</DashboardSidebarSectionRenameProvider>
	);
}
