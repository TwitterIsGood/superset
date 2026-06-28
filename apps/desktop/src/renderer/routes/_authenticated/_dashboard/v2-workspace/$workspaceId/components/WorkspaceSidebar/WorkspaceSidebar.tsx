import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	BotIcon,
	File,
	GitCompareArrows,
	MessageSquare,
	Search,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useWorkspaceGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useSettings } from "renderer/stores/settings";
import type { CommentPaneData, DiffFocusSide } from "../../types";
import { ChangesSidebarTabActions } from "./components/ChangesSidebarTabActions";
import { PRActionHeader } from "./components/PRActionHeader";
import { SidebarHeader } from "./components/SidebarHeader";
import { type OpenChatFn, usePRFlowDispatch } from "./hooks/usePRFlowDispatch";
import { usePRFlowState } from "./hooks/usePRFlowState";
import type { SidebarTabDefinition } from "./types";
import {
	isSidebarTabId,
	resolveWorkspaceSidebarActiveTab,
	type SidebarTabId,
} from "./workspaceSidebarTabs";

// Gates the "Create PR" button only — the chat-driven create flow doesn't
// exist in v2 yet. The PR status group (link + merge dropdown for an open PR)
// always renders so users can see PR state and merge once a PR exists.
const CREATE_PR_BUTTON_ENABLED = false;

const LazyChangesSidebarTab = lazy(async () => ({
	default: (await import("./components/ChangesSidebarTab")).ChangesSidebarTab,
}));
const LazyFilesTab = lazy(async () => ({
	default: (await import("./components/FilesTab")).FilesTab,
}));
const LazyModelsTab = lazy(async () => ({
	default: (await import("./components/ModelsTab")).ModelsTab,
}));
const LazyReviewSidebarTab = lazy(async () => ({
	default: (await import("./components/ReviewSidebarTab")).ReviewSidebarTab,
}));

export interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (
		path: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
	) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenChat?: OpenChatFn;
	onSearch?: () => void;
	selectedFilePath?: string;
	pendingReveal?: PendingReveal | null;
	workspaceId: string;
}

function IconButton({
	icon: Icon,
	tooltip,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	tooltip: string;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClick}
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function SidebarTabFallback() {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
			<div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-4 w-full animate-pulse rounded bg-muted/70" />
			<div className="h-4 w-5/6 animate-pulse rounded bg-muted/70" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted/70" />
		</div>
	);
}

export function WorkspaceSidebar({
	onSelectFile,
	onSelectDiffFile,
	onOpenComment,
	onOpenChat,
	onSearch,
	selectedFilePath,
	pendingReveal,
	workspaceId,
}: WorkspaceSidebarProps) {
	const gitStatus = useWorkspaceGitStatus();
	const collections = useCollections();
	const { data: [localState] = [] } = useLiveQuery(
		(query) =>
			query
				.from({ localState: collections.v2WorkspaceLocalState })
				.where(({ localState }) => eq(localState.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const activeTab: SidebarTabId = resolveWorkspaceSidebarActiveTab(
		localState?.sidebarState.activeTab,
	);

	function setActiveTab(tab: string) {
		if (!isSidebarTabId(tab)) return;
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.activeTab = tab;
		});
	}

	const containerRef = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const width = entry.contentRect.width;
			// Hysteresis: expand back to labels only once we're clearly past
			// the breakpoint, so the labels don't jitter on the edge.
			setCompact((prev) => (prev ? width < 280 : width < 260));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const gitChangeCount = gitStatus.data ? getGitChangeCount(gitStatus.data) : 0;
	const changesTab: SidebarTabDefinition = {
		id: "changes",
		label: "Changes",
		icon: GitCompareArrows,
		badge: gitChangeCount > 0 ? gitChangeCount : undefined,
		actions: <ChangesSidebarTabActions workspaceId={workspaceId} />,
		content: (
			<LazyChangesSidebarTab
				workspaceId={workspaceId}
				selectedFilePath={selectedFilePath}
				onSelectFile={onSelectDiffFile}
				onOpenFile={onSelectFile}
			/>
		),
	};

	const { flowState, onRetry } = usePRFlowState(workspaceId, {
		enabled: activeTab === "review",
	});
	const dispatch = usePRFlowDispatch({
		onOpenChat: onOpenChat ?? (() => {}),
	});

	const filesTab: SidebarTabDefinition = {
		id: "files",
		label: "Files",
		icon: File,
		actions: <IconButton icon={Search} tooltip="Search" onClick={onSearch} />,
		content: (
			<LazyFilesTab
				onSelectFile={onSelectFile}
				selectedFilePath={selectedFilePath}
				pendingReveal={pendingReveal}
				workspaceId={workspaceId}
				gitStatus={gitStatus.data}
			/>
		),
	};

	const modelsTab: SidebarTabDefinition = {
		id: "models",
		label: "Models",
		icon: BotIcon,
		content: <LazyModelsTab workspaceId={workspaceId} />,
	};

	const reviewTab: SidebarTabDefinition = {
		id: "review",
		label: "Review",
		icon: MessageSquare,
		content: (
			<LazyReviewSidebarTab
				workspaceId={workspaceId}
				onOpenComment={onOpenComment}
				onOpenInDiff={
					onSelectDiffFile
						? (path, line, openInNewTab, side) => {
								// Force annotations on so the user lands on the comment, not an empty line.
								useSettings.getState().update("showDiffComments", true);
								onSelectDiffFile(path, openInNewTab ?? false, line, side);
							}
						: undefined
				}
			/>
		),
	};

	const tabs: SidebarTabDefinition[] = [
		filesTab,
		changesTab,
		reviewTab,
		modelsTab,
	];
	const activeTabDef = tabs.find((t) => t.id === activeTab);

	return (
		<div
			ref={containerRef}
			className="isolate flex h-full w-full min-h-0 flex-col overflow-hidden bg-background"
		>
			<PRActionHeader
				workspaceId={workspaceId}
				state={flowState}
				dispatch={dispatch}
				onRetry={onRetry}
				createPREnabled={CREATE_PR_BUTTON_ENABLED}
			/>
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				compact={compact}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<Suspense fallback={<SidebarTabFallback />}>
					{activeTabDef?.content}
				</Suspense>
			</div>
		</div>
	);
}

type GitStatusData = NonNullable<
	ReturnType<typeof useWorkspaceGitStatus>["data"]
>;

function getGitChangeCount(status: GitStatusData): number {
	const changedPaths = new Set<string>();
	for (const file of status.unstaged) changedPaths.add(file.path);
	for (const file of status.staged) changedPaths.add(file.path);
	for (const file of status.againstBase) changedPaths.add(file.path);
	return changedPaths.size;
}
