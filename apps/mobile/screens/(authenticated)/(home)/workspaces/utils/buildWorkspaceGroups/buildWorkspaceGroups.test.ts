/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { buildWorkspaceGroups } from "./buildWorkspaceGroups";

describe("buildWorkspaceGroups", () => {
	test("groups workspaces by project and attaches host status", () => {
		const groups = buildWorkspaceGroups({
			projects: [
				{
					id: "project-1",
					name: "Superset",
					slug: "superset",
					repoCloneUrl: "https://github.com/superset-sh/superset.git",
					iconUrl: null,
				},
			],
			hosts: [
				{
					organizationId: "org-1",
					machineId: "host-1",
					name: "Mac Studio",
					isOnline: true,
					updatedAt: new Date(),
				},
			],
			hostAccesses: [
				{
					organizationId: "org-1",
					userId: "user-1",
					hostId: "host-1",
				},
			],
			currentUserId: "user-1",
			workspaces: [
				{
					id: "workspace-1",
					name: "Feature work",
					branch: "codex/feature-work",
					projectId: "project-1",
					hostId: "host-1",
					type: "worktree",
					taskId: null,
					createdAt: new Date("2026-06-12T08:00:00Z"),
				},
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]?.workspaces[0]).toMatchObject({
			hostName: "Mac Studio",
			isHostOnline: true,
			hostReachability: "online",
			canControlHost: true,
			name: "Feature work",
		});
	});

	test("marks host control unavailable when the current user has no host access", () => {
		const groups = buildWorkspaceGroups({
			projects: [
				{
					id: "project-1",
					name: "Superset",
					slug: "superset",
					repoCloneUrl: null,
					iconUrl: null,
				},
			],
			hosts: [
				{
					organizationId: "org-1",
					machineId: "host-1",
					name: "Shared Mac",
					isOnline: true,
					updatedAt: new Date(),
				},
			],
			hostAccesses: [
				{
					organizationId: "org-1",
					userId: "other-user",
					hostId: "host-1",
				},
			],
			currentUserId: "user-1",
			workspaces: [
				{
					id: "workspace-1",
					name: "Shared worktree",
					branch: "shared",
					projectId: "project-1",
					hostId: "host-1",
					type: "worktree",
					taskId: null,
					createdAt: new Date("2026-06-12T08:00:00Z"),
				},
			],
		});

		expect(groups[0]?.workspaces[0]).toMatchObject({
			canControlHost: false,
			hostName: "Shared Mac",
			isHostOnline: true,
			hostReachability: "no-access",
		});
	});

	test("sorts main workspaces first and newer worktrees next", () => {
		const groups = buildWorkspaceGroups({
			projects: [
				{
					id: "project-1",
					name: "Superset",
					slug: "superset",
					repoCloneUrl: null,
					iconUrl: null,
				},
			],
			hosts: [],
			workspaces: [
				{
					id: "workspace-old",
					name: "Old worktree",
					branch: "old",
					projectId: "project-1",
					hostId: "host-1",
					type: "worktree",
					taskId: null,
					createdAt: new Date("2026-06-10T08:00:00Z"),
				},
				{
					id: "workspace-main",
					name: "Main",
					branch: "main",
					projectId: "project-1",
					hostId: "host-1",
					type: "main",
					taskId: null,
					createdAt: new Date("2026-06-01T08:00:00Z"),
				},
				{
					id: "workspace-new",
					name: "New worktree",
					branch: "new",
					projectId: "project-1",
					hostId: "host-1",
					type: "worktree",
					taskId: null,
					createdAt: new Date("2026-06-12T08:00:00Z"),
				},
			],
		});

		expect(groups[0]?.workspaces.map((workspace) => workspace.id)).toEqual([
			"workspace-main",
			"workspace-new",
			"workspace-old",
		]);
	});

	test("prioritizes reachable duplicate main worktrees and labels them by host", () => {
		const now = new Date();
		const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
		const groups = buildWorkspaceGroups({
			projects: [
				{
					id: "project-1",
					name: "ClaudeCodeSwitch",
					slug: "claudecodeswitch",
					repoCloneUrl: null,
					iconUrl: null,
				},
			],
			hosts: [
				{
					organizationId: "org-1",
					machineId: "host-online",
					name: "Biang Mac",
					isOnline: true,
					updatedAt: now,
				},
				{
					organizationId: "org-1",
					machineId: "host-stale",
					name: "Mac mini",
					isOnline: true,
					updatedAt: stale,
				},
				{
					organizationId: "org-1",
					machineId: "host-offline",
					name: "MBP",
					isOnline: false,
					updatedAt: now,
				},
			],
			hostAccesses: [
				{
					organizationId: "org-1",
					userId: "user-1",
					hostId: "host-online",
				},
				{
					organizationId: "org-1",
					userId: "user-1",
					hostId: "host-stale",
				},
				{
					organizationId: "org-1",
					userId: "user-1",
					hostId: "host-offline",
				},
			],
			currentUserId: "user-1",
			workspaces: [
				{
					id: "workspace-stale",
					name: "main",
					branch: "main",
					projectId: "project-1",
					hostId: "host-stale",
					type: "main",
					taskId: null,
					createdAt: new Date("2026-06-15T08:00:00Z"),
				},
				{
					id: "workspace-offline",
					name: "main",
					branch: "main",
					projectId: "project-1",
					hostId: "host-offline",
					type: "main",
					taskId: null,
					createdAt: new Date("2026-06-15T09:00:00Z"),
				},
				{
					id: "workspace-online",
					name: "main",
					branch: "main",
					projectId: "project-1",
					hostId: "host-online",
					type: "main",
					taskId: null,
					createdAt: new Date("2026-06-15T07:00:00Z"),
				},
			],
		});

		expect(groups[0]?.workspaces.map((workspace) => workspace.id)).toEqual([
			"workspace-online",
			"workspace-stale",
			"workspace-offline",
		]);
		expect(
			groups[0]?.workspaces.map((workspace) => workspace.displayName),
		).toEqual(["main - Biang Mac", "main - Mac mini", "main - MBP"]);
		expect(
			groups[0]?.workspaces.map((workspace) => workspace.hostReachability),
		).toEqual(["online", "stale", "offline"]);
	});

	test("keeps cached workspaces visible when project rows have not arrived", () => {
		const groups = buildWorkspaceGroups({
			projects: [],
			hosts: [],
			workspaces: [
				{
					id: "workspace-1",
					name: "Cached worktree",
					branch: "cached",
					projectId: "project-not-yet-synced",
					hostId: "host-not-yet-synced",
					type: "worktree",
					taskId: null,
					createdAt: "2026-06-12T08:00:00Z",
				},
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			name: "Unknown project",
			workspaces: [
				{
					id: "workspace-1",
					hostName: null,
					isHostOnline: null,
					hostReachability: "unknown",
					canControlHost: null,
				},
			],
		});
		expect(groups[0]?.workspaces[0]?.createdAt).toBeInstanceOf(Date);
	});
});
