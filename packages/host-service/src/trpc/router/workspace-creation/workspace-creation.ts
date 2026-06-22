import { router } from "../../index";
import {
	adopt,
	ensureLocal,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";
import { getTrellisStatus } from "./trellis";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	ensureLocal,
	getTrellisStatus,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
});
