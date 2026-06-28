import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import {
	DEVICE_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { isSec, parseId, useSidebarDnd } from "../../../../hooks/useSidebarDnd";
import type { DashboardSidebarProjectChild } from "../../../../types";
import { SidebarDragOverlay } from "../../../SidebarDragOverlay";
import { SortableSectionHeader } from "../../../SortableSectionHeader";
import { SortableWorkspaceItem } from "../../../SortableWorkspaceItem";
import { buildDashboardSidebarVisibleItems } from "./utils/buildDashboardSidebarVisibleItems";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	projectChildren: DashboardSidebarProjectChild[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	projectChildren,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const activeWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;
	const setDeviceFilter = useV2WorkspacesFilterStore(
		(state) => state.setDeviceFilter,
	);
	const setProjectFilter = useV2WorkspacesFilterStore(
		(state) => state.setProjectFilter,
	);
	const {
		sensors,
		measuring,
		collisionDetection,
		flatItems,
		sortableItems,
		activeId,
		activeType,
		activeItem,
		predictedColor,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
		handlers,
	} = useSidebarDnd({ projectId, projectChildren });
	const hiddenWorkspaceIds = useMemo(() => {
		const hidden = new Set<string>();
		for (const [workspaceId, group] of groupInfo) {
			if (
				collapsedSectionIds.has(group.sectionId) ||
				activeType === "section"
			) {
				hidden.add(workspaceId);
			}
		}
		return hidden;
	}, [activeType, collapsedSectionIds, groupInfo]);
	const visibleItems = useMemo(
		() =>
			buildDashboardSidebarVisibleItems({
				flatItems,
				workspacesById,
				activeWorkspaceId,
				hiddenWorkspaceIds,
				disabled: activeId !== null,
			}),
		[
			activeId,
			activeWorkspaceId,
			flatItems,
			hiddenWorkspaceIds,
			workspacesById,
		],
	);
	const renderedSortableItems = useMemo(() => {
		if (activeId !== null) return sortableItems;
		if (activeType === "section") return visibleItems.items.filter(isSec);
		return visibleItems.items;
	}, [activeId, activeType, sortableItems, visibleItems.items]);
	const handleViewProjectWorkspaces = () => {
		setDeviceFilter(DEVICE_FILTER_ALL);
		setProjectFilter(projectId);
		void navigate({ to: "/v2-workspaces" });
	};

	return (
		<AnimatePresence initial={false}>
			{!isCollapsed && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<div
						className="pb-1"
						data-dashboard-sidebar-project-content={projectId}
					>
						<DndContext
							sensors={sensors}
							collisionDetection={collisionDetection}
							measuring={measuring}
							{...handlers}
						>
							<SortableContext
								items={renderedSortableItems}
								strategy={verticalListSortingStrategy}
							>
								{visibleItems.items.map((id) => {
									const parsed = parseId(id);
									if (!parsed) return null;

									if (parsed.type === "section") {
										const section = sectionsById.get(parsed.realId);
										if (!section) return null;
										return (
											<SortableSectionHeader
												key={String(id)}
												sortableId={String(id)}
												section={section}
												onDelete={onDeleteSection}
												onRename={onRenameSection}
												onToggleCollapse={onToggleSectionCollapse}
											/>
										);
									}

									const workspace = workspacesById.get(parsed.realId);
									if (!workspace) return null;
									const group = groupInfo.get(parsed.realId);
									const isInSection = !!group;
									const isInCollapsedSection =
										isInSection && collapsedSectionIds.has(group.sectionId);
									const hidden =
										isInCollapsedSection ||
										(activeType === "section" && isInSection);

									return (
										<AnimatePresence key={String(id)} initial={false}>
											{!hidden && (
												<motion.div
													initial={{ height: 0, opacity: 0 }}
													animate={{ height: "auto", opacity: 1 }}
													exit={{ height: 0, opacity: 0 }}
													transition={{ duration: 0.15, ease: "easeOut" }}
												>
													<SortableWorkspaceItem
														sortableId={String(id)}
														workspace={workspace}
														accentColor={
															activeId === id ? predictedColor : group?.color
														}
														isInSection={groupInfo.has(parsed.realId)}
														onHoverCardOpen={() =>
															onWorkspaceHover(parsed.realId)
														}
														shortcutLabel={workspaceShortcutLabels.get(
															parsed.realId,
														)}
														disabled={
															workspace.type === "main" &&
															workspace.hostType === "local-device"
														}
													/>
												</motion.div>
											)}
										</AnimatePresence>
									);
								})}
							</SortableContext>

							{visibleItems.hiddenWorkspaceCount > 0 ? (
								<button
									type="button"
									data-dashboard-sidebar-overflow-link={projectId}
									aria-label={`View all ${visibleItems.totalWorkspaceCount} workspaces in this project`}
									onClick={handleViewProjectWorkspaces}
									className="mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									<span className="min-w-0 truncate">
										View {visibleItems.hiddenWorkspaceCount} more
									</span>
									<span className="ml-2 shrink-0 tabular-nums">
										{visibleItems.totalWorkspaceCount}
									</span>
								</button>
							) : null}

							{createPortal(
								<DragOverlay dropAnimation={null}>
									{activeId ? (
										<SidebarDragOverlay activeItem={activeItem} />
									) : null}
								</DragOverlay>,
								document.body,
							)}
						</DndContext>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
