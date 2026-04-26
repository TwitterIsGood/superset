import { describe, expect, test } from "bun:test";
import {
	DEFAULT_LOCAL_TASK_STATUSES,
	mapTaskRow,
	mapTaskStatusRow,
	nextLocalTaskSlug,
} from "./helpers";

describe("tasks-local helpers", () => {
	test("keeps default statuses in cloud-compatible order", () => {
		expect(DEFAULT_LOCAL_TASK_STATUSES.map((status) => status.type)).toEqual([
			"backlog",
			"unstarted",
			"started",
			"completed",
			"canceled",
		]);
		expect(
			DEFAULT_LOCAL_TASK_STATUSES.map((status) => status.position),
		).toEqual([0, 1, 2, 3, 4]);
	});

	test("generates the next local TASK slug from existing local slugs", () => {
		expect(nextLocalTaskSlug([])).toBe("TASK-1");
		expect(nextLocalTaskSlug(["TASK-1", "TASK-9", "OTHER-100"])).toBe(
			"TASK-10",
		);
	});

	test("maps local status rows to camelCase cloud-shaped rows", () => {
		const mapped = mapTaskStatusRow({
			id: "status-id",
			organization_id: "org-id",
			name: "Todo",
			color: "#e2e2e2",
			type: "unstarted",
			position: 1,
			progress_percent: null,
			external_provider: null,
			external_id: null,
			created_at: "2026-04-25T00:00:00.000Z",
			updated_at: "2026-04-25T00:00:00.000Z",
		});

		expect(mapped.organizationId).toBe("org-id");
		expect(mapped.progressPercent).toBeNull();
		expect(mapped.createdAt).toBeInstanceOf(Date);
	});

	test("maps local task rows to camelCase cloud-shaped rows", () => {
		const mapped = mapTaskRow({
			id: "task-id",
			slug: "TASK-1",
			title: "Local task",
			description: null,
			status: "Backlog",
			status_color: "#95a2b3",
			status_type: "backlog",
			status_position: 0,
			status_id: "status-id",
			priority: "none",
			organization_id: "org-id",
			repository_id: null,
			assignee_id: null,
			assignee_external_id: null,
			assignee_display_name: null,
			assignee_avatar_url: null,
			creator_id: "local-user-id",
			estimate: null,
			due_date: null,
			labels: null,
			branch: null,
			pr_url: null,
			external_provider: null,
			external_id: null,
			external_key: null,
			external_url: null,
			last_synced_at: null,
			sync_error: null,
			started_at: null,
			completed_at: null,
			deleted_at: null,
			created_at: "2026-04-25T00:00:00.000Z",
			updated_at: "2026-04-25T00:00:00.000Z",
		});

		expect(mapped.statusId).toBe("status-id");
		expect(mapped.organizationId).toBe("org-id");
		expect(mapped.labels).toEqual([]);
		expect(mapped.createdAt).toBeInstanceOf(Date);
	});
});
