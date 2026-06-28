import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { FolderOpen, FolderPlus, Pencil, Settings, X } from "lucide-react";

interface DashboardSidebarProjectContextMenuProps {
	onCreateSection: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	onCreateSection,
	onOpenInFinder,
	onOpenSettings,
	onRemoveFromSidebar,
	onRename,
	children,
}: DashboardSidebarProjectContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<Pencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onOpenInFinder}>
					<FolderOpen className="size-4 mr-2" />
					Open in Finder
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSettings}>
					<Settings className="size-4 mr-2" />
					Project Settings
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<FolderPlus className="size-4 mr-2" />
					New group
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<X className="size-4 mr-2 text-destructive" />
					Remove from Sidebar
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
