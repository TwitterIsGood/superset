import {
	type ControlChatToolTargetKind,
	controlChatToolTargetKindValues,
} from "@superset/db/enums";
import { z } from "zod";

export const controlChatRendererContextSchema = z
	.object({
		routePath: z.string().max(1000).optional(),
		routeId: z.string().max(1000).optional(),
		resource: z
			.object({
				kind: z
					.enum(["automation", "capability", "host", "workspace", "project"])
					.optional(),
				id: z.string().max(200).optional(),
				label: z.string().max(500).optional(),
			})
			.optional(),
		localMachineId: z.string().max(240).nullish(),
	})
	.strict()
	.default({});

export type ControlChatRendererContext = z.infer<
	typeof controlChatRendererContextSchema
>;

export const controlChatSendSchema = z
	.object({
		sessionId: z.string().uuid().optional(),
		message: z.string().trim().min(1).max(40_000),
		rendererContext: controlChatRendererContextSchema.optional(),
		modelProviderId: z.string().uuid().nullish(),
		modelId: z.string().trim().min(1).max(500).nullish(),
	})
	.strict();

export type ControlChatSendInput = z.infer<typeof controlChatSendSchema>;

export const controlChatCreateSessionSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		rendererContext: controlChatRendererContextSchema.optional(),
	})
	.strict()
	.optional();

export const controlChatToolTargetSchema = z
	.object({
		kind: z.enum(controlChatToolTargetKindValues).default("cloud"),
		hostId: z.string().min(1).max(240).nullish(),
		workspaceId: z.string().uuid().nullish(),
	})
	.strict()
	.default({ kind: "cloud" satisfies ControlChatToolTargetKind });

const automationCapabilityInputSchema = z
	.object({
		capabilityVersionId: z.string().uuid(),
		enabled: z.boolean().default(true),
		config: z.record(z.string(), z.unknown()).default({}),
		displayOrder: z.number().int().min(0).max(1000).optional(),
	})
	.strict();

export const controlChatToolSchemas = {
	"automation.list": z
		.object({
			query: z.string().trim().min(1).max(200).optional(),
		})
		.strict()
		.default({}),
	"automation.get": z.object({ id: z.string().uuid() }).strict(),
	"automation.create": z
		.object({
			name: z.string().trim().min(1).max(200),
			prompt: z.string().trim().min(1).max(100_000),
			agent: z.string().trim().min(1).max(200).default("codex"),
			rrule: z.string().trim().min(1).max(500),
			dtstart: z.coerce.date().optional(),
			timezone: z.string().trim().min(1),
			targetHostId: z.string().trim().min(1).nullish(),
			v2ProjectId: z.string().uuid().nullish(),
			modelProviderId: z.string().uuid().nullish(),
			modelId: z.string().trim().min(1).max(500).nullish(),
			modelConfig: z.record(z.string(), z.unknown()).optional(),
			mcpScope: z.array(z.string()).default([]),
			capabilities: z.array(automationCapabilityInputSchema).default([]),
		})
		.strict(),
	"automation.update": z
		.object({
			id: z.string().uuid(),
			name: z.string().trim().min(1).max(200).optional(),
			prompt: z.string().trim().min(1).max(100_000).optional(),
			agent: z.string().trim().min(1).max(200).optional(),
			rrule: z.string().trim().min(1).max(500).optional(),
			dtstart: z.coerce.date().optional(),
			timezone: z.string().trim().min(1).optional(),
			targetHostId: z.string().trim().min(1).nullish(),
			v2ProjectId: z.string().uuid().nullish(),
			modelProviderId: z.string().uuid().nullish(),
			modelId: z.string().trim().min(1).max(500).nullish(),
			modelConfig: z.record(z.string(), z.unknown()).optional(),
			mcpScope: z.array(z.string()).optional(),
			capabilities: z.array(automationCapabilityInputSchema).optional(),
			expectedUpdatedAt: z.coerce.date().optional(),
		})
		.strict(),
	"automation.pause": z.object({ id: z.string().uuid() }).strict(),
	"automation.resume": z.object({ id: z.string().uuid() }).strict(),
	"automation.run": z.object({ id: z.string().uuid() }).strict(),
	"automation.logs": z
		.object({
			automationId: z.string().uuid(),
			limit: z.number().int().min(1).max(100).default(20),
		})
		.strict(),
	"automation.versions.list": z
		.object({
			automationId: z.string().uuid(),
			limit: z.number().int().min(1).max(200).default(100),
		})
		.strict(),
	"automation.versions.restore": z
		.object({
			versionId: z.string().uuid(),
		})
		.strict(),
	"capability.list": z
		.object({
			type: z.enum(["skill", "cli"]).optional(),
			query: z.string().trim().min(1).max(120).optional(),
		})
		.strict()
		.default({}),
	"capability.get": z.object({ id: z.string().uuid() }).strict(),
	"capability.importPackage": z
		.object({
			filename: z.string().trim().min(1).max(240),
			fileData: z.string().min(1),
			sourceType: z.enum(["zip", "git", "local_folder"]).default("zip"),
			sourceRef: z.string().trim().max(1000).optional(),
		})
		.strict(),
	"capability.setStatus": z
		.object({
			id: z.string().uuid(),
			status: z.enum(["active", "disabled"]),
		})
		.strict(),
	"capability.delete": z.object({ id: z.string().uuid() }).strict(),
	"capability.versions.list": z.object({ id: z.string().uuid() }).strict(),
	"capability.versions.restore": z
		.object({
			id: z.string().uuid(),
			versionId: z.string().uuid(),
		})
		.strict(),
	"capability.generateSkillPackage": z
		.object({
			name: z.string().trim().min(1).max(120),
			description: z.string().trim().max(2000).optional(),
			instruction: z.string().trim().min(1).max(40_000),
			sourceRef: z.string().trim().max(1000).optional(),
		})
		.strict(),
	"capability.generateCliPackage": z
		.object({
			name: z.string().trim().min(1).max(120),
			description: z.string().trim().max(2000).optional(),
			instruction: z.string().trim().min(1).max(40_000),
			sourceUrl: z.string().url().optional(),
			sourceRef: z.string().trim().max(1000).optional(),
		})
		.strict(),
} as const;

export type ControlChatToolName = keyof typeof controlChatToolSchemas;
