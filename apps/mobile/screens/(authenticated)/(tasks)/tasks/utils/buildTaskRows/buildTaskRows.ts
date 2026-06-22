import type {
	SelectTask,
	SelectTaskStatus,
	SelectV2Host,
	SelectV2Project,
	SelectV2Workspace,
} from "@superset/db/schema";

type TaskInput = Omit<
	Pick<
		SelectTask,
		| "id"
		| "slug"
		| "title"
		| "description"
		| "statusId"
		| "priority"
		| "v2ProjectId"
		| "branch"
		| "externalProvider"
		| "externalKey"
		| "externalUrl"
		| "syncError"
		| "dueDate"
		| "deletedAt"
		| "createdAt"
		| "updatedAt"
	>,
	"createdAt" | "updatedAt" | "dueDate" | "deletedAt"
> & {
	createdAt: Date | string | number;
	updatedAt: Date | string | number;
	dueDate: Date | string | number | null;
	deletedAt: Date | string | number | null;
};
type TaskStatusInput = Pick<
	SelectTaskStatus,
	"id" | "name" | "color" | "type" | "position" | "progressPercent"
>;
type ProjectInput = Pick<SelectV2Project, "id" | "name" | "slug">;
type WorkspaceInput = Pick<
	SelectV2Workspace,
	"id" | "name" | "branch" | "projectId" | "hostId" | "type" | "taskId"
>;
type HostInput = Pick<SelectV2Host, "machineId" | "name" | "isOnline">;

export interface TaskListItem {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	statusId: string;
	statusName: string;
	statusType: string | null;
	statusColor: string | null;
	statusProgressPercent: number | null;
	statusPosition: number | null;
	priority: SelectTask["priority"];
	projectId: string | null;
	projectName: string | null;
	projectSlug: string | null;
	workspaceId: string | null;
	workspaceName: string | null;
	workspaceBranch: string | null;
	workspaceType: SelectV2Workspace["type"] | null;
	hostName: string | null;
	isHostOnline: boolean | null;
	branch: string | null;
	externalProvider: SelectTask["externalProvider"] | null;
	externalKey: string | null;
	externalUrl: string | null;
	syncError: string | null;
	dueDate: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface TaskStatusGroup {
	id: string;
	name: string;
	color: string | null;
	type: string | null;
	progressPercent: number | null;
	position: number | null;
	tasks: TaskListItem[];
}

interface BuildTaskRowsInput {
	tasks: TaskInput[];
	statuses: TaskStatusInput[];
	projects: ProjectInput[];
	workspaces: WorkspaceInput[];
	hosts: HostInput[];
}

const UNKNOWN_STATUS_ID = "__unknown-status__";

const priorityRank: Record<SelectTask["priority"], number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

function toDate(value: Date | string | number): Date {
	return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | number | null): Date | null {
	return value === null ? null : toDate(value);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function compareTasks(left: TaskListItem, right: TaskListItem): number {
	const priorityDiff =
		priorityRank[left.priority] - priorityRank[right.priority];
	if (priorityDiff !== 0) return priorityDiff;

	const dueLeft = left.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
	const dueRight = right.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
	const dueDiff = dueLeft - dueRight;
	if (dueDiff !== 0) return dueDiff;

	const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
	if (updatedDiff !== 0) return updatedDiff;

	return compareText(left.title, right.title);
}

function compareGroups(left: TaskStatusGroup, right: TaskStatusGroup): number {
	if (left.id === UNKNOWN_STATUS_ID) return 1;
	if (right.id === UNKNOWN_STATUS_ID) return -1;

	const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
	const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
	const positionDiff = leftPosition - rightPosition;
	if (positionDiff !== 0) return positionDiff;

	return compareText(left.name, right.name);
}

export function buildTaskRows({
	tasks,
	statuses,
	projects,
	workspaces,
	hosts,
}: BuildTaskRowsInput): TaskStatusGroup[] {
	const statusById = new Map(statuses.map((status) => [status.id, status]));
	const projectById = new Map(projects.map((project) => [project.id, project]));
	const hostById = new Map(hosts.map((host) => [host.machineId, host]));
	const workspaceByTaskId = new Map<string, WorkspaceInput>();

	for (const workspace of workspaces) {
		if (workspace.taskId) {
			workspaceByTaskId.set(workspace.taskId, workspace);
		}
	}

	const groupsByStatusId = new Map<string, TaskStatusGroup>();

	for (const status of statuses) {
		groupsByStatusId.set(status.id, {
			id: status.id,
			name: status.name,
			color: status.color,
			type: status.type,
			progressPercent: status.progressPercent,
			position: status.position,
			tasks: [],
		});
	}

	for (const task of tasks) {
		if (task.deletedAt !== null) continue;

		const status = statusById.get(task.statusId);
		const groupId = status?.id ?? UNKNOWN_STATUS_ID;
		let group = groupsByStatusId.get(groupId);

		if (!group) {
			group = {
				id: UNKNOWN_STATUS_ID,
				name: "Unknown status",
				color: null,
				type: null,
				progressPercent: null,
				position: null,
				tasks: [],
			};
			groupsByStatusId.set(UNKNOWN_STATUS_ID, group);
		}

		const project = task.v2ProjectId
			? projectById.get(task.v2ProjectId)
			: undefined;
		const workspace = workspaceByTaskId.get(task.id);
		const host = workspace ? hostById.get(workspace.hostId) : undefined;

		group.tasks.push({
			id: task.id,
			slug: task.slug,
			title: task.title,
			description: task.description,
			statusId: task.statusId,
			statusName: status?.name ?? "Unknown status",
			statusType: status?.type ?? null,
			statusColor: status?.color ?? null,
			statusProgressPercent: status?.progressPercent ?? null,
			statusPosition: status?.position ?? null,
			priority: task.priority,
			projectId: task.v2ProjectId,
			projectName: project?.name ?? null,
			projectSlug: project?.slug ?? null,
			workspaceId: workspace?.id ?? null,
			workspaceName: workspace?.name ?? null,
			workspaceBranch: workspace?.branch ?? null,
			workspaceType: workspace?.type ?? null,
			hostName: host?.name ?? null,
			isHostOnline: host?.isOnline ?? null,
			branch: task.branch,
			externalProvider: task.externalProvider ?? null,
			externalKey: task.externalKey,
			externalUrl: task.externalUrl,
			syncError: task.syncError,
			dueDate: toNullableDate(task.dueDate),
			createdAt: toDate(task.createdAt),
			updatedAt: toDate(task.updatedAt),
		});
	}

	return Array.from(groupsByStatusId.values())
		.map((group) => ({
			...group,
			tasks: [...group.tasks].sort(compareTasks),
		}))
		.filter((group) => group.tasks.length > 0)
		.sort(compareGroups);
}

export function flattenTaskGroups(groups: TaskStatusGroup[]): TaskListItem[] {
	return groups.flatMap((group) => group.tasks);
}
