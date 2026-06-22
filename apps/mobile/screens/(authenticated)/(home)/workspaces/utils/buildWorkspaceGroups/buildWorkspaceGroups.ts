import type {
	SelectV2Host,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
} from "@superset/db/schema";

type ProjectInput = Pick<
	SelectV2Project,
	"id" | "name" | "slug" | "repoCloneUrl" | "iconUrl"
>;
type WorkspaceInput = Omit<
	Pick<
		SelectV2Workspace,
		| "id"
		| "name"
		| "branch"
		| "projectId"
		| "hostId"
		| "type"
		| "taskId"
		| "createdAt"
	>,
	"createdAt"
> & {
	createdAt: Date | string | number;
};
type HostInput = Pick<
	SelectV2Host,
	"organizationId" | "machineId" | "name" | "isOnline" | "updatedAt"
>;
type HostAccessInput = Pick<
	SelectV2UsersHosts,
	"organizationId" | "userId" | "hostId"
>;

export interface WorkspaceListItem {
	id: string;
	name: string;
	displayName: string;
	branch: string;
	type: SelectV2Workspace["type"];
	projectId: string;
	hostId: string;
	hostName: string | null;
	isHostOnline: boolean | null;
	hostUpdatedAt: Date | null;
	hostReachability: "online" | "stale" | "offline" | "no-access" | "unknown";
	canControlHost: boolean | null;
	taskId: string | null;
	createdAt: Date;
}

export interface WorkspaceProjectGroup {
	id: string;
	name: string;
	slug: string;
	repoCloneUrl: string | null;
	iconUrl: string | null;
	workspaces: WorkspaceListItem[];
}

interface BuildWorkspaceGroupsInput {
	projects: ProjectInput[];
	workspaces: WorkspaceInput[];
	hosts: HostInput[];
	hostAccesses?: HostAccessInput[] | null;
	currentUserId?: string | null;
}

const UNKNOWN_PROJECT_ID = "__unknown-project__";
const HOST_ONLINE_STALE_MS = 24 * 60 * 60 * 1000;

function compareText(left: string, right: string): number {
	return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function compareWorkspaces(
	left: WorkspaceListItem,
	right: WorkspaceListItem,
): number {
	if (left.type !== right.type) {
		return left.type === "main" ? -1 : 1;
	}
	const reachabilityDiff =
		hostReachabilityRank(left.hostReachability) -
		hostReachabilityRank(right.hostReachability);
	if (reachabilityDiff !== 0) return reachabilityDiff;
	const createdAtDiff = right.createdAt.getTime() - left.createdAt.getTime();
	if (createdAtDiff !== 0) return createdAtDiff;
	return compareText(left.name, right.name);
}

function toDate(value: Date | string | number): Date {
	return value instanceof Date ? value : new Date(value);
}

function toValidDate(
	value: Date | string | number | null | undefined,
): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isStaleOnlineHost(updatedAt: Date | null): boolean {
	if (!updatedAt) return false;
	return Date.now() - updatedAt.getTime() > HOST_ONLINE_STALE_MS;
}

function hostReachabilityRank(
	reachability: WorkspaceListItem["hostReachability"],
): number {
	switch (reachability) {
		case "online":
			return 0;
		case "stale":
			return 1;
		case "offline":
			return 2;
		case "unknown":
			return 3;
		case "no-access":
			return 4;
		default:
			return 5;
	}
}

function hostReachabilityFor({
	host,
	canControlHost,
}: {
	host: HostInput | undefined;
	canControlHost: boolean | null;
}): WorkspaceListItem["hostReachability"] {
	if (canControlHost === false) return "no-access";
	if (!host) return "unknown";
	if (host.isOnline === false) return "offline";
	if (isStaleOnlineHost(toValidDate(host.updatedAt))) return "stale";
	return "online";
}

export function buildWorkspaceGroups({
	projects,
	workspaces,
	hosts,
	hostAccesses,
	currentUserId,
}: BuildWorkspaceGroupsInput): WorkspaceProjectGroup[] {
	const hostById = new Map(hosts.map((host) => [host.machineId, host]));
	const hostAccessByKey =
		hostAccesses && currentUserId
			? new Set(
					hostAccesses
						.filter((access) => access.userId === currentUserId)
						.map((access) => `${access.organizationId}:${access.hostId}`),
				)
			: null;
	const groupsByProjectId = new Map<string, WorkspaceProjectGroup>();

	for (const project of projects) {
		groupsByProjectId.set(project.id, {
			id: project.id,
			name: project.name,
			slug: project.slug,
			repoCloneUrl: project.repoCloneUrl,
			iconUrl: project.iconUrl,
			workspaces: [],
		});
	}

	for (const workspace of workspaces) {
		let group = groupsByProjectId.get(workspace.projectId);
		if (!group) {
			group = groupsByProjectId.get(UNKNOWN_PROJECT_ID);
			if (!group) {
				group = {
					id: UNKNOWN_PROJECT_ID,
					name: "Unknown project",
					slug: "unknown-project",
					repoCloneUrl: null,
					iconUrl: null,
					workspaces: [],
				};
				groupsByProjectId.set(UNKNOWN_PROJECT_ID, group);
			}
		}

		const host = hostById.get(workspace.hostId);
		const canControlHost =
			hostAccessByKey && host
				? hostAccessByKey.has(`${host.organizationId}:${workspace.hostId}`)
				: null;
		const hostUpdatedAt = toValidDate(host?.updatedAt);
		group.workspaces.push({
			id: workspace.id,
			name: workspace.name,
			displayName: workspace.name,
			branch: workspace.branch,
			type: workspace.type,
			projectId: workspace.projectId,
			hostId: workspace.hostId,
			hostName: host?.name ?? null,
			isHostOnline: host?.isOnline ?? null,
			hostUpdatedAt,
			hostReachability: hostReachabilityFor({ host, canControlHost }),
			canControlHost,
			taskId: workspace.taskId,
			createdAt: toDate(workspace.createdAt),
		});
	}

	return Array.from(groupsByProjectId.values())
		.map((group) => ({
			...group,
			workspaces: withDuplicateDisplayNames(group.workspaces).sort(
				compareWorkspaces,
			),
		}))
		.sort((left, right) => {
			if (left.id === UNKNOWN_PROJECT_ID) return 1;
			if (right.id === UNKNOWN_PROJECT_ID) return -1;
			return compareText(left.name, right.name);
		});
}

function withDuplicateDisplayNames(
	workspaces: WorkspaceListItem[],
): WorkspaceListItem[] {
	const countsByNameBranch = new Map<string, number>();
	for (const workspace of workspaces) {
		const key = `${workspace.name.trim().toLowerCase()}:${workspace.branch
			.trim()
			.toLowerCase()}`;
		countsByNameBranch.set(key, (countsByNameBranch.get(key) ?? 0) + 1);
	}

	return workspaces.map((workspace) => {
		const key = `${workspace.name.trim().toLowerCase()}:${workspace.branch
			.trim()
			.toLowerCase()}`;
		const isDuplicate = (countsByNameBranch.get(key) ?? 0) > 1;
		return {
			...workspace,
			displayName:
				isDuplicate && workspace.hostName
					? `${workspace.name} - ${workspace.hostName}`
					: workspace.name,
		};
	});
}
