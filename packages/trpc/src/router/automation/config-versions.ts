import { createHash } from "node:crypto";
import {
	type AutomationConfigSnapshot,
	automationCapabilities,
	automationConfigVersions,
	automations,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
	resolveBindableCapabilityVersions,
	setAutomationCapabilityBindingsInTx,
} from "../capability/bindings";
import type { AutomationDbExecutor } from "./helpers";

export type AutomationConfigVersionSource =
	| "human"
	| "agent"
	| "restore"
	| "import"
	| "system"
	| "control_chat";

export function computeAutomationConfigHash(
	snapshot: AutomationConfigSnapshot,
): string {
	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function snapshotAutomationConfig(
	tx: AutomationDbExecutor,
	automationId: string,
): Promise<AutomationConfigSnapshot> {
	const [automation] = await tx
		.select()
		.from(automations)
		.where(eq(automations.id, automationId))
		.limit(1);

	if (!automation) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation not found",
		});
	}

	const capabilityRows = await tx
		.select({
			capabilityId: automationCapabilities.capabilityId,
			capabilityVersionId: automationCapabilities.capabilityVersionId,
			enabled: automationCapabilities.enabled,
			config: automationCapabilities.config,
			displayOrder: automationCapabilities.displayOrder,
		})
		.from(automationCapabilities)
		.where(eq(automationCapabilities.automationId, automationId))
		.orderBy(automationCapabilities.displayOrder);

	return {
		name: automation.name,
		prompt: automation.prompt,
		agent: automation.agent,
		modelProviderId: automation.modelProviderId,
		modelId: automation.modelId,
		modelConfig: automation.modelConfig,
		targetHostId: automation.targetHostId,
		v2ProjectId: automation.v2ProjectId,
		v2WorkspaceId: automation.v2WorkspaceId,
		rrule: automation.rrule,
		dtstart: automation.dtstart.toISOString(),
		timezone: automation.timezone,
		enabled: automation.enabled,
		mcpScope: automation.mcpScope,
		nextRunAt: automation.nextRunAt.toISOString(),
		capabilities: capabilityRows.map((row) => ({
			capabilityId: row.capabilityId,
			capabilityVersionId: row.capabilityVersionId,
			enabled: row.enabled,
			config: row.config,
			displayOrder: row.displayOrder,
		})),
	};
}

export async function recordAutomationConfigVersion(
	tx: AutomationDbExecutor,
	params: {
		automationId: string;
		authorUserId: string | null;
		source: AutomationConfigVersionSource;
		summary?: string | null;
		previousVersionId?: string | null;
		restoredFromVersionId?: string | null;
		controlChatSessionId?: string | null;
		controlChatRunId?: string | null;
		sourceInstruction?: string | null;
	},
) {
	const snapshot = await snapshotAutomationConfig(tx, params.automationId);
	const snapshotHash = computeAutomationConfigHash(snapshot);

	const previousVersionId =
		params.previousVersionId === undefined
			? (
					await tx
						.select({ id: automationConfigVersions.id })
						.from(automationConfigVersions)
						.where(
							eq(automationConfigVersions.automationId, params.automationId),
						)
						.orderBy(desc(automationConfigVersions.createdAt))
						.limit(1)
				)[0]?.id
			: params.previousVersionId;

	const [version] = await tx
		.insert(automationConfigVersions)
		.values({
			automationId: params.automationId,
			authorUserId: params.authorUserId,
			source: params.source,
			snapshot,
			snapshotHash,
			summary: params.summary ?? null,
			previousVersionId: previousVersionId ?? null,
			restoredFromVersionId: params.restoredFromVersionId ?? null,
			controlChatSessionId: params.controlChatSessionId ?? null,
			controlChatRunId: params.controlChatRunId ?? null,
			sourceInstruction: params.sourceInstruction ?? null,
		})
		.returning();

	if (!version) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to record automation configuration version",
		});
	}

	return version;
}

export async function restoreAutomationConfigVersion(
	tx: AutomationDbExecutor,
	params: {
		versionId: string;
		organizationId: string;
		userId: string;
		controlChatSessionId?: string | null;
		controlChatRunId?: string | null;
		sourceInstruction?: string | null;
	},
) {
	const [version] = await tx
		.select({
			id: automationConfigVersions.id,
			automationId: automationConfigVersions.automationId,
			snapshot: automationConfigVersions.snapshot,
			organizationId: automations.organizationId,
			ownerUserId: automations.ownerUserId,
		})
		.from(automationConfigVersions)
		.innerJoin(
			automations,
			eq(automations.id, automationConfigVersions.automationId),
		)
		.where(eq(automationConfigVersions.id, params.versionId))
		.limit(1);

	if (
		!version ||
		version.organizationId !== params.organizationId ||
		version.ownerUserId !== params.userId
	) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation configuration version not found",
		});
	}

	const snapshot = version.snapshot;
	await tx
		.update(automations)
		.set({
			name: snapshot.name,
			prompt: snapshot.prompt,
			agent: snapshot.agent,
			modelProviderId: snapshot.modelProviderId,
			modelId: snapshot.modelId,
			modelConfig: snapshot.modelConfig,
			targetHostId: snapshot.targetHostId,
			v2ProjectId: snapshot.v2ProjectId,
			v2WorkspaceId: snapshot.v2WorkspaceId,
			rrule: snapshot.rrule,
			dtstart: new Date(snapshot.dtstart),
			timezone: snapshot.timezone,
			enabled: snapshot.enabled,
			mcpScope: snapshot.mcpScope,
			nextRunAt: new Date(snapshot.nextRunAt),
		})
		.where(eq(automations.id, version.automationId));

	const capabilityIdsByVersion = new Map(
		snapshot.capabilities.map((item) => [
			item.capabilityVersionId,
			item.capabilityId,
		]),
	);
	const resolvedCapabilityIds =
		capabilityIdsByVersion.size > 0
			? await resolveBindableCapabilityVersions({
					organizationId: params.organizationId,
					versionIds: [...capabilityIdsByVersion.keys()],
				})
			: new Map<string, string>();

	await setAutomationCapabilityBindingsInTx({
		tx,
		automationId: version.automationId,
		capabilities: snapshot.capabilities.map((item) => ({
			capabilityVersionId: item.capabilityVersionId,
			enabled: item.enabled,
			config: item.config,
			displayOrder: item.displayOrder,
		})),
		capabilityIdsByVersion: resolvedCapabilityIds,
	});

	return recordAutomationConfigVersion(tx, {
		automationId: version.automationId,
		authorUserId: params.userId,
		source: "restore",
		summary: "Restored automation configuration from version history.",
		restoredFromVersionId: version.id,
		controlChatSessionId: params.controlChatSessionId ?? null,
		controlChatRunId: params.controlChatRunId ?? null,
		sourceInstruction: params.sourceInstruction ?? null,
	});
}
