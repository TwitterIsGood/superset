import {
	FetchError,
	type ShapeStreamOptions,
	snakeCamelMapper,
} from "@electric-sql/client";
import type {
	SelectChatSession,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
	SelectV2Host,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
} from "@superset/db/schema";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { getJwt, refreshJwt } from "../auth/client";
import { env } from "../env";
import { apiClient } from "../trpc/client";

const columnMapper = snakeCamelMapper();
const electricUrl = `${env.EXPO_PUBLIC_ELECTRIC_URL}/v1/shape`;
const electricHeaders = {
	Authorization: async () => {
		const token = getJwt();
		if (token) return `Bearer ${token}`;

		const refreshedToken = await refreshJwt().catch(() => null);
		return refreshedToken ? `Bearer ${refreshedToken}` : "";
	},
};

const handleElectricSyncError: NonNullable<
	ShapeStreamOptions["onError"]
> = async (error) => {
	if (error instanceof FetchError && error.status === 401) {
		try {
			await refreshJwt();
		} catch (_refreshError) {
			console.log("[collections] Clearing stale session after Electric 401");
		}
	} else {
		console.error("[collections] Electric sync error", error);
	}
	return {};
};

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	v2Projects: Collection<SelectV2Project>;
	v2Hosts: Collection<SelectV2Host>;
	v2UsersHosts: Collection<SelectV2UsersHosts>;
	v2Workspaces: Collection<SelectV2Workspace>;
	chatSessions: Collection<SelectChatSession>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
}

const collectionsCache = new Map<string, OrgCollections>();

// Organizations collection (global)
const organizationsCollection = createCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: electricHeaders,
			columnMapper,
			onError: handleElectricSyncError,
		},
		getKey: (item) => item.id,
	}),
);

function createOrgCollections(organizationId: string): OrgCollections {
	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "tasks", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.task.update.mutate({
					...changes,
					id: original.id,
				});
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	const taskStatuses = createCollection(
		electricCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "task_statuses", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createCollection(
		electricCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "projects", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Projects = createCollection(
		electricCollectionOptions<SelectV2Project>({
			id: `v2-projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_projects", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Hosts = createCollection(
		electricCollectionOptions<SelectV2Host>({
			id: `v2-hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_hosts", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => `${item.organizationId}:${item.machineId}`,
		}),
	);

	const v2UsersHosts = createCollection(
		electricCollectionOptions<SelectV2UsersHosts>({
			id: `v2-users-hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_users_hosts", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => `${item.organizationId}:${item.userId}:${item.hostId}`,
		}),
	);

	const v2Workspaces = createCollection(
		electricCollectionOptions<SelectV2Workspace>({
			id: `v2-workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_workspaces", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createCollection(
		electricCollectionOptions<SelectChatSession>({
			id: `chat-sessions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "chat_sessions", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.members", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.users", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const invitations = createCollection(
		electricCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.invitations", organizationId },
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		taskStatuses,
		projects,
		v2Projects,
		v2Hosts,
		v2UsersHosts,
		v2Workspaces,
		chatSessions,
		members,
		users,
		invitations,
	};
}

export function getCollections(organizationId: string) {
	if (!collectionsCache.has(organizationId)) {
		collectionsCache.set(organizationId, createOrgCollections(organizationId));
	}

	const orgCollections = collectionsCache.get(organizationId);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return {
		...orgCollections,
		organizations: organizationsCollection,
	};
}
