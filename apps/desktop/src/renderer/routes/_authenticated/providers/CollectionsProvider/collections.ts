import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectAgentCommand,
	SelectAutomation,
	SelectAutomationRun,
	SelectChatSession,
	SelectGithubPullRequest,
	SelectGithubRepository,
	SelectIntegrationConnection,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectSessionHost,
	SelectSubscription,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
	SelectV2Client,
	SelectV2Host,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
	SelectWorkspace,
} from "@superset/db/schema";
import type { AppRouter } from "@superset/trpc";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type {
	Collection,
	LocalStorageCollectionUtils,
	SyncConfig,
} from "@tanstack/react-db";
import {
	BasicIndex,
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import { getAuthToken, getJwt } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import superjson from "superjson";
import { z } from "zod";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type PendingWorkspaceRow,
	pendingWorkspaceSchema,
	type V2TerminalPresetRow,
	type V2UserPreferencesRow,
	v2TerminalPresetSchema,
	v2UserPreferencesSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";

const columnMapper = snakeCamelMapper();

const electricUrl = `${env.NEXT_PUBLIC_ELECTRIC_URL}/v1/shape`;

const indexDefaults = {
	autoIndex: "eager",
	defaultIndexType: BasicIndex,
} as const;

const createIndexedCollection = ((
	config: Parameters<typeof createCollection>[0],
) =>
	createCollection({ ...config, ...indexDefaults })) as typeof createCollection;

const apiKeyDisplaySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	start: z.string().nullable(),
	createdAt: z.coerce.date(),
	lastRequest: z.coerce.date().nullable(),
});

type ApiKeyDisplay = z.infer<typeof apiKeyDisplaySchema>;

type IntegrationConnectionDisplay = Omit<
	SelectIntegrationConnection,
	"accessToken" | "refreshToken"
>;

export type TasksDataMode = "local" | "cloud";

export interface OrgCollections {
	tasksMode: TasksDataMode;
	activeOrganizationId: string;
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	v2Hosts: Collection<SelectV2Host>;
	v2Clients: Collection<SelectV2Client>;
	v2UsersHosts: Collection<SelectV2UsersHosts>;
	v2Projects: Collection<SelectV2Project>;
	v2Workspaces: Collection<SelectV2Workspace>;
	workspaces: Collection<SelectWorkspace>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	organizations: Collection<SelectOrganization>;
	invitations: Collection<SelectInvitation>;
	agentCommands: Collection<SelectAgentCommand>;
	integrationConnections: Collection<IntegrationConnectionDisplay>;
	subscriptions: Collection<SelectSubscription>;
	apiKeys: Collection<ApiKeyDisplay>;
	chatSessions: Collection<SelectChatSession>;
	sessionHosts: Collection<SelectSessionHost>;
	githubRepositories: Collection<SelectGithubRepository>;
	githubPullRequests: Collection<SelectGithubPullRequest>;
	automations: Collection<SelectAutomation>;
	automationRuns: Collection<SelectAutomationRun>;
	v2SidebarProjects: Collection<
		DashboardSidebarProjectRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarProjectSchema,
		z.input<typeof dashboardSidebarProjectSchema>
	>;
	v2WorkspaceLocalState: Collection<
		WorkspaceLocalStateRow,
		string,
		LocalStorageCollectionUtils,
		typeof workspaceLocalStateSchema,
		z.input<typeof workspaceLocalStateSchema>
	>;
	v2SidebarSections: Collection<
		DashboardSidebarSectionRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarSectionSchema,
		z.input<typeof dashboardSidebarSectionSchema>
	>;
	v2TerminalPresets: Collection<
		V2TerminalPresetRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2TerminalPresetSchema,
		z.input<typeof v2TerminalPresetSchema>
	>;
	pendingWorkspaces: Collection<
		PendingWorkspaceRow,
		string,
		LocalStorageCollectionUtils,
		typeof pendingWorkspaceSchema,
		z.input<typeof pendingWorkspaceSchema>
	>;
	v2UserPreferences: Collection<
		V2UserPreferencesRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2UserPreferencesSchema,
		z.input<typeof v2UserPreferencesSchema>
	>;
}

// Per-org and per-mode collections cache
const collectionsCache = new Map<string, OrgCollections>();

export function getTasksDataMode({
	activeOrganizationId,
	jwt,
}: {
	activeOrganizationId: string | null | undefined;
	jwt: string | null | undefined;
}): TasksDataMode {
	return activeOrganizationId && jwt ? "cloud" : "local";
}

function getCollectionsCacheKey(
	organizationId: string,
	mode: TasksDataMode,
): string {
	return `${mode}:${organizationId}`;
}

// Singleton API client with dynamic auth headers
const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			headers: () => {
				const token = getAuthToken();
				return token ? { Authorization: `Bearer ${token}` } : {};
			},
			transformer: superjson,
		}),
	],
});

const electricHeaders = {
	Authorization: () => {
		const token = getJwt();
		return token ? `Bearer ${token}` : "";
	},
};

const organizationsCollection = createIndexedCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: electricHeaders,
			columnMapper,
		},
		getKey: (item) => item.id,
	}),
);

type LocalRouterCollectionName =
	| "tasks"
	| "taskStatuses"
	| "users"
	| "organizations"
	| "integrationConnections";

type LocalCollectionConfig<T extends object> = {
	id: string;
	organizationId: string;
	collection: LocalRouterCollectionName;
	list: () => Promise<T[]>;
	getKey: (item: T) => string;
	onUpdate?: Parameters<typeof createCollection<T>>[0]["onUpdate"];
	onDelete?: Parameters<typeof createCollection<T>>[0]["onDelete"];
};

function localCollectionOptions<T extends object>({
	id,
	organizationId,
	collection,
	list,
	getKey,
	onUpdate,
	onDelete,
}: LocalCollectionConfig<T>) {
	const sync: SyncConfig<T> = {
		rowUpdateMode: "full",
		sync: ({ begin, write, commit, markReady, truncate }) => {
			let disposed = false;

			const reload = async () => {
				const rows = await list();
				if (disposed) return;
				begin();
				truncate();
				for (const row of rows) {
					write({ type: "insert", value: row });
				}
				commit();
				markReady();
			};

			void reload().catch((error) => {
				console.error(
					`[local-collections] Failed to load ${collection}`,
					error,
				);
				markReady();
			});

			const subscription = electronTrpcClient.tasksLocal.subscribe.subscribe(
				{ organizationId, collection },
				{
					onData: () => {
						void reload().catch((error) => {
							console.error(
								`[local-collections] Failed to reload ${collection}`,
								error,
							);
						});
					},
					onError: (error) => {
						console.error(
							`[local-collections] Subscription error for ${collection}`,
							error,
						);
					},
				},
			);

			return () => {
				disposed = true;
				subscription.unsubscribe();
			};
		},
	};

	return {
		id,
		getKey,
		sync,
		onUpdate,
		onDelete,
	};
}

function createCloudOrgCollections(organizationId: string): OrgCollections {
	const tasks = createIndexedCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.task.create.mutate(item);
				return { txid: result.txid };
			},
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

	const taskStatuses = createIndexedCollection(
		electricCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "task_statuses",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createIndexedCollection(
		electricCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "projects",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Projects = createIndexedCollection(
		electricCollectionOptions<SelectV2Project>({
			id: `v2_projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_projects",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Hosts = createIndexedCollection(
		electricCollectionOptions<SelectV2Host>({
			id: `v2_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Clients = createIndexedCollection(
		electricCollectionOptions<SelectV2Client>({
			id: `v2_clients-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_clients",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2UsersHosts = createIndexedCollection(
		electricCollectionOptions<SelectV2UsersHosts>({
			id: `v2_users_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_users_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Workspaces = createIndexedCollection(
		electricCollectionOptions<SelectV2Workspace>({
			id: `v2_workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_workspaces",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const workspaces = createIndexedCollection(
		electricCollectionOptions<SelectWorkspace>({
			id: `workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "workspaces",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const members = createIndexedCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.members",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createIndexedCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.users",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const invitations = createIndexedCollection(
		electricCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.invitations",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const agentCommands = createIndexedCollection(
		electricCollectionOptions<SelectAgentCommand>({
			id: `agent_commands-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "agent_commands",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.agent.updateCommand.mutate({
					...changes,
					id: original.id,
				});
				return { txid: result.txid };
			},
		}),
	);

	const integrationConnections = createIndexedCollection(
		electricCollectionOptions<IntegrationConnectionDisplay>({
			id: `integration_connections-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "integration_connections",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const subscriptions = createIndexedCollection(
		electricCollectionOptions<SelectSubscription>({
			id: `subscriptions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "subscriptions",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const apiKeys = createIndexedCollection(
		electricCollectionOptions<ApiKeyDisplay>({
			id: `apikeys-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.apikeys",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createIndexedCollection(
		electricCollectionOptions<SelectChatSession>({
			id: `chat_sessions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "chat_sessions",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const sessionHosts = createIndexedCollection(
		electricCollectionOptions<SelectSessionHost>({
			id: `session_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "session_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const githubRepositories = createIndexedCollection(
		electricCollectionOptions<SelectGithubRepository>({
			id: `github_repositories-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "github_repositories",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const githubPullRequests = createIndexedCollection(
		electricCollectionOptions<SelectGithubPullRequest>({
			id: `github_pull_requests-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "github_pull_requests",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const automations = createIndexedCollection(
		electricCollectionOptions<SelectAutomation>({
			id: `automations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "automations",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const automationRuns = createIndexedCollection(
		electricCollectionOptions<SelectAutomationRun>({
			id: `automation_runs-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "automation_runs",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2SidebarProjects = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_projects-${organizationId}`,
			storageKey: `v2-sidebar-projects-${organizationId}`,
			schema: dashboardSidebarProjectSchema,
			getKey: (item) => item.projectId,
		}),
	);

	const v2WorkspaceLocalState = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_workspace_local_state-${organizationId}`,
			storageKey: `v2-workspace-local-state-${organizationId}`,
			schema: workspaceLocalStateSchema,
			getKey: (item) => item.workspaceId,
		}),
	);

	const v2SidebarSections = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_sections-${organizationId}`,
			storageKey: `v2-sidebar-sections-${organizationId}`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item) => item.sectionId,
		}),
	);

	const v2TerminalPresets = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_terminal_presets-${organizationId}`,
			storageKey: `v2-terminal-presets-${organizationId}`,
			schema: v2TerminalPresetSchema,
			getKey: (item) => item.id,
		}),
	);

	const pendingWorkspaces = createIndexedCollection(
		localStorageCollectionOptions({
			id: `pending_workspaces-${organizationId}`,
			storageKey: `pending-workspaces-${organizationId}`,
			schema: pendingWorkspaceSchema,
			getKey: (item) => item.id,
		}),
	);

	const v2UserPreferences = createCollection(
		localStorageCollectionOptions({
			id: `v2_user_preferences-${organizationId}`,
			storageKey: `v2-user-preferences-${organizationId}`,
			schema: v2UserPreferencesSchema,
			// Cast widens the inferred literal "preferences" key to string so
			// the collection slots into the shared OrgCollections.{...<TKey=string>}
			// shape alongside the other v2 collections.
			getKey: (item) => item.id as string,
		}),
	);

	return {
		tasksMode: "cloud",
		activeOrganizationId: organizationId,
		tasks,
		taskStatuses,
		projects,
		v2Hosts,
		v2Clients,
		v2UsersHosts,
		v2Projects,
		v2Workspaces,
		workspaces,
		members,
		users,
		organizations: organizationsCollection,
		invitations,
		agentCommands,
		integrationConnections,
		subscriptions,
		apiKeys,
		chatSessions,
		sessionHosts,
		githubRepositories,
		githubPullRequests,
		automations,
		automationRuns,
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
		v2TerminalPresets,
		pendingWorkspaces,
		v2UserPreferences,
	};
}

function createLocalOrgCollections(organizationId: string): OrgCollections {
	const cloudCollections = createCloudOrgCollections(organizationId);

	const tasks = createIndexedCollection(
		localCollectionOptions<SelectTask>({
			id: `local-tasks-${organizationId}`,
			organizationId,
			collection: "tasks",
			list: () =>
				electronTrpcClient.tasksLocal.listTasks.query({ organizationId }),
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const taskChanges = {
					...changes,
					labels: changes.labels ?? undefined,
				};
				const result = await electronTrpcClient.tasksLocal.update.mutate({
					id: original.id,
					changes: taskChanges,
				});
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				return electronTrpcClient.tasksLocal.delete.mutate(item.id);
			},
		}),
	);

	const taskStatuses = createIndexedCollection(
		localCollectionOptions<SelectTaskStatus>({
			id: `local-task-statuses-${organizationId}`,
			organizationId,
			collection: "taskStatuses",
			list: async () => {
				await electronTrpcClient.tasksLocal.ensureDefaultStatuses.mutate({
					organizationId,
				});
				return electronTrpcClient.tasksLocal.listTaskStatuses.query({
					organizationId,
				});
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createIndexedCollection(
		localCollectionOptions<SelectUser>({
			id: `local-users-${organizationId}`,
			organizationId,
			collection: "users",
			list: () =>
				electronTrpcClient.tasksLocal.listUsers.query({ organizationId }),
			getKey: (item) => item.id,
		}),
	);

	const organizations = createIndexedCollection(
		localCollectionOptions<SelectOrganization>({
			id: `local-organizations-${organizationId}`,
			organizationId,
			collection: "organizations",
			list: () => electronTrpcClient.tasksLocal.listOrganizations.query(),
			getKey: (item) => item.id,
		}),
	);

	const integrationConnections = createIndexedCollection(
		localCollectionOptions<IntegrationConnectionDisplay>({
			id: `local-integration-connections-${organizationId}`,
			organizationId,
			collection: "integrationConnections",
			list: () =>
				electronTrpcClient.tasksLocal.listIntegrationConnections.query({
					organizationId,
				}),
			getKey: (item) => item.id,
		}),
	);

	return {
		...cloudCollections,
		tasksMode: "local",
		activeOrganizationId: organizationId,
		tasks,
		taskStatuses,
		users,
		organizations,
		integrationConnections,
	};
}

/**
 * Preload collections for an organization by starting Electric sync.
 * Collections are lazy — they don't fetch data until subscribed or preloaded.
 * Call this eagerly so data is ready when the user switches orgs.
 */
export async function preloadCollections(
	organizationId: string,
	mode: TasksDataMode = "cloud",
): Promise<void> {
	const collections = getCollections(organizationId, mode);
	const collectionsToPreload = Object.entries(collections)
		.filter(
			([name, value]) =>
				name !== "organizations" &&
				name !== "tasksMode" &&
				name !== "activeOrganizationId" &&
				typeof value === "object",
		)
		.map(([, collection]) => collection as Collection<object>);

	await Promise.allSettled(
		collectionsToPreload.map((c) => (c as Collection<object>).preload()),
	);
}

/**
 * Get collections for an organization, creating them if needed.
 * Collections are cached per org for instant switching.
 * Auth token is read dynamically via getAuthToken() - no need to pass it.
 */
export function getCollections(
	organizationId: string,
	mode: TasksDataMode = "cloud",
) {
	const cacheKey = getCollectionsCacheKey(organizationId, mode);

	if (!collectionsCache.has(cacheKey)) {
		collectionsCache.set(
			cacheKey,
			mode === "cloud"
				? createCloudOrgCollections(organizationId)
				: createLocalOrgCollections(organizationId),
		);
	}

	const orgCollections = collectionsCache.get(cacheKey);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return orgCollections;
}

export type AppCollections = ReturnType<typeof getCollections>;
