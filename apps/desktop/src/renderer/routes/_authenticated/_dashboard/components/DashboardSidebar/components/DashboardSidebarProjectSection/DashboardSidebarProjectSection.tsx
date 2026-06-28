import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useMemo } from "react";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";
import { DashboardSidebarCollapsedProjectContent } from "./components/DashboardSidebarCollapsedProjectContent";
import { DashboardSidebarProjectContextMenu } from "./components/DashboardSidebarProjectContextMenu";
import { DashboardSidebarProjectRow } from "./components/DashboardSidebarProjectRow";
import { DashboardSidebarStaticExpandedProjectContent } from "./components/DashboardSidebarStaticExpandedProjectContent";
import { useDashboardSidebarProjectSectionActions } from "./hooks/useDashboardSidebarProjectSectionActions";

const DashboardSidebarExpandedProjectContent = lazy(() =>
	import("./components/DashboardSidebarExpandedProjectContent").then(
		(module) => ({
			default: module.DashboardSidebarExpandedProjectContent,
		}),
	),
);

interface DashboardSidebarProjectSectionProps {
	project: DashboardSidebarProject;
	isSidebarCollapsed?: boolean;
	isDraggingProject?: boolean;
	enableDnd?: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
	dragHandleListeners?: DraggableSyntheticListeners;
	dragHandleAttributes?: DraggableAttributes;
}

export function DashboardSidebarProjectSection({
	project,
	isSidebarCollapsed = false,
	isDraggingProject = false,
	enableDnd = true,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
	dragHandleListeners,
	dragHandleAttributes,
}: DashboardSidebarProjectSectionProps) {
	const flattenedCollapsedWorkspaces = useMemo(
		() => getProjectChildrenWorkspaces(project.children),
		[project.children],
	);

	const {
		cancelRename,
		confirmRemoveFromSidebar,
		deleteSection,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		isRenaming,
		renameSection,
		renameValue,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	} = useDashboardSidebarProjectSectionActions({
		project,
	});

	const totalWorkspaceCount = flattenedCollapsedWorkspaces.length;

	if (isSidebarCollapsed) {
		return (
			<DashboardSidebarProjectContextMenu
				onCreateSection={handleNewSection}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onRemoveFromSidebar={confirmRemoveFromSidebar}
				onRename={startRename}
			>
				<div
					data-dashboard-sidebar-project-section={project.id}
					className={cn("border-b border-border last:border-b-0")}
				>
					<DashboardSidebarCollapsedProjectContent
						projectName={project.name}
						iconUrl={project.iconUrl}
						isCollapsed={project.isCollapsed}
						totalWorkspaceCount={totalWorkspaceCount}
						workspaces={flattenedCollapsedWorkspaces}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onWorkspaceHover={onWorkspaceHover}
						onToggleCollapse={() => onToggleCollapse(project.id)}
					/>
				</div>
			</DashboardSidebarProjectContextMenu>
		);
	}

	return (
		<div
			data-dashboard-sidebar-project-section={project.id}
			className={cn("border-b border-border last:border-b-0")}
		>
			<DashboardSidebarProjectContextMenu
				onCreateSection={handleNewSection}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onRemoveFromSidebar={confirmRemoveFromSidebar}
				onRename={startRename}
			>
				<DashboardSidebarProjectRow
					projectName={project.name}
					iconUrl={project.iconUrl}
					totalWorkspaceCount={totalWorkspaceCount}
					isCollapsed={project.isCollapsed}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
					onStartRename={startRename}
					onToggleCollapse={() => onToggleCollapse(project.id)}
					onNewWorkspace={handleNewWorkspace}
					data-dashboard-sidebar-project-row={project.id}
					{...(dragHandleAttributes ?? {})}
					{...(dragHandleListeners ?? {})}
				/>
			</DashboardSidebarProjectContextMenu>

			<AnimatePresence initial={false}>
				{!isDraggingProject && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						{enableDnd ? (
							<Suspense
								fallback={
									<DashboardSidebarStaticExpandedProjectContent
										projectId={project.id}
										isCollapsed={project.isCollapsed}
										projectChildren={project.children}
										workspaceShortcutLabels={workspaceShortcutLabels}
										onWorkspaceHover={onWorkspaceHover}
										onDeleteSection={deleteSection}
										onRenameSection={renameSection}
										onToggleSectionCollapse={toggleSectionCollapsed}
									/>
								}
							>
								<DashboardSidebarExpandedProjectContent
									projectId={project.id}
									isCollapsed={project.isCollapsed}
									projectChildren={project.children}
									workspaceShortcutLabels={workspaceShortcutLabels}
									onWorkspaceHover={onWorkspaceHover}
									onDeleteSection={deleteSection}
									onRenameSection={renameSection}
									onToggleSectionCollapse={toggleSectionCollapsed}
								/>
							</Suspense>
						) : (
							<DashboardSidebarStaticExpandedProjectContent
								projectId={project.id}
								isCollapsed={project.isCollapsed}
								projectChildren={project.children}
								workspaceShortcutLabels={workspaceShortcutLabels}
								onWorkspaceHover={onWorkspaceHover}
								onDeleteSection={deleteSection}
								onRenameSection={renameSection}
								onToggleSectionCollapse={toggleSectionCollapsed}
							/>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
