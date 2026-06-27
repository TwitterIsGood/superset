import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "renderer/lib/toast";

interface ChangesSidebarTabActionsProps {
	workspaceId: string;
}

export function ChangesSidebarTabActions({
	workspaceId,
}: ChangesSidebarTabActionsProps) {
	const utils = workspaceTrpc.useUtils();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const handleRefresh = useCallback(async () => {
		if (isRefreshing) return;
		setIsRefreshing(true);
		try {
			await Promise.all([
				utils.git.getStatus.invalidate({ workspaceId }),
				utils.git.getDiff.invalidate({ workspaceId }),
				utils.git.listCommits.invalidate({ workspaceId }),
				utils.git.listBranches.invalidate({ workspaceId }),
				utils.git.getBaseBranch.invalidate({ workspaceId }),
			]);
		} catch (error) {
			console.warn("Failed to refresh changes tab", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to refresh changes",
			);
		} finally {
			setIsRefreshing(false);
		}
	}, [utils, workspaceId, isRefreshing]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={() => void handleRefresh()}
					disabled={isRefreshing}
				>
					<RefreshCw
						className={cn("size-3.5", isRefreshing && "animate-spin")}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">Refresh changes</TooltipContent>
		</Tooltip>
	);
}
