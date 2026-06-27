import { electronTrpc } from "renderer/lib/electron-trpc";
import { toast } from "renderer/lib/toast";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useMoveWorkspaceToSection() {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.moveWorkspaceToSection.useMutation({
		onSuccess: () => invalidateWorkspaceQueries(utils),
		onError: (error) =>
			toast.error(`Failed to move workspace: ${error.message}`),
	});
}
