import type { CommentPaneData, DiffFocusSide } from "../../../../types";
import { useReviewTab } from "../../hooks/useReviewTab";

interface ReviewSidebarTabProps {
	workspaceId: string;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

export function ReviewSidebarTab({
	workspaceId,
	onOpenComment,
	onOpenInDiff,
}: ReviewSidebarTabProps) {
	const tab = useReviewTab({
		workspaceId,
		onOpenComment,
		onOpenInDiff,
	});

	return <>{tab.content}</>;
}
