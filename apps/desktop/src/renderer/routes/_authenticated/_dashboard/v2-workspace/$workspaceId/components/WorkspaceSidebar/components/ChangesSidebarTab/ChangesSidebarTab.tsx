import { memo } from "react";
import { useChangesTab } from "../../hooks/useChangesTab";

interface ChangesSidebarTabProps {
	workspaceId: string;
	/** Absolute path of the file whose diff/preview is currently open. */
	selectedFilePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
}

export const ChangesSidebarTab = memo(function ChangesSidebarTab({
	workspaceId,
	selectedFilePath,
	onSelectFile,
	onOpenFile,
}: ChangesSidebarTabProps) {
	const tab = useChangesTab({
		workspaceId,
		selectedFilePath,
		onSelectFile,
		onOpenFile,
	});

	return <>{tab.content}</>;
});
