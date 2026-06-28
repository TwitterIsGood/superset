import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import {
	DEVICE_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type {
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../../../types";
import {
	DashboardSidebarSectionActionsDropdown,
	DashboardSidebarSectionContextMenu,
} from "../../../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu";
import { DashboardSidebarSectionHeader } from "../../../DashboardSidebarSection/components/DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

const STATIC_WORKSPACE_LIMIT = 8;

interface DashboardSidebarStaticExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	projectChildren: DashboardSidebarProjectChild[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

interface StaticSectionHeaderProps {
	section: DashboardSidebarSection;
	onDelete: (sectionId: string) => void;
	onRename: (sectionId: string, name: string) => void;
	onToggleCollapse: (sectionId: string) => void;
}

function StaticSectionHeader({
	section,
	onDelete,
	onRename,
	onToggleCollapse,
}: StaticSectionHeaderProps) {
	const { setSectionColor } = useDashboardSidebarState();
	const { clearPendingSectionRename, pendingRenameSectionId } =
		useDashboardSidebarSectionRename();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);
	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed) onRename(section.id, trimmed);
		setIsRenaming(false);
	};
	const startRename = useCallback(() => {
		setRenameValue(section.name);
		setIsRenaming(true);
	}, [section.name]);

	useEffect(() => {
		if (pendingRenameSectionId !== section.id) return;
		startRename();
		clearPendingSectionRename(section.id);
	}, [
		clearPendingSectionRename,
		pendingRenameSectionId,
		section.id,
		startRename,
	]);

	return (
		<div
			style={{
				borderLeft: hasColor
					? `2px solid ${section.color}`
					: "2px solid var(--color-border)",
			}}
		>
			<DashboardSidebarSectionContextMenu
				color={section.color}
				onRename={startRename}
				onSetColor={(color) => setSectionColor(section.id, color)}
				onDelete={() => onDelete(section.id)}
			>
				<DashboardSidebarSectionHeader
					section={section}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={handleSubmitRename}
					onCancelRename={() => {
						setRenameValue(section.name);
						setIsRenaming(false);
					}}
					onToggleCollapse={() => onToggleCollapse(section.id)}
					actions={
						<DashboardSidebarSectionActionsDropdown
							color={section.color}
							onRename={startRename}
							onSetColor={(color) => setSectionColor(section.id, color)}
							onDelete={() => onDelete(section.id)}
						/>
					}
				/>
			</DashboardSidebarSectionContextMenu>
		</div>
	);
}

interface VisibleStaticContent {
	items: Array<
		| { type: "workspace"; workspace: DashboardSidebarWorkspace }
		| { type: "section"; section: DashboardSidebarSection }
	>;
	totalWorkspaceCount: number;
	hiddenWorkspaceCount: number;
}

function buildVisibleStaticContent({
	projectChildren,
	activeWorkspaceId,
}: {
	projectChildren: DashboardSidebarProjectChild[];
	activeWorkspaceId: string | null;
}): VisibleStaticContent {
	const eligibleWorkspaces: DashboardSidebarWorkspace[] = [];
	for (const child of projectChildren) {
		if (child.type === "workspace") {
			eligibleWorkspaces.push(child.workspace);
			continue;
		}
		if (child.section.isCollapsed) continue;
		eligibleWorkspaces.push(...child.section.workspaces);
	}

	const includedWorkspaceIds = new Set(
		eligibleWorkspaces
			.slice(0, STATIC_WORKSPACE_LIMIT)
			.map((workspace) => workspace.id),
	);
	for (const workspace of eligibleWorkspaces) {
		if (
			workspace.id === activeWorkspaceId ||
			workspace.pendingTransaction?.type === "insert"
		) {
			includedWorkspaceIds.add(workspace.id);
		}
	}

	const items: VisibleStaticContent["items"] = [];
	for (const child of projectChildren) {
		if (child.type === "section") {
			items.push({ type: "section", section: child.section });
			if (child.section.isCollapsed) continue;
			for (const workspace of child.section.workspaces) {
				if (includedWorkspaceIds.has(workspace.id)) {
					items.push({ type: "workspace", workspace });
				}
			}
			continue;
		}

		if (includedWorkspaceIds.has(child.workspace.id)) {
			items.push({ type: "workspace", workspace: child.workspace });
		}
	}

	return {
		items,
		totalWorkspaceCount: eligibleWorkspaces.length,
		hiddenWorkspaceCount: Math.max(
			0,
			eligibleWorkspaces.length - includedWorkspaceIds.size,
		),
	};
}

export function DashboardSidebarStaticExpandedProjectContent({
	projectId,
	isCollapsed,
	projectChildren,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarStaticExpandedProjectContentProps) {
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
	const visibleContent = useMemo(
		() => buildVisibleStaticContent({ projectChildren, activeWorkspaceId }),
		[activeWorkspaceId, projectChildren],
	);
	const handleViewProjectWorkspaces = () => {
		setDeviceFilter(DEVICE_FILTER_ALL);
		setProjectFilter(projectId);
		void navigate({ to: "/v2-workspaces" });
	};

	if (isCollapsed) {
		return null;
	}

	return (
		<div className="pb-1" data-dashboard-sidebar-project-content={projectId}>
			{visibleContent.items.map((item) => {
				if (item.type === "section") {
					return (
						<StaticSectionHeader
							key={`section-${item.section.id}`}
							section={item.section}
							onDelete={onDeleteSection}
							onRename={onRenameSection}
							onToggleCollapse={onToggleSectionCollapse}
						/>
					);
				}

				return (
					<DashboardSidebarWorkspaceItem
						key={`workspace-${item.workspace.id}`}
						workspace={item.workspace}
						onHoverCardOpen={() => onWorkspaceHover(item.workspace.id)}
						shortcutLabel={workspaceShortcutLabels.get(item.workspace.id)}
						isInSection={projectChildren.some(
							(child) =>
								child.type === "section" &&
								child.section.workspaces.some(
									(workspace) => workspace.id === item.workspace.id,
								),
						)}
					/>
				);
			})}

			{visibleContent.hiddenWorkspaceCount > 0 ? (
				<button
					type="button"
					data-dashboard-sidebar-overflow-link={projectId}
					aria-label={`View all ${visibleContent.totalWorkspaceCount} workspaces in this project`}
					onClick={handleViewProjectWorkspaces}
					className="mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<span className="min-w-0 truncate">
						View {visibleContent.hiddenWorkspaceCount} more
					</span>
					<span className="ml-2 shrink-0 tabular-nums">
						{visibleContent.totalWorkspaceCount}
					</span>
				</button>
			) : null}
		</div>
	);
}
