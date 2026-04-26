import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
	SelectOrganization as CloudOrganization,
	SelectTask as CloudTask,
	SelectTaskStatus as CloudTaskStatus,
	SelectUser as CloudUser,
} from "@superset/db/schema";
import {
	organizationMembers,
	organizations,
	type SelectOrganization,
	type SelectTaskStatus,
	type SelectUser,
	type TaskStatusType,
	taskStatuses,
	tasks,
	users,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { MOCK_ORG_ID } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	DEFAULT_LOCAL_TASK_STATUSES,
	mapTaskRow,
	mapTaskStatusRow,
	nextLocalTaskSlug,
} from "./helpers";

export const LOCAL_USER_ID = "local-user-id";
const LOCAL_MEMBER_ID = "local-member-id";

const taskPrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);
const localCollectionSchema = z.enum([
	"tasks",
	"taskStatuses",
	"users",
	"organizations",
	"integrationConnections",
]);

type LocalCollection = z.infer<typeof localCollectionSchema>;

type LocalTasksEvent = {
	collection: LocalCollection;
	type: "reload";
};

const events = new EventEmitter();

function emitReload(collection: LocalCollection): void {
	events.emit(collection, {
		collection,
		type: "reload",
	} satisfies LocalTasksEvent);
}

function nowIso(): string {
	return new Date().toISOString();
}

function createTxid(): string {
	return `local-${Date.now()}-${randomUUID()}`;
}

function localStatusId(organizationId: string, type: TaskStatusType): string {
	return `${organizationId}-task-status-${type}`;
}

function sortStatuses<T extends { position: number; type: string }>(
	rows: T[],
): T[] {
	return [...rows].sort((left, right) => {
		if (left.position !== right.position) return left.position - right.position;
		return left.type.localeCompare(right.type);
	});
}

function mapUserRow(row: SelectUser): CloudUser {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: false,
		image: row.avatar_url,
		organizationIds: [MOCK_ORG_ID],
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

function mapOrganizationRow(row: SelectOrganization): CloudOrganization {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		logo: row.avatar_url,
		createdAt: new Date(row.created_at),
		metadata: null,
		stripeCustomerId: null,
		allowedDomains: [],
	};
}

function ensureLocalIdentity(): void {
	const timestamp = nowIso();

	localDb
		.insert(organizations)
		.values({
			id: MOCK_ORG_ID,
			clerk_org_id: null,
			name: "Local Workspace",
			slug: "local-workspace",
			github_org: null,
			avatar_url: null,
			created_at: timestamp,
			updated_at: timestamp,
		})
		.onConflictDoNothing()
		.run();

	localDb
		.insert(users)
		.values({
			id: LOCAL_USER_ID,
			clerk_id: LOCAL_USER_ID,
			name: "Local User",
			email: "local@superset.local",
			avatar_url: null,
			deleted_at: null,
			created_at: timestamp,
			updated_at: timestamp,
		})
		.onConflictDoNothing()
		.run();

	localDb
		.insert(organizationMembers)
		.values({
			id: LOCAL_MEMBER_ID,
			organization_id: MOCK_ORG_ID,
			user_id: LOCAL_USER_ID,
			role: "owner",
			created_at: timestamp,
		})
		.onConflictDoNothing()
		.run();
}

function ensureDefaultStatuses(
	organizationId = MOCK_ORG_ID,
): CloudTaskStatus[] {
	ensureLocalIdentity();
	const timestamp = nowIso();

	for (const status of DEFAULT_LOCAL_TASK_STATUSES) {
		const existing = localDb
			.select()
			.from(taskStatuses)
			.where(
				and(
					eq(taskStatuses.organization_id, organizationId),
					eq(taskStatuses.type, status.type),
					isNull(taskStatuses.external_provider),
				),
			)
			.get();

		if (existing) continue;

		localDb
			.insert(taskStatuses)
			.values({
				id: localStatusId(organizationId, status.type),
				organization_id: organizationId,
				name: status.name,
				color: status.color,
				type: status.type,
				position: status.position,
				progress_percent: status.progressPercent,
				external_provider: null,
				external_id: null,
				created_at: timestamp,
				updated_at: timestamp,
			})
			.onConflictDoNothing()
			.run();
	}

	return listTaskStatuses(organizationId);
}

function listTaskStatuses(organizationId = MOCK_ORG_ID): CloudTaskStatus[] {
	ensureLocalIdentity();
	const rows = localDb
		.select()
		.from(taskStatuses)
		.where(eq(taskStatuses.organization_id, organizationId))
		.all();

	return sortStatuses(rows).map(mapTaskStatusRow);
}

function listTasks(organizationId = MOCK_ORG_ID): CloudTask[] {
	ensureLocalIdentity();
	const rows = localDb
		.select()
		.from(tasks)
		.where(
			and(eq(tasks.organization_id, organizationId), isNull(tasks.deleted_at)),
		)
		.orderBy(desc(tasks.created_at))
		.all();

	return rows.map(mapTaskRow);
}

function listUsers(): CloudUser[] {
	ensureLocalIdentity();
	return localDb.select().from(users).all().map(mapUserRow);
}

function listOrganizations(): CloudOrganization[] {
	ensureLocalIdentity();
	return localDb.select().from(organizations).all().map(mapOrganizationRow);
}

function getStatusOrThrow(
	statusId: string,
	organizationId: string,
): SelectTaskStatus {
	const status = localDb
		.select()
		.from(taskStatuses)
		.where(
			and(
				eq(taskStatuses.id, statusId),
				eq(taskStatuses.organization_id, organizationId),
			),
		)
		.get();

	if (!status) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Task status not found",
		});
	}

	return status;
}

function byId(id: string): CloudTask | null {
	const row = localDb
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
		.get();

	return row ? mapTaskRow(row) : null;
}

function bySlug(slug: string): CloudTask | null {
	const row = localDb
		.select()
		.from(tasks)
		.where(and(eq(tasks.slug, slug), isNull(tasks.deleted_at)))
		.get();

	return row ? mapTaskRow(row) : null;
}

const createTaskInputSchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	statusId: z.string().nullable().optional(),
	priority: taskPrioritySchema.optional(),
	assigneeId: z.string().nullable().optional(),
});

const updateTaskInputSchema = z.object({
	id: z.string(),
	changes: z.object({
		title: z.string().optional(),
		description: z.string().nullable().optional(),
		statusId: z.string().nullable().optional(),
		priority: taskPrioritySchema.optional(),
		assigneeId: z.string().nullable().optional(),
		assigneeExternalId: z.string().nullable().optional(),
		assigneeDisplayName: z.string().nullable().optional(),
		assigneeAvatarUrl: z.string().nullable().optional(),
		estimate: z.number().int().nullable().optional(),
		dueDate: z.date().nullable().optional(),
		labels: z.array(z.string()).optional(),
		branch: z.string().nullable().optional(),
		prUrl: z.string().nullable().optional(),
		startedAt: z.date().nullable().optional(),
		completedAt: z.date().nullable().optional(),
	}),
});

function createTask(input: z.infer<typeof createTaskInputSchema>) {
	ensureLocalIdentity();
	const statuses = ensureDefaultStatuses(MOCK_ORG_ID);
	const selectedStatus = input.statusId
		? getStatusOrThrow(input.statusId, MOCK_ORG_ID)
		: getStatusOrThrow(
				statuses.find((status) => status.type === "backlog")?.id ??
					statuses[0].id,
				MOCK_ORG_ID,
			);
	const timestamp = nowIso();
	const existingSlugs = localDb
		.select({ slug: tasks.slug })
		.from(tasks)
		.where(
			and(eq(tasks.organization_id, MOCK_ORG_ID), isNull(tasks.deleted_at)),
		)
		.all()
		.map((row) => row.slug);
	const slug = nextLocalTaskSlug(existingSlugs);

	const inserted = localDb
		.insert(tasks)
		.values({
			id: randomUUID(),
			slug,
			title: input.title.trim(),
			description: input.description ?? null,
			status: selectedStatus.name,
			status_color: selectedStatus.color,
			status_type: selectedStatus.type,
			status_position: Math.trunc(selectedStatus.position),
			status_id: selectedStatus.id,
			priority: input.priority ?? "none",
			organization_id: MOCK_ORG_ID,
			repository_id: null,
			assignee_id: input.assigneeId ?? null,
			assignee_external_id: null,
			assignee_display_name: null,
			assignee_avatar_url: null,
			creator_id: LOCAL_USER_ID,
			estimate: null,
			due_date: null,
			labels: [],
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
			created_at: timestamp,
			updated_at: timestamp,
		})
		.returning()
		.get();

	emitReload("tasks");
	return { task: mapTaskRow(inserted), txid: createTxid() };
}

function updateTask(input: z.infer<typeof updateTaskInputSchema>) {
	const existing = localDb
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, input.id), isNull(tasks.deleted_at)))
		.get();

	if (!existing) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
	}

	const changes: Partial<typeof tasks.$inferInsert> = {
		updated_at: nowIso(),
	};

	if ("title" in input.changes) changes.title = input.changes.title;
	if ("description" in input.changes) {
		changes.description = input.changes.description ?? null;
	}
	if ("priority" in input.changes) changes.priority = input.changes.priority;
	if ("assigneeId" in input.changes) {
		changes.assignee_id = input.changes.assigneeId ?? null;
	}
	if ("assigneeExternalId" in input.changes) {
		changes.assignee_external_id = input.changes.assigneeExternalId ?? null;
	}
	if ("assigneeDisplayName" in input.changes) {
		changes.assignee_display_name = input.changes.assigneeDisplayName ?? null;
	}
	if ("assigneeAvatarUrl" in input.changes) {
		changes.assignee_avatar_url = input.changes.assigneeAvatarUrl ?? null;
	}
	if ("estimate" in input.changes)
		changes.estimate = input.changes.estimate ?? null;
	if ("dueDate" in input.changes) {
		changes.due_date = input.changes.dueDate?.toISOString() ?? null;
	}
	if ("labels" in input.changes) changes.labels = input.changes.labels ?? [];
	if ("branch" in input.changes) changes.branch = input.changes.branch ?? null;
	if ("prUrl" in input.changes) changes.pr_url = input.changes.prUrl ?? null;
	if ("startedAt" in input.changes) {
		changes.started_at = input.changes.startedAt?.toISOString() ?? null;
	}
	if ("completedAt" in input.changes) {
		changes.completed_at = input.changes.completedAt?.toISOString() ?? null;
	}

	if (input.changes.statusId) {
		const status = getStatusOrThrow(
			input.changes.statusId,
			existing.organization_id,
		);
		changes.status_id = status.id;
		changes.status = status.name;
		changes.status_color = status.color;
		changes.status_type = status.type;
		changes.status_position = Math.trunc(status.position);
	}

	const updated = localDb
		.update(tasks)
		.set(changes)
		.where(eq(tasks.id, input.id))
		.returning()
		.get();

	emitReload("tasks");
	return { task: mapTaskRow(updated), txid: createTxid() };
}

function deleteTask(id: string): { txid: string } {
	const existing = localDb
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), isNull(tasks.deleted_at)))
		.get();

	if (!existing) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
	}

	const timestamp = nowIso();
	localDb
		.update(tasks)
		.set({ deleted_at: timestamp, updated_at: timestamp })
		.where(eq(tasks.id, id))
		.run();

	emitReload("tasks");
	return { txid: createTxid() };
}

export const createTasksLocalRouter = () => {
	return router({
		health: publicProcedure.query(() => ({ mode: "local" as const })),
		listTasks: publicProcedure
			.input(z.object({ organizationId: z.string().optional() }).optional())
			.query(({ input }) => listTasks(input?.organizationId ?? MOCK_ORG_ID)),
		listTaskStatuses: publicProcedure
			.input(z.object({ organizationId: z.string().optional() }).optional())
			.query(({ input }) =>
				listTaskStatuses(input?.organizationId ?? MOCK_ORG_ID),
			),
		listUsers: publicProcedure
			.input(z.object({ organizationId: z.string().optional() }).optional())
			.query(() => listUsers()),
		listOrganizations: publicProcedure.query(() => listOrganizations()),
		listIntegrationConnections: publicProcedure
			.input(z.object({ organizationId: z.string().optional() }).optional())
			.query(() => []),
		ensureDefaultStatuses: publicProcedure
			.input(z.object({ organizationId: z.string().optional() }).optional())
			.mutation(({ input }) => {
				const result = ensureDefaultStatuses(
					input?.organizationId ?? MOCK_ORG_ID,
				);
				emitReload("taskStatuses");
				emitReload("users");
				emitReload("organizations");
				return result;
			}),
		createFromUi: publicProcedure
			.input(createTaskInputSchema)
			.mutation(({ input }) => createTask(input)),
		byId: publicProcedure.input(z.string()).query(({ input }) => byId(input)),
		bySlug: publicProcedure
			.input(z.string())
			.query(({ input }) => bySlug(input)),
		update: publicProcedure
			.input(updateTaskInputSchema)
			.mutation(({ input }) => updateTask(input)),
		delete: publicProcedure
			.input(z.string())
			.mutation(({ input }) => deleteTask(input)),
		subscribe: publicProcedure
			.input(
				z.object({
					organizationId: z.string().optional(),
					collection: localCollectionSchema,
				}),
			)
			.subscription(({ input }) => {
				return observable<LocalTasksEvent>((emit) => {
					const handler = (event: LocalTasksEvent) => emit.next(event);
					events.on(input.collection, handler);
					return () => {
						events.off(input.collection, handler);
					};
				});
			}),
	});
};

export type TasksLocalRouter = ReturnType<typeof createTasksLocalRouter>;
