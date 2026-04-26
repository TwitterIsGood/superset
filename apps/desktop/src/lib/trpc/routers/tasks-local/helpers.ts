import type {
	SelectTask as CloudTask,
	SelectTaskStatus as CloudTaskStatus,
} from "@superset/db/schema";
import type {
	SelectTask,
	SelectTaskStatus,
	TaskStatusType,
} from "@superset/local-db";

export const DEFAULT_LOCAL_TASK_STATUSES: Array<{
	name: string;
	color: string;
	type: TaskStatusType;
	position: number;
	progressPercent: number | null;
}> = [
	{
		name: "Backlog",
		color: "#95a2b3",
		type: "backlog",
		position: 0,
		progressPercent: null,
	},
	{
		name: "Todo",
		color: "#e2e2e2",
		type: "unstarted",
		position: 1,
		progressPercent: null,
	},
	{
		name: "In Progress",
		color: "#f2c94c",
		type: "started",
		position: 2,
		progressPercent: null,
	},
	{
		name: "Done",
		color: "#0e9f6e",
		type: "completed",
		position: 3,
		progressPercent: 100,
	},
	{
		name: "Canceled",
		color: "#95a2b3",
		type: "canceled",
		position: 4,
		progressPercent: null,
	},
];

export function nextLocalTaskSlug(existingSlugs: string[]): string {
	const highest = existingSlugs.reduce((max, slug) => {
		const match = /^TASK-(\d+)$/.exec(slug);
		if (!match) return max;
		return Math.max(max, Number(match[1]));
	}, 0);

	return `TASK-${highest + 1}`;
}

export function mapTaskStatusRow(row: SelectTaskStatus): CloudTaskStatus {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		color: row.color,
		type: row.type,
		position: row.position,
		progressPercent: row.progress_percent,
		externalProvider: row.external_provider,
		externalId: row.external_id,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

export function mapTaskRow(row: SelectTask): CloudTask {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		statusId: row.status_id ?? "",
		priority: row.priority,
		organizationId: row.organization_id,
		assigneeId: row.assignee_id,
		creatorId: row.creator_id,
		estimate: row.estimate,
		dueDate: row.due_date ? new Date(row.due_date) : null,
		labels: row.labels ?? [],
		branch: row.branch,
		prUrl: row.pr_url,
		externalProvider: row.external_provider,
		externalId: row.external_id,
		externalKey: row.external_key,
		externalUrl: row.external_url,
		lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
		syncError: row.sync_error,
		assigneeExternalId: row.assignee_external_id,
		assigneeDisplayName: row.assignee_display_name,
		assigneeAvatarUrl: row.assignee_avatar_url,
		startedAt: row.started_at ? new Date(row.started_at) : null,
		completedAt: row.completed_at ? new Date(row.completed_at) : null,
		deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}
