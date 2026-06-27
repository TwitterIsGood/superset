import {
	FetchError,
	type ShapeStreamOptions,
	snakeCamelMapper,
} from "@electric-sql/client";
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
	SelectSubscription,
	SelectTask,
	SelectTaskStatus,
	SelectTeam,
	SelectTeamMember,
	SelectUser,
	SelectV2Client,
	SelectV2Host,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
	SelectWorkspace,
} from "@superset/db/schema";
import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import type { AppRouter } from "@superset/trpc";
import { BasicIndex, type SyncConfig, type UtilsRecord } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import {
	createElectronSQLitePersistence,
	persistedCollectionOptions,
} from "@tanstack/electron-db-sqlite-persistence";
import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { env } from "renderer/env.renderer";
import {
	authClient,
	getAuthToken,
	getJwt,
	setJwt,
} from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import superjson from "superjson";
import {
	type DashboardSidebarProjectInput,
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionInput,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type FailedWorkspaceCreateInput,
	type FailedWorkspaceCreateRow,
	failedWorkspaceCreateSchema,
	healV2UserPreferences,
	healWorkspaceLocalState,
	type V2TerminalPresetInput,
	type V2TerminalPresetRow,
	type V2UserPreferencesInput,
	type V2UserPreferencesRow,
	v2TerminalPresetSchema,
	v2UserPreferencesSchema,
	type WorkspaceLocalStateInput,
	type WorkspaceLocalStateRow,
	type WorkspacesCreateInput,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";
import { withReadHeal } from "./withReadHeal";

const columnMapper = snakeCamelMapper();

const electricUrl = `${env.NEXT_PUBLIC_ELECTRIC_URL}/v1/shape`;

export const ELECTRIC_WRITE_SYNC_TIMEOUT_MS = 30_000;

function electricTxidMatch(txid: unknown) {
	if (typeof txid !== "number") return undefined;
	return { txid, timeout: ELECTRIC_WRITE_SYNC_TIMEOUT_MS };
}

type HostWorkspacesCreateResult =
	inferRouterOutputs<HostServiceAppRouter>["workspaces"]["create"];

export interface WorkspaceCreateMutationMetadata {
	hostUrl: string;
	input: WorkspacesCreateInput;
	result?: HostWorkspacesCreateResult;
	[key: string]: unknown;
}

const persistence = createElectronSQLitePersistence({
	invoke: (channel, request) => window.ipcRenderer.invoke(channel, request),
});

const indexDefaults = {
	autoIndex: "eager",
	defaultIndexType: BasicIndex,
} as const;
const basicIndexConfig = { indexType: BasicIndex } as const;

const createIndexedCollection = ((
	config: Parameters<typeof createCollection>[0],
) =>
	createCollection({ ...config, ...indexDefaults })) as typeof createCollection;

type ElectricSyncConfig = ReturnType<typeof electricCollectionOptions>;

type SyncRowMutation<T extends object> =
	| { type: "insert" | "update"; value: T; metadata?: Record<string, unknown> }
	| { type: "delete"; key: string | number };

type SyncRowControls<T extends object> = {
	begin: (options?: { immediate?: boolean }) => void;
	write: (mutation: SyncRowMutation<T>) => void;
	commit: () => void;
};

interface SyncedRowUpsertUtils<T extends object> extends UtilsRecord {
	upsertSyncedRow: (row: T) => boolean;
}

type SyncedRowCollection<T extends object> = Collection<
	T,
	string | number,
	SyncedRowUpsertUtils<T>
>;

type SyncableCollection = Collection<object> & {
	startSyncImmediate?: () => void;
};

type CollectionStatusSnapshot = {
	id: string;
	rowCount: number;
	status: string;
};
type PreloadableCollectionKey = keyof OrgCollections | "organizations";

export type CollectionPreloadProfile = {
	pathname?: string | null;
	keys?: readonly PreloadableCollectionKey[];
};

export interface CollectionsStatusReport {
	organizationId: string;
	collections: Record<string, CollectionStatusSnapshot>;
}

const PERSISTED_ELECTRIC_SCHEMA_VERSION = 1;
const V2_WORKSPACE_GRAPH_KEYS = [
	"v2Workspaces",
	"v2Projects",
	"v2Hosts",
	"v2UsersHosts",
] as const satisfies readonly (keyof OrgCollections)[];
const V2_WORKSPACE_GRAPH_DEPENDENCY_KEYS = [
	"v2Projects",
	"v2Hosts",
	"v2UsersHosts",
] as const satisfies readonly (keyof OrgCollections)[];

const AUTHENTICATED_SHELL_COLLECTION_KEYS = [
	"organizations",
	"v2Hosts",
	"v2Clients",
	"v2UsersHosts",
	"v2Projects",
	"v2Workspaces",
	"v2SidebarProjects",
	"v2WorkspaceLocalState",
	"v2SidebarSections",
	"v2TerminalPresets",
	"v2UserPreferences",
] as const satisfies readonly PreloadableCollectionKey[];

const TASKS_COLLECTION_KEYS = [
	"tasks",
	"taskStatuses",
	"users",
	"v2Projects",
	"v2Workspaces",
] as const satisfies readonly PreloadableCollectionKey[];

const WORKSPACE_COLLECTION_KEYS = [
	"chatSessions",
	"githubRepositories",
	"githubPullRequests",
] as const satisfies readonly PreloadableCollectionKey[];

const AUTOMATIONS_COLLECTION_KEYS = [
	"automations",
	"automationRuns",
	"v2Projects",
] as const satisfies readonly PreloadableCollectionKey[];

const SETTINGS_COLLECTION_KEYS = [
	"members",
	"users",
	"invitations",
	"teams",
	"teamMembers",
	"integrationConnections",
	"subscriptions",
	"apiKeys",
] as const satisfies readonly PreloadableCollectionKey[];

type V2WorkspaceGraphKey = (typeof V2_WORKSPACE_GRAPH_KEYS)[number];
type V2WorkspaceGraphDependencyKey =
	(typeof V2_WORKSPACE_GRAPH_DEPENDENCY_KEYS)[number];

export interface V2WorkspaceGraphHealthReport {
	organizationId: string;
	collections: Record<V2WorkspaceGraphKey, CollectionStatusSnapshot>;
	isPartial: boolean;
	resetKeys: V2WorkspaceGraphDependencyKey[];
	reason?: string;
}

export interface V2WorkspaceGraphRecoveryReport
	extends V2WorkspaceGraphHealthReport {
	recovered: boolean;
	before: V2WorkspaceGraphHealthReport;
	after?: V2WorkspaceGraphHealthReport;
}

function withSyncedRowUpsertFor<T extends object>() {
	return <
		TConfig extends {
			sync: SyncConfig<T, string | number>;
			utils?: UtilsRecord;
		},
	>(
		config: TConfig,
	): TConfig & { utils: TConfig["utils"] & SyncedRowUpsertUtils<T> } => {
		const syncControls: Partial<SyncRowControls<T>> = {};
		const sourceSync = config.sync;

		return {
			...config,
			sync: {
				...sourceSync,
				sync: (params) => {
					syncControls.begin = params.begin;
					syncControls.write = params.write as SyncRowControls<T>["write"];
					syncControls.commit = params.commit;
					return sourceSync.sync(params);
				},
			},
			utils: {
				...(config.utils ?? {}),
				upsertSyncedRow: (row: T) => {
					if (
						!syncControls.begin ||
						!syncControls.write ||
						!syncControls.commit
					) {
						return false;
					}

					try {
						syncControls.begin({ immediate: true });
						syncControls.write({ type: "update", value: row });
						syncControls.commit();
						return true;
					} catch (error) {
						console.warn("[collections] Failed to upsert synced row", error);
						return false;
					}
				},
			} as TConfig["utils"] & SyncedRowUpsertUtils<T>,
		};
	};
}

const createPersistedElectricCollection = ((config: ElectricSyncConfig) => {
	const persisted = persistedCollectionOptions({
		...config,
		persistence,
		schemaVersion: 1,
		// biome-ignore lint/suspicious/noExplicitAny: forces sync-wrapped overload
	} as any);
	return createCollection({
		...persisted,
		...indexDefaults,
		// biome-ignore lint/suspicious/noExplicitAny: persisted utils widen generics
	} as any);
}) as unknown as typeof createCollection;

interface ApiKeyDisplay extends Record<string, unknown> {
	id: string;
	name: string | null;
	start: string | null;
	createdAt: Date;
	lastRequest: Date | null;
}

type IntegrationConnectionDisplay = Omit<
	SelectIntegrationConnection,
	"accessToken" | "refreshToken"
>;

export interface OrgCollections {
	tasks: SyncedRowCollection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	v2Hosts: Collection<SelectV2Host>;
	v2Clients: Collection<SelectV2Client>;
	v2UsersHosts: Collection<SelectV2UsersHosts>;
	v2Projects: SyncedRowCollection<SelectV2Project>;
	v2Workspaces: SyncedRowCollection<SelectV2Workspace>;
	workspaces: Collection<SelectWorkspace>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	teams: Collection<SelectTeam>;
	teamMembers: Collection<SelectTeamMember>;
	agentCommands: Collection<SelectAgentCommand>;
	integrationConnections: Collection<IntegrationConnectionDisplay>;
	subscriptions: Collection<SelectSubscription>;
	apiKeys: Collection<ApiKeyDisplay>;
	chatSessions: Collection<SelectChatSession>;
	githubRepositories: Collection<SelectGithubRepository>;
	githubPullRequests: Collection<SelectGithubPullRequest>;
	automations: Collection<SelectAutomation>;
	automationRuns: Collection<SelectAutomationRun>;
	v2SidebarProjects: Collection<
		DashboardSidebarProjectRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarProjectSchema,
		DashboardSidebarProjectInput
	>;
	v2WorkspaceLocalState: Collection<
		WorkspaceLocalStateRow,
		string,
		LocalStorageCollectionUtils,
		typeof workspaceLocalStateSchema,
		WorkspaceLocalStateInput
	>;
	v2SidebarSections: Collection<
		DashboardSidebarSectionRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarSectionSchema,
		DashboardSidebarSectionInput
	>;
	v2TerminalPresets: Collection<
		V2TerminalPresetRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2TerminalPresetSchema,
		V2TerminalPresetInput
	>;
	v2UserPreferences: Collection<
		V2UserPreferencesRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2UserPreferencesSchema,
		V2UserPreferencesInput
	>;
	failedWorkspaceCreates: Collection<
		FailedWorkspaceCreateRow,
		string,
		LocalStorageCollectionUtils,
		typeof failedWorkspaceCreateSchema,
		FailedWorkspaceCreateInput
	>;
}

// Per-org collections cache
const collectionsCache = new Map<string, OrgCollections>();

function getCollectionsCacheKey(organizationId: string): string {
	return organizationId;
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

type ElectricSyncErrorHandler = NonNullable<ShapeStreamOptions["onError"]>;

const handleElectricSyncError: ElectricSyncErrorHandler = async (error) => {
	if (error instanceof FetchError && error.status === 401) {
		try {
			const result = await authClient.token();
			if (result.data?.token) {
				setJwt(result.data.token);
			}
		} catch (refreshError) {
			console.error("[collections] JWT refresh after 401 failed", refreshError);
		}
	} else {
		console.error("[collections] Electric sync error", error);
	}
	return {};
};

const organizationsCollection = createPersistedElectricCollection(
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
	const tasks = createPersistedElectricCollection(
		withSyncedRowUpsertFor<SelectTask>()(
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
					onError: handleElectricSyncError,
				},
				getKey: (item) => item.id,
				onUpdate: async ({ transaction }) => {
					const { original, changes } = transaction.mutations[0];
					const result = await apiClient.task.update.mutate({
						...changes,
						id: original.id,
					});
					return electricTxidMatch(result.txid);
				},
				onDelete: async ({ transaction }) => {
					const item = transaction.mutations[0].original;
					const result = await apiClient.task.delete.mutate(item.id);
					return electricTxidMatch(result.txid);
				},
			}),
		),
	) as unknown as SyncedRowCollection<SelectTask>;

	const taskStatuses = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Projects = createPersistedElectricCollection(
		withSyncedRowUpsertFor<SelectV2Project>()(
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
					onError: handleElectricSyncError,
				},
				getKey: (item) => item.id,
				onUpdate: async ({ transaction }) => {
					const { original, changes } = transaction.mutations[0];
					const githubRepositoryId =
						changes.githubRepositoryId === null &&
						changes.repoCloneUrl !== undefined
							? undefined
							: changes.githubRepositoryId;
					const result = await apiClient.v2Project.update.mutate({
						id: original.id,
						name: changes.name,
						slug: changes.slug,
						repoCloneUrl: changes.repoCloneUrl,
						githubRepositoryId,
					});
					return electricTxidMatch(result.txid);
				},
			}),
		),
	) as unknown as SyncedRowCollection<SelectV2Project>;
	v2Projects.createIndex(
		(project) => project.githubRepositoryId,
		basicIndexConfig,
	);

	const v2Hosts = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			// Composite PK on (organization_id, machine_id); within an
			// org-scoped collection, machineId alone is unique.
			getKey: (item) => item.machineId,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				if (changes.name === undefined) {
					throw new Error("Only name updates are supported on v2_hosts");
				}
				const result = await apiClient.v2Host.rename.mutate({
					hostId: original.machineId,
					name: changes.name,
				});
				return electricTxidMatch(result.txid);
			},
		}),
	);
	v2Hosts.createIndex((host) => host.machineId, basicIndexConfig);

	const v2Clients = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			// Composite PK on (organization_id, user_id, machine_id); within
			// an org-scoped collection, (user_id, machine_id) is unique.
			getKey: (item) => `${item.userId}:${item.machineId}`,
		}),
	);

	const v2UsersHosts = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => `${item.userId}:${item.hostId}`,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.v2Host.addMember.mutate({
					hostId: item.hostId,
					userId: item.userId,
					role: item.role,
				});
				return electricTxidMatch(result.txid);
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				if (changes.role === undefined) {
					throw new Error("Only role updates are supported on v2_users_hosts");
				}
				const result = await apiClient.v2Host.setMemberRole.mutate({
					hostId: original.hostId,
					userId: original.userId,
					role: changes.role,
				});
				return electricTxidMatch(result.txid);
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.v2Host.removeMember.mutate({
					hostId: item.hostId,
					userId: item.userId,
				});
				return electricTxidMatch(result.txid);
			},
		}),
	);
	v2UsersHosts.createIndex((userHost) => userHost.hostId, basicIndexConfig);
	v2UsersHosts.createIndex((userHost) => userHost.userId, basicIndexConfig);

	const v2Workspaces = createPersistedElectricCollection(
		withSyncedRowUpsertFor<SelectV2Workspace>()(
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
					onError: handleElectricSyncError,
				},
				getKey: (item) => item.id,
				onInsert: async ({ transaction }) => {
					const metadata = transaction.mutations[0]
						.metadata as WorkspaceCreateMutationMetadata;
					const client = getHostServiceClientByUrl(metadata.hostUrl);
					const result = await client.workspaces.create.mutate(metadata.input);
					metadata.result = result;
					// Workspace creation performs local filesystem work after the cloud row is
					// registered. By the time the host-service returns, the txid can already
					// be old enough for Electric's confirmation wait to time out even though
					// create succeeded. Treat the host-service result as the write barrier and
					// let Electric catch up normally.
					return undefined;
				},
				onUpdate: async ({ transaction }) => {
					const { original, changes } = transaction.mutations[0];
					const { branch, hostId, name, taskId } = changes;
					const result = await apiClient.v2Workspace.update.mutate({
						id: original.id,
						branch,
						hostId,
						name,
						taskId,
					});
					return electricTxidMatch(result.txid);
				},
			}),
		),
	) as unknown as SyncedRowCollection<SelectV2Workspace>;
	v2Workspaces.createIndex((workspace) => workspace.hostId, basicIndexConfig);
	v2Workspaces.createIndex(
		(workspace) => workspace.projectId,
		basicIndexConfig,
	);
	v2Workspaces.createIndex((workspace) => workspace.type, basicIndexConfig);

	const workspaces = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const members = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const invitations = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const teams = createPersistedElectricCollection(
		electricCollectionOptions<SelectTeam>({
			id: `teams-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.teams",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const teamMembers = createPersistedElectricCollection(
		electricCollectionOptions<SelectTeamMember>({
			id: `team-members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.team_members",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const agentCommands = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.agent.updateCommand.mutate({
					...changes,
					id: original.id,
				});
				return electricTxidMatch(result.txid);
			},
		}),
	);

	const integrationConnections = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const subscriptions = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const apiKeys = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				await apiClient.chat.createSession.mutate({
					sessionId: item.id,
					v2WorkspaceId: item.v2WorkspaceId,
				});
				return undefined;
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				await apiClient.chat.updateSession.mutate({
					sessionId: original.id,
					title: changes.title ?? undefined,
					lastActiveAt: changes.lastActiveAt,
				});
				return undefined;
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.chat.deleteSession.mutate({
					sessionId: item.id,
				});
				if (!result.deleted) {
					throw new Error("Chat session was not deleted");
				}
				return electricTxidMatch(result.txid);
			},
		}),
	);

	const githubRepositories = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const githubPullRequests = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const automations = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const automationRuns = createPersistedElectricCollection(
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
				onError: handleElectricSyncError,
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
	v2SidebarProjects.createIndex(
		(sidebarProject) => sidebarProject.tabOrder,
		basicIndexConfig,
	);

	const v2WorkspaceLocalState = createIndexedCollection(
		localStorageCollectionOptions(
			withReadHeal(
				{
					id: `v2_workspace_local_state-${organizationId}`,
					storageKey: `v2-workspace-local-state-${organizationId}`,
					schema: workspaceLocalStateSchema,
					// Explicit type so `withReadHeal`'s passthrough generic keeps the
					// linkage between schema and getKey for downstream inference.
					getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
				},
				healWorkspaceLocalState,
			),
		),
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.projectId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.sectionId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.tabOrder,
		basicIndexConfig,
	);

	const v2SidebarSections = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_sections-${organizationId}`,
			storageKey: `v2-sidebar-sections-${organizationId}`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item) => item.sectionId,
		}),
	);
	v2SidebarSections.createIndex(
		(section) => section.projectId,
		basicIndexConfig,
	);
	v2SidebarSections.createIndex(
		(section) => section.tabOrder,
		basicIndexConfig,
	);

	const v2TerminalPresets = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_terminal_presets-${organizationId}`,
			storageKey: `v2-terminal-presets-${organizationId}`,
			schema: v2TerminalPresetSchema,
			getKey: (item) => item.id,
		}),
	);

	const v2UserPreferences = createCollection(
		localStorageCollectionOptions(
			withReadHeal(
				{
					id: `v2_user_preferences-${organizationId}`,
					storageKey: `v2-user-preferences-${organizationId}`,
					schema: v2UserPreferencesSchema,
					// Cast widens the inferred literal "preferences" key to string so
					// the collection slots into the shared OrgCollections.{...<TKey=string>}
					// shape alongside the other v2 collections. Explicit `item` type so
					// `withReadHeal`'s passthrough generic keeps schema/getKey linkage.
					getKey: (item: V2UserPreferencesRow) => item.id as string,
				},
				healV2UserPreferences,
			),
		),
	);

	const failedWorkspaceCreates = createIndexedCollection(
		localStorageCollectionOptions({
			id: `failed_workspace_creates-${organizationId}`,
			storageKey: `failed-workspace-creates-${organizationId}`,
			schema: failedWorkspaceCreateSchema,
			getKey: (item) => item.id,
		}),
	);

	return {
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
		invitations,
		teams,
		teamMembers,
		agentCommands,
		integrationConnections,
		subscriptions,
		apiKeys,
		chatSessions,
		githubRepositories,
		githubPullRequests,
		automations,
		automationRuns,
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
		v2TerminalPresets,
		v2UserPreferences,
		failedWorkspaceCreates,
	};
}

function getCollectionStatusSnapshot(
	collection: Collection<object>,
): CollectionStatusSnapshot {
	return {
		id: collection.id,
		rowCount: collection.size,
		status: collection.status,
	};
}

function resolvePreloadCollectionKeys({
	pathname,
	keys,
}: CollectionPreloadProfile = {}): PreloadableCollectionKey[] {
	const resolvedKeys = new Set<PreloadableCollectionKey>([
		...AUTHENTICATED_SHELL_COLLECTION_KEYS,
		...(keys ?? []),
	]);
	const normalizedPathname = pathname ?? "";

	if (
		normalizedPathname.startsWith("/tasks") ||
		normalizedPathname.startsWith("/chat")
	) {
		for (const key of TASKS_COLLECTION_KEYS) {
			resolvedKeys.add(key);
		}
	}

	if (normalizedPathname.startsWith("/v2-workspace")) {
		for (const key of WORKSPACE_COLLECTION_KEYS) {
			resolvedKeys.add(key);
		}
	}

	if (normalizedPathname.startsWith("/automations")) {
		for (const key of AUTOMATIONS_COLLECTION_KEYS) {
			resolvedKeys.add(key);
		}
	}

	if (normalizedPathname.startsWith("/settings")) {
		for (const key of SETTINGS_COLLECTION_KEYS) {
			resolvedKeys.add(key);
		}
	}

	return [...resolvedKeys];
}

function getPreloadableCollection(
	collections: AppCollections,
	key: PreloadableCollectionKey,
): Collection<object> {
	return collections[key] as Collection<object>;
}

export function getCollectionsStatusReport(
	organizationId: string,
): CollectionsStatusReport {
	const collections = getCollections(organizationId);
	const snapshots = Object.fromEntries(
		Object.entries(collections)
			.filter(([name]) => name !== "switchOrganization")
			.map(([name, collection]) => [
				name,
				getCollectionStatusSnapshot(collection as Collection<object>),
			]),
	);

	return {
		organizationId,
		collections: snapshots,
	};
}

export function getV2WorkspaceGraphHealth(
	organizationId: string,
): V2WorkspaceGraphHealthReport {
	const collections = getCollections(organizationId);
	const snapshots = Object.fromEntries(
		V2_WORKSPACE_GRAPH_KEYS.map((key) => [
			key,
			getCollectionStatusSnapshot(collections[key] as Collection<object>),
		]),
	) as Record<V2WorkspaceGraphKey, CollectionStatusSnapshot>;
	const workspaceCount = snapshots.v2Workspaces.rowCount;
	const resetKeys = V2_WORKSPACE_GRAPH_DEPENDENCY_KEYS.filter((key) => {
		const snapshot = snapshots[key];
		return (
			workspaceCount > 0 &&
			snapshot.rowCount === 0 &&
			snapshot.status === "ready"
		);
	});
	const isPartial = resetKeys.length > 0;

	return {
		organizationId,
		collections: snapshots,
		isPartial,
		resetKeys,
		...(isPartial
			? {
					reason: `v2Workspaces has ${workspaceCount} row(s), but ${resetKeys.join(
						", ",
					)} finished with 0 row(s).`,
				}
			: {}),
	};
}

function createRecoveryTx(collectionId: string) {
	const now = Date.now();
	return {
		txId: `desktop-electric-cache-recovery:${collectionId}:${now}:${Math.random()
			.toString(36)
			.slice(2)}`,
		term: now,
		seq: Math.floor(Math.random() * 1_000_000_000),
		rowVersion: 0,
		truncate: true,
		mutations: [],
		collectionMetadataMutations: [
			{ type: "delete" as const, key: "electric:resume" },
		],
	};
}

async function resetPersistedElectricCollection(
	collection: Collection<object>,
): Promise<void> {
	const resolvedPersistence =
		persistence.resolvePersistenceForCollection?.({
			collectionId: collection.id,
			mode: "sync-present",
			schemaVersion: PERSISTED_ELECTRIC_SCHEMA_VERSION,
		}) ??
		persistence.resolvePersistenceForMode?.("sync-present") ??
		persistence;

	await collection.cleanup();
	await resolvedPersistence.adapter.applyCommittedTx(
		collection.id,
		createRecoveryTx(collection.id),
	);
}

export async function recoverPartialV2WorkspaceGraphCache(
	organizationId: string,
): Promise<V2WorkspaceGraphRecoveryReport> {
	const before = getV2WorkspaceGraphHealth(organizationId);
	if (!before.isPartial) {
		return {
			...before,
			recovered: false,
			before,
		};
	}

	const collections = getCollections(organizationId);
	await Promise.all(
		before.resetKeys.map((key) =>
			resetPersistedElectricCollection(collections[key] as Collection<object>),
		),
	);

	const after = getV2WorkspaceGraphHealth(organizationId);
	return {
		...after,
		recovered: true,
		before,
		after,
	};
}

function getV2WorkspaceGraphRecoveryReloadKey(organizationId: string) {
	return `superset:v2-workspace-graph-cache-recovered:${organizationId}`;
}

async function reloadOnceAfterV2WorkspaceGraphRecovery(
	organizationId: string,
): Promise<void> {
	const report = await recoverPartialV2WorkspaceGraphCache(organizationId);
	if (!report.recovered) return;

	console.warn(
		"[collections] Recovered partial v2 workspace collection cache; reloading renderer.",
		report.before,
	);

	const reloadKey = getV2WorkspaceGraphRecoveryReloadKey(organizationId);
	if (globalThis.sessionStorage?.getItem(reloadKey)) return;
	globalThis.sessionStorage?.setItem(reloadKey, new Date().toISOString());
	globalThis.location?.reload();
}

async function preloadCollectionSet(
	collectionsToPreload: Collection<object>[],
): Promise<void> {
	await Promise.allSettled(
		collectionsToPreload.map((collection) => {
			const syncableCollection = collection as SyncableCollection;
			syncableCollection.startSyncImmediate?.();
			return collection.preload();
		}),
	);
}

/**
 * Preload collections for an organization by starting Electric sync.
 * Collections are lazy — they don't fetch data until subscribed or preloaded.
 * Call this eagerly so data is ready when the user switches orgs.
 */
export function getPreloadCollectionKeysForPathname(
	pathname?: string | null,
): PreloadableCollectionKey[] {
	return resolvePreloadCollectionKeys({ pathname });
}

export async function preloadCollections(
	organizationId: string,
	profile: CollectionPreloadProfile = {},
): Promise<void> {
	const collections = getCollections(organizationId);
	const collectionsToPreload = resolvePreloadCollectionKeys(profile).map(
		(key) => getPreloadableCollection(collections, key),
	);

	await preloadCollectionSet(collectionsToPreload);
	await reloadOnceAfterV2WorkspaceGraphRecovery(organizationId);
}

/**
 * Get collections for an organization, creating them if needed.
 * Collections are cached per org for instant switching.
 * Auth token is read dynamically via getAuthToken() - no need to pass it.
 */
export function getCollections(organizationId: string) {
	const cacheKey = getCollectionsCacheKey(organizationId);

	// Get or create org-specific collections
	if (!collectionsCache.has(cacheKey)) {
		collectionsCache.set(cacheKey, createOrgCollections(organizationId));
	}

	const orgCollections = collectionsCache.get(cacheKey);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return {
		...orgCollections,
		organizations: organizationsCollection,
	};
}

export type AppCollections = ReturnType<typeof getCollections>;

declare global {
	interface Window {
		__supersetCollectionsDebug?: {
			getActiveOrganizationId?: () => string | null;
			switchActiveOrganization?: (organizationId: string) => Promise<{
				requestedOrganizationId: string;
				activeOrganizationId: string | null;
			}>;
			getCollectionsStatusReport?: (
				organizationId?: string,
			) => CollectionsStatusReport | { error: string };
			getPreloadCollectionKeysForPathname?: (
				pathname?: string | null,
			) => PreloadableCollectionKey[];
			getV2WorkspaceGraphHealth?: (
				organizationId?: string,
			) => V2WorkspaceGraphHealthReport | { error: string };
			recoverPartialV2WorkspaceGraphCache?: (
				organizationId?: string,
			) => Promise<V2WorkspaceGraphRecoveryReport | { error: string }>;
		};
	}
}

function getDebugOrganizationId(organizationId?: string): string | null {
	if (organizationId) return organizationId;
	return globalThis.localStorage?.getItem("active_organization_id") ?? null;
}

function getDebugPathname(pathname?: string | null): string | null {
	if (pathname) return pathname;
	const hashPath = globalThis.location?.hash?.replace(/^#/, "") ?? "";
	if (hashPath.startsWith("/")) return hashPath;
	return globalThis.location?.pathname ?? null;
}

if (typeof window !== "undefined" && env.NODE_ENV === "development") {
	window.__supersetCollectionsDebug = {
		getCollectionsStatusReport: (organizationId?: string) => {
			const resolvedOrganizationId = getDebugOrganizationId(organizationId);
			if (!resolvedOrganizationId) {
				return { error: "No active organization id is available." };
			}
			return getCollectionsStatusReport(resolvedOrganizationId);
		},
		getPreloadCollectionKeysForPathname: (pathname?: string | null) =>
			getPreloadCollectionKeysForPathname(getDebugPathname(pathname)),
		getV2WorkspaceGraphHealth: (organizationId?: string) => {
			const resolvedOrganizationId = getDebugOrganizationId(organizationId);
			if (!resolvedOrganizationId) {
				return { error: "No active organization id is available." };
			}
			return getV2WorkspaceGraphHealth(resolvedOrganizationId);
		},
		recoverPartialV2WorkspaceGraphCache: async (organizationId?: string) => {
			const resolvedOrganizationId = getDebugOrganizationId(organizationId);
			if (!resolvedOrganizationId) {
				return { error: "No active organization id is available." };
			}
			return recoverPartialV2WorkspaceGraphCache(resolvedOrganizationId);
		},
	};
}
