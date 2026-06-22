import { randomUUID } from "node:crypto";
import { db, dbWs } from "../../../packages/db/src/client";
import {
	automationConfigVersions,
	automations,
	capabilityPackages,
	capabilityPackageVersions,
	controlChatRuns,
	controlChatSessions,
} from "../../../packages/db/src/schema";
import { and, desc, eq, inArray } from "../../../packages/db/node_modules/drizzle-orm";
import {
	type ControlChatToolContext,
	executeControlChatTool,
} from "../../../packages/trpc/src/router/control-chat/tools";
import { buildGeneratedSkillPackage } from "../../../packages/trpc/src/router/control-chat/package-builder";
import type { ControlChatToolName } from "../../../packages/trpc/src/router/control-chat/schema";

type JsonRecord = Record<string, unknown>;

interface MatrixEntry {
	name: string;
	status: "pass" | "expected-error" | "fail";
	summary: string;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function asRecord(value: unknown, label: string): JsonRecord {
	assert(value && typeof value === "object", `${label} must be an object`);
	return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
	assert(typeof value === "string" && value.length > 0, `${label} must be a string`);
	return value;
}

function asDate(value: unknown, label: string): Date {
	assert(value instanceof Date, `${label} must be a Date`);
	return value;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
	if (error && typeof error === "object" && "code" in error) {
		return String((error as { code?: unknown }).code);
	}
	return null;
}

async function main() {
	const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
	const entries: MatrixEntry[] = [];
	const createdAutomationIds: string[] = [];
	const createdCapabilityIds: string[] = [];
	let validationRunId: string | null = null;

	const [session] = await db
		.select({
			sessionId: controlChatSessions.id,
			organizationId: controlChatSessions.organizationId,
			userId: controlChatSessions.ownerUserId,
		})
		.from(controlChatSessions)
		.orderBy(desc(controlChatSessions.lastActiveAt))
		.limit(1);

	assert(session, "No Control Chat session exists to use as validation context.");

	const [run] = await dbWs
		.insert(controlChatRuns)
		.values({
			sessionId: session.sessionId,
			organizationId: session.organizationId,
			startedByUserId: session.userId,
			status: "completed",
			permissionMode: "bypassPermissions",
			context: { validation: "control-chat-tool-matrix" },
			startedAt: new Date(),
			completedAt: new Date(),
		})
		.returning({ id: controlChatRuns.id });

	assert(run, "Failed to create validation Control Chat run.");
	validationRunId = run.id;

	const ctx: ControlChatToolContext = {
		organizationId: session.organizationId,
		userId: session.userId,
		sessionId: session.sessionId,
		runId: run.id,
		sourceInstruction: "Control Chat automation/capability matrix validation",
	};

	async function callTool(name: ControlChatToolName, input: unknown) {
		const result = await executeControlChatTool(name, input, ctx);
		entries.push({
			name,
			status: "pass",
			summary: result.summary,
		});
		return result;
	}

	async function expectToolError(
		name: ControlChatToolName,
		input: unknown,
		expectedCode: string,
	) {
		try {
			await executeControlChatTool(name, input, ctx);
		} catch (error) {
			const actualCode = errorCode(error);
			assert(
				actualCode === expectedCode,
				`${name} expected ${expectedCode}, got ${actualCode ?? "unknown"}: ${errorMessage(error)}`,
			);
			entries.push({
				name,
				status: "expected-error",
				summary: `${expectedCode}: ${errorMessage(error)}`,
			});
			return;
		}
		throw new Error(`${name} expected ${expectedCode}, but succeeded.`);
	}

	try {
		const manualCapabilityName = `Matrix Passed Skill ${suffix}`;
		const manualCapabilitySlug = `matrix-passed-skill-${suffix}`;
		const manualManifest = {
			manifestVersion: 1,
			id: manualCapabilitySlug,
			type: "skill",
			name: manualCapabilityName,
			version: "0.1.0",
			description: "Disposable passed package for Control Chat matrix validation.",
			entry: "skill",
			display: {
				summary: "Disposable passed package.",
				overviewMarkdown: "# Disposable passed package",
			},
			skill: {
				entryFile: "SKILL.md",
				targets: ["codex"],
				activation: "Use only for validation.",
			},
		};

		const [manualCapability] = await dbWs
			.insert(capabilityPackages)
			.values({
				organizationId: ctx.organizationId,
				ownerUserId: ctx.userId,
				type: "skill",
				slug: manualCapabilitySlug,
				name: manualCapabilityName,
				description: "Disposable passed package for Control Chat matrix validation.",
				status: "active",
			})
			.returning();
		assert(manualCapability, "Failed to create manual capability package.");
		createdCapabilityIds.push(manualCapability.id);

		const manualVersions = await dbWs
			.insert(capabilityPackageVersions)
			.values([
				{
					capabilityId: manualCapability.id,
					version: "0.1.0",
					manifest: manualManifest,
					artifactUrl: `superset-capability://validation/${manualCapabilitySlug}/0.1.0.zip`,
					artifactPathname: `validation/${manualCapabilitySlug}/0.1.0.zip`,
					artifactSha256: `sha256-${suffix}-v1`,
					artifactSizeBytes: 1,
					sourceType: "zip",
					sourceRef: "control-chat-matrix",
					sourceInstruction: ctx.sourceInstruction,
					sourceSummary: "Validation version 1.",
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					validationSummary: { display: { summary: "Validation version 1." } },
					auditStatus: "passed",
					auditSummary: "Validation-only passed audit.",
					auditFindings: [],
					createdByUserId: ctx.userId,
				},
				{
					capabilityId: manualCapability.id,
					version: "0.2.0",
					manifest: { ...manualManifest, version: "0.2.0" },
					artifactUrl: `superset-capability://validation/${manualCapabilitySlug}/0.2.0.zip`,
					artifactPathname: `validation/${manualCapabilitySlug}/0.2.0.zip`,
					artifactSha256: `sha256-${suffix}-v2`,
					artifactSizeBytes: 1,
					sourceType: "zip",
					sourceRef: "control-chat-matrix",
					sourceInstruction: ctx.sourceInstruction,
					sourceSummary: "Validation version 2.",
					controlChatSessionId: ctx.sessionId,
					controlChatRunId: ctx.runId,
					validationSummary: { display: { summary: "Validation version 2." } },
					auditStatus: "passed",
					auditSummary: "Validation-only passed audit.",
					auditFindings: [],
					createdByUserId: ctx.userId,
				},
			])
			.returning();
		assert(manualVersions.length === 2, "Failed to create manual versions.");

		const [manualVersionOne, manualVersionTwo] = manualVersions;
		assert(manualVersionOne, "Missing manual version one.");
		assert(manualVersionTwo, "Missing manual version two.");

		await dbWs
			.update(capabilityPackages)
			.set({
				currentVersionId: manualVersionTwo.id,
				updatedAt: new Date(),
			})
			.where(eq(capabilityPackages.id, manualCapability.id));

		await callTool("capability.list", { query: manualCapabilityName });
		await callTool("capability.get", { id: manualCapability.id });
		await callTool("capability.versions.list", { id: manualCapability.id });
		await callTool("capability.versions.restore", {
			id: manualCapability.id,
			versionId: manualVersionOne.id,
		});
		await callTool("capability.setStatus", {
			id: manualCapability.id,
			status: "disabled",
		});
		await callTool("capability.setStatus", {
			id: manualCapability.id,
			status: "active",
		});

		const importPackage = buildGeneratedSkillPackage({
			name: `Matrix Imported Skill ${suffix}`,
			description: "Disposable importPackage validation skill.",
			instruction: "Validate direct importPackage through Control Chat tools.",
			sourceRef: "control-chat-matrix:import",
		});
		const imported = await callTool("capability.importPackage", {
			filename: importPackage.filename,
			fileData: importPackage.fileData,
			sourceType: "zip",
			sourceRef: importPackage.sourceRef,
		});
		const importedCapability = asRecord(imported.output.capability, "imported capability");
		const importedCapabilityId = asString(importedCapability.id, "imported capability id");
		createdCapabilityIds.push(importedCapabilityId);
		await expectToolError("capability.versions.restore", {
			id: importedCapabilityId,
			versionId: asString(asRecord(imported.output.version, "imported version").id, "imported version id"),
		}, "BAD_REQUEST");
		await callTool("capability.delete", { id: importedCapabilityId });
		createdCapabilityIds.splice(createdCapabilityIds.indexOf(importedCapabilityId), 1);

		const generatedSkill = await callTool("capability.generateSkillPackage", {
			name: `Matrix Generated Skill ${suffix}`,
			description: "Disposable generated Skill validation package.",
			instruction: "Create a validation Skill package with normal Control Chat generation.",
			sourceRef: "control-chat-matrix:generated-skill",
		});
		const generatedSkillCapability = asRecord(
			generatedSkill.output.capability,
			"generated skill capability",
		);
		const generatedSkillCapabilityId = asString(
			generatedSkillCapability.id,
			"generated skill capability id",
		);
		createdCapabilityIds.push(generatedSkillCapabilityId);
		await callTool("capability.delete", { id: generatedSkillCapabilityId });
		createdCapabilityIds.splice(
			createdCapabilityIds.indexOf(generatedSkillCapabilityId),
			1,
		);

		const generatedCli = await callTool("capability.generateCliPackage", {
			name: `Matrix Generated CLI ${suffix}`,
			description: "Disposable generated CLI validation package.",
			instruction: "Expose a --json command that summarizes validation input.",
			sourceUrl: "https://example.com",
			sourceRef: "control-chat-matrix:generated-cli",
		});
		const generatedCliCapability = asRecord(
			generatedCli.output.capability,
			"generated cli capability",
		);
		const generatedCliCapabilityId = asString(
			generatedCliCapability.id,
			"generated cli capability id",
		);
		createdCapabilityIds.push(generatedCliCapabilityId);
		await callTool("capability.delete", { id: generatedCliCapabilityId });
		createdCapabilityIds.splice(
			createdCapabilityIds.indexOf(generatedCliCapabilityId),
			1,
		);

		await expectToolError(
			"automation.create",
			{
				name: `Matrix Missing Host ${suffix}`,
				prompt: "Validate host-not-found behavior.",
				rrule: "FREQ=DAILY;INTERVAL=1",
				dtstart: new Date(),
				timezone: "UTC",
				targetHostId: `missing-host-${suffix}`,
			},
			"NOT_FOUND",
		);

		await callTool("automation.list", {});
		const createdAutomation = await callTool("automation.create", {
			name: `Matrix Automation ${suffix}`,
			prompt: "Initial matrix validation prompt.",
			rrule: "FREQ=DAILY;INTERVAL=1",
			dtstart: new Date(),
			timezone: "UTC",
			capabilities: [
				{
					capabilityVersionId: manualVersionOne.id,
					enabled: true,
					config: { mode: "matrix" },
					displayOrder: 0,
				},
			],
		});
		const automation = asRecord(createdAutomation.output.automation, "created automation");
		const automationId = asString(automation.id, "automation id");
		const initialUpdatedAt = asDate(automation.updatedAt, "automation updatedAt");
		const createdAutomationVersionId = asString(
			asRecord(createdAutomation.output.version, "created automation version").id,
			"created automation version id",
		);
		createdAutomationIds.push(automationId);

		await callTool("automation.list", { query: `Matrix Automation ${suffix}` });
		await callTool("automation.get", { id: automationId });
		await callTool("automation.update", {
			id: automationId,
			name: `Matrix Automation Updated ${suffix}`,
			prompt: "Updated matrix validation prompt.",
			expectedUpdatedAt: initialUpdatedAt,
		});
		await expectToolError(
			"automation.update",
			{
				id: automationId,
				name: `Matrix Automation Stale ${suffix}`,
				expectedUpdatedAt: new Date(0),
			},
			"CONFLICT",
		);
		await callTool("automation.pause", { id: automationId });
		await callTool("automation.resume", { id: automationId });
		await callTool("automation.versions.list", {
			automationId,
			limit: 20,
		});
		await callTool("automation.versions.restore", {
			versionId: createdAutomationVersionId,
		});
		await callTool("automation.run", { id: automationId });
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		await callTool("automation.logs", {
			automationId,
			limit: 20,
		});

		const [automationVersionCount] = await db
			.select({ count: automationConfigVersions.id })
			.from(automationConfigVersions)
			.where(eq(automationConfigVersions.automationId, automationId))
			.limit(1);
		assert(
			automationVersionCount,
			"Automation config versions were not queryable after matrix run.",
		);

		console.log(JSON.stringify({ ok: true, entries }, null, 2));
	} catch (error) {
		entries.push({
			name: "matrix",
			status: "fail",
			summary: errorMessage(error),
		});
		console.error(JSON.stringify({ ok: false, entries }, null, 2));
		process.exitCode = 1;
	} finally {
		for (const automationId of createdAutomationIds.reverse()) {
			await dbWs.delete(automations).where(eq(automations.id, automationId));
		}

		const uniqueCapabilityIds = [...new Set(createdCapabilityIds)].filter(Boolean);
		if (uniqueCapabilityIds.length > 0) {
			await dbWs
				.delete(capabilityPackages)
				.where(inArray(capabilityPackages.id, uniqueCapabilityIds));
		}

		if (validationRunId) {
			await dbWs
				.delete(controlChatRuns)
				.where(
					and(
						eq(controlChatRuns.id, validationRunId),
						eq(controlChatRuns.organizationId, session.organizationId),
					),
				);
		}
	}
}

await main();
