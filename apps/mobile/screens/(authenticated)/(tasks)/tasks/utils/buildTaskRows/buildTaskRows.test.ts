/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { buildTaskRows, flattenTaskGroups } from "./buildTaskRows";

const baseTask = {
	description: null,
	externalProvider: null,
	externalKey: null,
	externalUrl: null,
	syncError: null,
	dueDate: null,
	deletedAt: null,
	branch: null,
	createdAt: "2026-06-12T08:00:00Z",
	updatedAt: "2026-06-12T08:00:00Z",
} as const;

describe("buildTaskRows", () => {
	test("groups active synced tasks by status and attaches project/workspace context", () => {
		const groups = buildTaskRows({
			statuses: [
				{
					id: "status-started",
					name: "Started",
					color: "#22c55e",
					type: "started",
					position: 2,
					progressPercent: 50,
				},
			],
			projects: [{ id: "project-1", name: "Superset", slug: "superset" }],
			hosts: [{ machineId: "host-1", name: "Mac Studio", isOnline: true }],
			workspaces: [
				{
					id: "workspace-1",
					name: "iOS worktree",
					branch: "codex/ios",
					projectId: "project-1",
					hostId: "host-1",
					type: "worktree",
					taskId: "task-1",
				},
			],
			tasks: [
				{
					...baseTask,
					id: "task-1",
					slug: "SUPER-1",
					title: "Implement mobile task sync",
					statusId: "status-started",
					priority: "high",
					v2ProjectId: "project-1",
				},
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			name: "Started",
			tasks: [
				{
					id: "task-1",
					projectName: "Superset",
					workspaceName: "iOS worktree",
					hostName: "Mac Studio",
					isHostOnline: true,
				},
			],
		});
	});

	test("keeps cached tasks visible when related rows have not arrived", () => {
		const groups = buildTaskRows({
			statuses: [],
			projects: [],
			workspaces: [],
			hosts: [],
			tasks: [
				{
					...baseTask,
					id: "task-1",
					slug: "SUPER-1",
					title: "Cached task",
					statusId: "missing-status",
					priority: "none",
					v2ProjectId: "missing-project",
				},
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			name: "Unknown status",
			tasks: [
				{
					id: "task-1",
					projectName: null,
					workspaceName: null,
					statusName: "Unknown status",
				},
			],
		});
	});

	test("filters deleted tasks and sorts by status position then priority", () => {
		const groups = buildTaskRows({
			statuses: [
				{
					id: "status-backlog",
					name: "Backlog",
					color: "#94a3b8",
					type: "backlog",
					position: 1,
					progressPercent: 0,
				},
				{
					id: "status-started",
					name: "Started",
					color: "#22c55e",
					type: "started",
					position: 2,
					progressPercent: 50,
				},
			],
			projects: [],
			workspaces: [],
			hosts: [],
			tasks: [
				{
					...baseTask,
					id: "task-low",
					slug: "SUPER-2",
					title: "Low priority",
					statusId: "status-started",
					priority: "low",
					v2ProjectId: null,
				},
				{
					...baseTask,
					id: "task-urgent",
					slug: "SUPER-3",
					title: "Urgent priority",
					statusId: "status-started",
					priority: "urgent",
					v2ProjectId: null,
				},
				{
					...baseTask,
					id: "task-deleted",
					slug: "SUPER-4",
					title: "Deleted task",
					statusId: "status-backlog",
					priority: "urgent",
					v2ProjectId: null,
					deletedAt: "2026-06-12T09:00:00Z",
				},
				{
					...baseTask,
					id: "task-backlog",
					slug: "SUPER-5",
					title: "Backlog task",
					statusId: "status-backlog",
					priority: "none",
					v2ProjectId: null,
				},
			],
		});

		expect(groups.map((group) => group.id)).toEqual([
			"status-backlog",
			"status-started",
		]);
		expect(flattenTaskGroups(groups).map((task) => task.id)).toEqual([
			"task-backlog",
			"task-urgent",
			"task-low",
		]);
	});
});
