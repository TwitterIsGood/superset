import { db, dbWs } from "@superset/db/client";
import {
	automationCapabilities,
	automationConfigVersions,
	automationRuns,
	automations,
	capabilityPackages,
	capabilityPackageVersions,
	modelProviderModels,
	modelProviders,
	projectCapabilities,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
} from "@superset/db/schema";
import { describeSchedule, parseRrule } from "@superset/shared/rrule";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, getTableColumns, ilike } from "drizzle-orm";
import { env } from "../../env";
import {
	recordAutomationConfigVersion,
	restoreAutomationConfigVersion,
} from "../automation/config-versions";
import { startAutomationDispatch } from "../automation/dispatch";
import {
	computePromptHash,
	getAutomationForUser,
	recordPromptVersion,
} from "../automation/helpers";
import {
	capabilityArtifactPathname,
	storeCapabilityArtifact,
} from "../capability/artifact-storage";
import {
	auditValidatedCapabilityPackage,
	canActivateCapabilityVersion,
} from "../capability/audit";
import { resolveCapabilityAuditModel } from "../capability/audit-model";
import {
	resolveBindableCapabilityVersions,
	setAutomationCapabilityBindingsInTx,
} from "../capability/bindings";
import { listAutomationCapabilityBindings } from "../capability/capability";
import {
	bufferFromBase64Data,
	validateCapabilityZipPackage,
} from "../capability/package-validation";
import {
	buildGeneratedCliPackage,
	buildGeneratedSkillPackage,
} from "./package-builder";
import { type ControlChatToolName, controlChatToolSchemas } from "./schema";

export interface ControlChatToolContext {
	organizationId: string;
	userId: string;
	sessionId: string;
	runId: string;
	sourceInstruction: string;
}

export interface ControlChatToolResult {
	summary: string;
	output: Record<string, unknown>;
}

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function scheduleText(row: Pick<typeof automations.$inferSelect, "rrule">) {
	return describeSchedule(row.rrule);
}

function textMatches(haystack: string, needle: string) {
	return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

async function verifyHostAccess(args: {
	userId: string;
	organizationId: string;
	hostId: string;
	requireOnline?: boolean;
}) {
	const [host] = await db
		.select({
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
		})
		.from(v2Hosts)
		.where(
			and(
				eq(v2Hosts.organizationId, args.organizationId),
				eq(v2Hosts.machineId, args.hostId),
			),
		)
		.limit(1);

	if (!host) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Host not found" });
	}

	const [membership] = await db
		.select({ hostId: v2UsersHosts.hostId })
		.from(v2UsersHosts)
		.where(
			and(
				eq(v2UsersHosts.organizationId, args.organizationId),
				eq(v2UsersHosts.hostId, args.hostId),
				eq(v2UsersHosts.userId, args.userId),
			),
		)
		.limit(1);

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
		});
	}

	if (args.requireOnline && !host.isOnline) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Host "${host.name}" is offline.`,
		});
	}

	return host;
}

async function verifyProjectInOrg(organizationId: string, projectId: string) {
	const [project] = await db
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.organizationId, organizationId),
				eq(v2Projects.id, projectId),
			),
		)
		.limit(1);
	if (!project) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
}

async function validateAutomationModelSelection(args: {
	organizationId: string;
	modelProviderId?: string | null;
	modelId?: string | null;
}) {
	const hasProvider = Boolean(args.modelProviderId);
	const hasModel = Boolean(args.modelId);
	if (!hasProvider && !hasModel) {
		return { modelProviderId: null, modelId: null };
	}
	if (!hasProvider || !hasModel) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model provider and model are both required",
		});
	}

	const [row] = await db
		.select({
			providerId: modelProviders.id,
			modelId: modelProviderModels.modelId,
			providerEnabled: modelProviders.enabled,
			providerSecretEncrypted: modelProviders.secretEncrypted,
			modelEnabled: modelProviderModels.enabled,
		})
		.from(modelProviders)
		.innerJoin(
			modelProviderModels,
			eq(modelProviderModels.providerId, modelProviders.id),
		)
		.where(
			and(
				eq(modelProviders.id, args.modelProviderId ?? ""),
				eq(modelProviders.organizationId, args.organizationId),
				eq(modelProviderModels.modelId, args.modelId ?? ""),
			),
		)
		.limit(1);

	if (!row) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model is not configured for provider",
		});
	}
	if (
		!row.providerEnabled ||
		!row.providerSecretEncrypted ||
		!row.modelEnabled
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Selected model provider is not ready",
		});
	}

	return { modelProviderId: row.providerId, modelId: row.modelId };
}

async function importCapabilityPackageFromControlChat(args: {
	ctx: ControlChatToolContext;
	filename: string;
	fileData: string;
	sourceType: "zip" | "git" | "local_folder";
	sourceRef?: string;
	sourceSummary?: string;
}) {
	const pkg = validateCapabilityZipPackage(args.fileData);
	const auditModel = await resolveCapabilityAuditModel(args.ctx.organizationId);
	const audit = await auditValidatedCapabilityPackage({
		pkg,
		model: auditModel,
	});
	const archiveBuffer = bufferFromBase64Data(args.fileData);
	const displaySummary =
		pkg.validationSummary.display.summary ?? pkg.manifest.description ?? null;
	const pathname = capabilityArtifactPathname({
		organizationId: args.ctx.organizationId,
		slug: pkg.manifest.id,
		version: pkg.manifest.version,
		sha256: pkg.archiveSha256,
	});
	const artifact = await storeCapabilityArtifact({
		pathname,
		archiveBuffer,
	});

	try {
		const result = await dbWs.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(capabilityPackages)
				.where(
					and(
						eq(capabilityPackages.organizationId, args.ctx.organizationId),
						eq(capabilityPackages.slug, pkg.manifest.id),
					),
				)
				.limit(1);

			if (existing && existing.type !== pkg.manifest.type) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Package '${pkg.manifest.id}' already exists as ${existing.type}.`,
				});
			}

			const capability =
				existing ??
				(
					await tx
						.insert(capabilityPackages)
						.values({
							organizationId: args.ctx.organizationId,
							ownerUserId: args.ctx.userId,
							type: pkg.manifest.type,
							slug: pkg.manifest.id,
							name: pkg.manifest.name,
							description: displaySummary,
							status: audit.status === "passed" ? "active" : "disabled",
						})
						.returning()
				)[0];

			if (!capability) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create capability package.",
				});
			}

			const [duplicateVersion] = await tx
				.select({ id: capabilityPackageVersions.id })
				.from(capabilityPackageVersions)
				.where(
					and(
						eq(capabilityPackageVersions.capabilityId, capability.id),
						eq(capabilityPackageVersions.version, pkg.manifest.version),
					),
				)
				.limit(1);
			if (duplicateVersion) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Version ${pkg.manifest.version} already exists for ${pkg.manifest.id}.`,
				});
			}

			const [version] = await tx
				.insert(capabilityPackageVersions)
				.values({
					capabilityId: capability.id,
					version: pkg.manifest.version,
					manifest: pkg.manifest,
					artifactUrl: artifact.url,
					artifactPathname: artifact.pathname,
					artifactSha256: pkg.archiveSha256,
					artifactSizeBytes: pkg.archiveSizeBytes,
					sourceType: args.sourceType,
					sourceRef: args.sourceRef ?? args.filename,
					sourceInstruction: args.ctx.sourceInstruction,
					sourceSummary: args.sourceSummary ?? null,
					controlChatSessionId: args.ctx.sessionId,
					controlChatRunId: args.ctx.runId,
					validationSummary: pkg.validationSummary,
					auditStatus: audit.status,
					auditModelProviderId: audit.modelProviderId,
					auditModelId: audit.modelId,
					auditSummary: audit.summary,
					auditFindings: audit.findings,
					createdByUserId: args.ctx.userId,
				})
				.returning();

			if (!version) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create capability package version.",
				});
			}

			if (canActivateCapabilityVersion({ auditStatus: version.auditStatus })) {
				await tx
					.update(capabilityPackages)
					.set({
						name: pkg.manifest.name,
						description: displaySummary,
						currentVersionId: version.id,
						status: "active",
						updatedAt: new Date(),
					})
					.where(eq(capabilityPackages.id, capability.id));
			}

			return { capability, version };
		});

		return {
			...result,
			manifest: pkg.manifest,
			validationSummary: pkg.validationSummary,
			audit,
		};
	} catch (error) {
		await artifact.cleanup().catch((cleanupError) => {
			console.warn("[control-chat] failed to clean up orphaned artifact", {
				pathname: artifact.pathname,
				cleanupError,
			});
		});
		throw error;
	}
}

export async function executeControlChatTool(
	name: ControlChatToolName,
	rawInput: unknown,
	ctx: ControlChatToolContext,
): Promise<ControlChatToolResult> {
	switch (name) {
		case "automation.list": {
			const input = controlChatToolSchemas["automation.list"].parse(rawInput);
			const { prompt: _prompt, ...summaryCols } = getTableColumns(automations);
			const rows = await db
				.select(summaryCols)
				.from(automations)
				.where(
					and(
						eq(automations.organizationId, ctx.organizationId),
						input.query
							? ilike(automations.name, `%${escapeLikePattern(input.query)}%`)
							: undefined,
					),
				)
				.orderBy(desc(automations.updatedAt));
			const result = rows.map((row) => ({
				...row,
				scheduleText: scheduleText(row),
			}));
			return {
				summary: `Found ${result.length} automation${result.length === 1 ? "" : "s"}.`,
				output: { automations: result },
			};
		}
		case "automation.get": {
			const input = controlChatToolSchemas["automation.get"].parse(rawInput);
			const automation = await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.id,
			);
			return {
				summary: `Loaded automation "${automation.name}".`,
				output: {
					automation: {
						...automation,
						scheduleText: scheduleText(automation),
					},
					capabilities: await listAutomationCapabilityBindings(input.id),
				},
			};
		}
		case "automation.create": {
			const input = controlChatToolSchemas["automation.create"].parse(rawInput);
			if (input.targetHostId) {
				await verifyHostAccess({
					userId: ctx.userId,
					organizationId: ctx.organizationId,
					hostId: input.targetHostId,
				});
			}
			if (input.v2ProjectId) {
				await verifyProjectInOrg(ctx.organizationId, input.v2ProjectId);
			}
			const modelSelection = await validateAutomationModelSelection({
				organizationId: ctx.organizationId,
				modelProviderId: input.modelProviderId,
				modelId: input.modelId,
			});
			const capabilityIdsByVersion = await resolveBindableCapabilityVersions({
				organizationId: ctx.organizationId,
				versionIds: input.capabilities.map((item) => item.capabilityVersionId),
			});
			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});
			const created = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.insert(automations)
					.values({
						organizationId: ctx.organizationId,
						ownerUserId: ctx.userId,
						name: input.name,
						prompt: input.prompt,
						agent: input.agent,
						modelProviderId: modelSelection.modelProviderId,
						modelId: modelSelection.modelId,
						modelConfig: input.modelConfig ?? {},
						targetHostId: input.targetHostId ?? null,
						v2ProjectId: input.v2ProjectId ?? null,
						v2WorkspaceId: null,
						rrule: input.rrule,
						dtstart,
						timezone: input.timezone,
						mcpScope: input.mcpScope,
						nextRunAt,
					})
					.returning();
				if (!row) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create automation",
					});
				}
				await recordPromptVersion(tx, {
					automationId: row.id,
					authorUserId: ctx.userId,
					content: input.prompt,
					source: "agent",
				});
				await setAutomationCapabilityBindingsInTx({
					tx,
					automationId: row.id,
					capabilities: input.capabilities,
					capabilityIdsByVersion,
				});
				const version = await recordAutomationConfigVersion(tx, {
					automationId: row.id,
					authorUserId: ctx.userId,
					source: "control_chat",
					summary: "Created by Control Chat.",
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					sourceInstruction: ctx.sourceInstruction,
				});
				return { row, version };
			});
			return {
				summary: `Created automation "${created.row.name}".`,
				output: {
					automation: {
						...created.row,
						scheduleText: scheduleText(created.row),
					},
					version: created.version,
				},
			};
		}
		case "automation.update": {
			const input = controlChatToolSchemas["automation.update"].parse(rawInput);
			const existing = await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.id,
			);
			if (
				input.expectedUpdatedAt &&
				existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Automation changed since this chat turn started.",
				});
			}
			if (input.targetHostId) {
				await verifyHostAccess({
					userId: ctx.userId,
					organizationId: ctx.organizationId,
					hostId: input.targetHostId,
				});
			}
			if (input.v2ProjectId) {
				await verifyProjectInOrg(ctx.organizationId, input.v2ProjectId);
			}
			const nextModelProviderId =
				input.modelProviderId === undefined
					? existing.modelProviderId
					: input.modelProviderId;
			const nextModelId =
				input.modelId === undefined ? existing.modelId : input.modelId;
			const modelSelection = await validateAutomationModelSelection({
				organizationId: ctx.organizationId,
				modelProviderId: nextModelProviderId,
				modelId: nextModelId,
			});
			const capabilityIdsByVersion =
				input.capabilities === undefined
					? null
					: await resolveBindableCapabilityVersions({
							organizationId: ctx.organizationId,
							versionIds: input.capabilities.map(
								(item) => item.capabilityVersionId,
							),
						});
			const nextRrule = input.rrule ?? existing.rrule;
			const nextDtstart = input.dtstart ?? existing.dtstart;
			const nextTimezone = input.timezone ?? existing.timezone;
			const recurrenceChanged =
				input.rrule !== undefined ||
				input.dtstart !== undefined ||
				input.timezone !== undefined;
			const nextRunAt = recurrenceChanged
				? parseRrule({
						rrule: nextRrule,
						dtstart: nextDtstart,
						timezone: nextTimezone,
					}).nextRunAt
				: existing.nextRunAt;

			const updated = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(automations)
					.set({
						name: input.name ?? existing.name,
						prompt: input.prompt ?? existing.prompt,
						agent: input.agent ?? existing.agent,
						modelProviderId: modelSelection.modelProviderId,
						modelId: modelSelection.modelId,
						modelConfig: input.modelConfig ?? existing.modelConfig,
						targetHostId:
							input.targetHostId === undefined
								? existing.targetHostId
								: input.targetHostId,
						v2ProjectId:
							input.v2ProjectId === undefined
								? existing.v2ProjectId
								: input.v2ProjectId,
						v2WorkspaceId:
							input.v2ProjectId === undefined ? existing.v2WorkspaceId : null,
						rrule: nextRrule,
						dtstart: nextDtstart,
						timezone: nextTimezone,
						mcpScope: input.mcpScope ?? existing.mcpScope,
						nextRunAt,
					})
					.where(eq(automations.id, input.id))
					.returning();
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Automation not found",
					});
				}
				if (input.prompt !== undefined && input.prompt !== existing.prompt) {
					await recordPromptVersion(tx, {
						automationId: input.id,
						authorUserId: ctx.userId,
						content: input.prompt,
						source: "agent",
					});
				}
				if (input.capabilities !== undefined && capabilityIdsByVersion) {
					await setAutomationCapabilityBindingsInTx({
						tx,
						automationId: input.id,
						capabilities: input.capabilities,
						capabilityIdsByVersion,
					});
				}
				const version = await recordAutomationConfigVersion(tx, {
					automationId: input.id,
					authorUserId: ctx.userId,
					source: "control_chat",
					summary: "Updated by Control Chat.",
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					sourceInstruction: ctx.sourceInstruction,
				});
				return { row, version };
			});
			return {
				summary: `Updated automation "${updated.row.name}".`,
				output: {
					automation: {
						...updated.row,
						scheduleText: scheduleText(updated.row),
					},
					version: updated.version,
				},
			};
		}
		case "automation.pause":
		case "automation.resume": {
			const input = controlChatToolSchemas["automation.pause"].parse(rawInput);
			const automation = await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.id,
			);
			const enabled = name === "automation.resume";
			const patch: { enabled: boolean; nextRunAt?: Date } = { enabled };
			if (enabled && !automation.enabled) {
				patch.nextRunAt = parseRrule({
					rrule: automation.rrule,
					dtstart: automation.dtstart,
					timezone: automation.timezone,
					after: new Date(),
				}).nextRunAt;
			}
			const updated = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(automations)
					.set(patch)
					.where(eq(automations.id, input.id))
					.returning();
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Automation not found",
					});
				}
				const version = await recordAutomationConfigVersion(tx, {
					automationId: input.id,
					authorUserId: ctx.userId,
					source: "control_chat",
					summary: enabled
						? "Resumed by Control Chat."
						: "Paused by Control Chat.",
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					sourceInstruction: ctx.sourceInstruction,
				});
				return { row, version };
			});
			return {
				summary: `${enabled ? "Resumed" : "Paused"} automation "${updated.row.name}".`,
				output: {
					automation: updated.row,
					version: updated.version,
				},
			};
		}
		case "automation.run": {
			const input = controlChatToolSchemas["automation.run"].parse(rawInput);
			const automation = await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.id,
			);
			const outcome = await startAutomationDispatch({
				automation,
				scheduledFor: new Date(),
				relayUrl: env.RELAY_URL,
				apiUrl: env.NEXT_PUBLIC_API_URL,
				source: "manual",
			});
			if (outcome.status === "conflict") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A run for this automation is already in progress.",
				});
			}
			return {
				summary: `Triggered automation "${automation.name}".`,
				output: { outcome },
			};
		}
		case "automation.logs": {
			const input = controlChatToolSchemas["automation.logs"].parse(rawInput);
			await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.automationId,
			);
			const runs = await db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.automationId, input.automationId))
				.orderBy(desc(automationRuns.createdAt))
				.limit(input.limit);
			return {
				summary: `Loaded ${runs.length} automation run${runs.length === 1 ? "" : "s"}.`,
				output: { runs },
			};
		}
		case "automation.versions.list": {
			const input =
				controlChatToolSchemas["automation.versions.list"].parse(rawInput);
			await getAutomationForUser(
				ctx.userId,
				ctx.organizationId,
				input.automationId,
			);
			const versions = await db
				.select()
				.from(automationConfigVersions)
				.where(eq(automationConfigVersions.automationId, input.automationId))
				.orderBy(desc(automationConfigVersions.createdAt))
				.limit(input.limit);
			return {
				summary: `Loaded ${versions.length} automation config version${versions.length === 1 ? "" : "s"}.`,
				output: { versions },
			};
		}
		case "automation.versions.restore": {
			const input =
				controlChatToolSchemas["automation.versions.restore"].parse(rawInput);
			const version = await dbWs.transaction((tx) =>
				restoreAutomationConfigVersion(tx, {
					versionId: input.versionId,
					organizationId: ctx.organizationId,
					userId: ctx.userId,
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					sourceInstruction: ctx.sourceInstruction,
				}),
			);
			return {
				summary: "Restored automation configuration from version history.",
				output: { version },
			};
		}
		case "capability.list": {
			const input = controlChatToolSchemas["capability.list"].parse(rawInput);
			const rows = await db
				.select({
					id: capabilityPackages.id,
					type: capabilityPackages.type,
					slug: capabilityPackages.slug,
					name: capabilityPackages.name,
					description: capabilityPackages.description,
					status: capabilityPackages.status,
					currentVersionId: capabilityPackages.currentVersionId,
					currentVersion: capabilityPackageVersions.version,
					auditStatus: capabilityPackageVersions.auditStatus,
					auditSummary: capabilityPackageVersions.auditSummary,
					artifactSha256: capabilityPackageVersions.artifactSha256,
					createdAt: capabilityPackages.createdAt,
					updatedAt: capabilityPackages.updatedAt,
				})
				.from(capabilityPackages)
				.leftJoin(
					capabilityPackageVersions,
					eq(capabilityPackageVersions.id, capabilityPackages.currentVersionId),
				)
				.where(
					and(
						eq(capabilityPackages.organizationId, ctx.organizationId),
						input.type ? eq(capabilityPackages.type, input.type) : undefined,
					),
				)
				.orderBy(desc(capabilityPackages.updatedAt));
			const rowsFiltered = input.query
				? rows.filter((row) =>
						[row.name, row.slug, row.description ?? ""]
							.join(" ")
							.toLowerCase()
							.includes(input.query?.toLowerCase() ?? ""),
					)
				: rows;
			return {
				summary: `Found ${rowsFiltered.length} capability package${rowsFiltered.length === 1 ? "" : "s"}.`,
				output: { capabilities: rowsFiltered },
			};
		}
		case "capability.get":
		case "capability.versions.list": {
			const input = controlChatToolSchemas["capability.get"].parse(rawInput);
			const [capability] = await db
				.select()
				.from(capabilityPackages)
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, ctx.organizationId),
					),
				)
				.limit(1);
			if (!capability) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Capability package not found",
				});
			}
			const versions = await db
				.select()
				.from(capabilityPackageVersions)
				.where(eq(capabilityPackageVersions.capabilityId, input.id))
				.orderBy(desc(capabilityPackageVersions.createdAt));
			return {
				summary:
					name === "capability.get"
						? `Loaded capability "${capability.name}".`
						: `Loaded ${versions.length} capability version${versions.length === 1 ? "" : "s"}.`,
				output:
					name === "capability.get" ? { capability, versions } : { versions },
			};
		}
		case "capability.importPackage": {
			const input =
				controlChatToolSchemas["capability.importPackage"].parse(rawInput);
			const result = await importCapabilityPackageFromControlChat({
				ctx,
				filename: input.filename,
				fileData: input.fileData,
				sourceType: input.sourceType,
				sourceRef: input.sourceRef,
			});
			return {
				summary: `Imported ${result.manifest.name} ${result.manifest.version}.`,
				output: result,
			};
		}
		case "capability.setStatus": {
			const input =
				controlChatToolSchemas["capability.setStatus"].parse(rawInput);
			const [updated] = await dbWs
				.update(capabilityPackages)
				.set({ status: input.status, updatedAt: new Date() })
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, ctx.organizationId),
					),
				)
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Capability package not found",
				});
			}
			return {
				summary: `${input.status === "active" ? "Enabled" : "Disabled"} capability "${updated.name}".`,
				output: { capability: updated },
			};
		}
		case "capability.delete": {
			const input = controlChatToolSchemas["capability.delete"].parse(rawInput);
			const [capability] = await db
				.select()
				.from(capabilityPackages)
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, ctx.organizationId),
					),
				)
				.limit(1);
			if (!capability) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Capability package not found",
				});
			}
			const [projectUsage] = await db
				.select({ capabilityId: projectCapabilities.capabilityId })
				.from(projectCapabilities)
				.where(eq(projectCapabilities.capabilityId, input.id))
				.limit(1);
			const [automationUsage] = await db
				.select({ capabilityId: capabilityPackages.id })
				.from(capabilityPackages)
				.innerJoin(
					automationCapabilities,
					eq(automationCapabilities.capabilityId, capabilityPackages.id),
				)
				.where(eq(capabilityPackages.id, input.id))
				.limit(1);
			if (projectUsage || automationUsage) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Capability package is still used by projects or automations.",
				});
			}
			await dbWs
				.delete(capabilityPackages)
				.where(eq(capabilityPackages.id, input.id));
			return {
				summary: `Deleted capability "${capability.name}".`,
				output: { ok: true },
			};
		}
		case "capability.versions.restore": {
			const input =
				controlChatToolSchemas["capability.versions.restore"].parse(rawInput);
			const [row] = await db
				.select({
					capability: capabilityPackages,
					version: capabilityPackageVersions,
				})
				.from(capabilityPackages)
				.innerJoin(
					capabilityPackageVersions,
					eq(capabilityPackageVersions.capabilityId, capabilityPackages.id),
				)
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, ctx.organizationId),
						eq(capabilityPackageVersions.id, input.versionId),
					),
				)
				.limit(1);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Capability version not found",
				});
			}
			if (
				!canActivateCapabilityVersion({
					auditStatus: row.version.auditStatus,
				})
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only versions that passed security audit can be activated.",
				});
			}
			const [updated] = await dbWs
				.update(capabilityPackages)
				.set({
					currentVersionId: row.version.id,
					status: "active",
					updatedAt: new Date(),
				})
				.where(eq(capabilityPackages.id, input.id))
				.returning();
			return {
				summary: `Restored capability "${row.capability.name}" to ${row.version.version}.`,
				output: { capability: updated, version: row.version },
			};
		}
		case "capability.generateSkillPackage": {
			const input =
				controlChatToolSchemas["capability.generateSkillPackage"].parse(
					rawInput,
				);
			const generated = buildGeneratedSkillPackage(input);
			const result = await importCapabilityPackageFromControlChat({
				ctx,
				filename: generated.filename,
				fileData: generated.fileData,
				sourceType: "zip",
				sourceRef: generated.sourceRef,
				sourceSummary: generated.summary,
			});
			return {
				summary: `Generated and imported Skill "${result.manifest.name}".`,
				output: result,
			};
		}
		case "capability.generateCliPackage": {
			const input =
				controlChatToolSchemas["capability.generateCliPackage"].parse(rawInput);
			const generated = buildGeneratedCliPackage(input);
			const result = await importCapabilityPackageFromControlChat({
				ctx,
				filename: generated.filename,
				fileData: generated.fileData,
				sourceType: "zip",
				sourceRef: generated.sourceRef,
				sourceSummary: generated.summary,
			});
			return {
				summary: `Generated and imported CLI "${result.manifest.name}".`,
				output: result,
			};
		}
	}
}

export function findNamedAutomation(
	automationsList: { id: string; name: string }[],
	message: string,
) {
	const quoted = message.match(/["“”']([^"“”']{2,200})["“”']/)?.[1];
	const candidate = quoted?.trim() || message;
	return (
		automationsList.find((automation) =>
			textMatches(candidate, automation.name),
		) ??
		automationsList.find((automation) =>
			textMatches(message, automation.name),
		) ??
		null
	);
}

export function findNamedCapability(
	capabilities: { id: string; name: string; slug: string }[],
	message: string,
) {
	const quoted = message.match(/["“”']([^"“”']{2,200})["“”']/)?.[1];
	const candidate = quoted?.trim() || message;
	return (
		capabilities.find(
			(capability) =>
				textMatches(candidate, capability.name) ||
				textMatches(candidate, capability.slug),
		) ??
		capabilities.find(
			(capability) =>
				textMatches(message, capability.name) ||
				textMatches(message, capability.slug),
		) ??
		null
	);
}

export function titleFromMessage(message: string): string {
	const normalized = message.replace(/\s+/g, " ").trim();
	if (normalized.length <= 64) return normalized || "Control Chat";
	return `${normalized.slice(0, 61).trimEnd()}...`;
}

export function hashInstruction(instruction: string): string {
	return computePromptHash(instruction);
}
