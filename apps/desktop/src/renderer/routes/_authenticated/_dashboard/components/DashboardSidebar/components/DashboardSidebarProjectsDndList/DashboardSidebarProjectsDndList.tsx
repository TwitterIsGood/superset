import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import type { DashboardSidebarProject } from "../../types";
import { DashboardSidebarProjectSection } from "../DashboardSidebarProjectSection";

interface DashboardSidebarProjectsDndListProps {
	groups: DashboardSidebarProject[];
	isCollapsed: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
}

interface SortableProjectWrapperProps
	extends DashboardSidebarProjectsDndListProps {
	project: DashboardSidebarProject;
	isDraggingProject: boolean;
}

const SortableProjectWrapper = memo(function SortableProjectWrapper({
	project,
	isCollapsed,
	isDraggingProject,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
}: SortableProjectWrapperProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: project.id });

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			<DashboardSidebarProjectSection
				project={project}
				isSidebarCollapsed={isCollapsed}
				isDraggingProject={isDraggingProject}
				enableDnd
				workspaceShortcutLabels={workspaceShortcutLabels}
				onWorkspaceHover={onWorkspaceHover}
				onToggleCollapse={onToggleCollapse}
				dragHandleListeners={listeners}
				dragHandleAttributes={attributes}
			/>
		</div>
	);
});

export function DashboardSidebarProjectsDndList({
	groups,
	isCollapsed,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
}: DashboardSidebarProjectsDndListProps) {
	const { reorderProjects } = useDashboardSidebarState();
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const [activeProject, setActiveProject] =
		useState<DashboardSidebarProject | null>(null);
	const [projectOrder, setProjectOrder] = useState(() =>
		groups.map((project) => project.id),
	);

	useEffect(() => {
		setProjectOrder(groups.map((project) => project.id));
	}, [groups]);

	const orderedGroups = useMemo(() => {
		const byId = new Map(groups.map((project) => [project.id, project]));
		return projectOrder
			.map((id) => byId.get(id))
			.filter((project): project is DashboardSidebarProject => project != null);
	}, [groups, projectOrder]);

	const handleDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			if (over && active.id !== over.id) {
				const oldIndex = projectOrder.indexOf(String(active.id));
				const newIndex = projectOrder.indexOf(String(over.id));
				if (oldIndex !== -1 && newIndex !== -1) {
					const reordered = arrayMove(projectOrder, oldIndex, newIndex);
					setProjectOrder(reordered);
					reorderProjects(reordered);
				}
			}
			setActiveProject(null);
		},
		[projectOrder, reorderProjects],
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			measuring={{
				droppable: { strategy: MeasuringStrategy.Always },
			}}
			onDragStart={({ active }) => {
				const project = groups.find((item) => item.id === active.id);
				setActiveProject(project ?? null);
			}}
			onDragEnd={handleDragEnd}
			onDragCancel={() => setActiveProject(null)}
		>
			<SortableContext
				items={projectOrder}
				strategy={verticalListSortingStrategy}
			>
				{orderedGroups.map((project) => (
					<SortableProjectWrapper
						key={project.id}
						groups={groups}
						project={project}
						isCollapsed={isCollapsed}
						isDraggingProject={activeProject != null}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onWorkspaceHover={onWorkspaceHover}
						onToggleCollapse={onToggleCollapse}
					/>
				))}
			</SortableContext>

			{createPortal(
				<DragOverlay dropAnimation={null}>
					{activeProject && (
						<div className="bg-background shadow-lg border-b border-border">
							<DashboardSidebarProjectSection
								project={activeProject}
								isSidebarCollapsed={isCollapsed}
								isDraggingProject
								enableDnd
								workspaceShortcutLabels={workspaceShortcutLabels}
								onWorkspaceHover={() => {}}
								onToggleCollapse={() => {}}
							/>
						</div>
					)}
				</DragOverlay>,
				document.body,
			)}
		</DndContext>
	);
}
