import {
	CLAUDE_AGENT_RUNTIME_PACK_ID,
	MASTRACODE_RUNTIME_PACK_ID,
	SUPERSET_CLI_RUNTIME_PACK_ID,
	TRELLIS_RUNTIME_PACK_ID,
} from "lib/pack-system/pack-ids";
import { z } from "zod";

export const PACK_CACHE_DIR_NAME = "packs";
export {
	CLAUDE_AGENT_RUNTIME_PACK_ID,
	MASTRACODE_RUNTIME_PACK_ID,
	SUPERSET_CLI_RUNTIME_PACK_ID,
	TRELLIS_RUNTIME_PACK_ID,
};

const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const PACK_VERSION_PATTERN = /^[0-9A-Za-z.+-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function isSafePackRelativePath(path: string): boolean {
	if (
		path.length === 0 ||
		path.startsWith("/") ||
		path.startsWith("\\") ||
		path.includes("\\") ||
		path.includes(":")
	) {
		return false;
	}

	return path.split("/").every((segment) => {
		return segment.length > 0 && segment !== "." && segment !== "..";
	});
}

export const packIdSchema = z
	.string()
	.min(1)
	.regex(
		PACK_ID_PATTERN,
		"Pack id must use lowercase letters, numbers, dots, underscores, or dashes.",
	);

export const packVersionSchema = z
	.string()
	.min(1)
	.regex(
		PACK_VERSION_PATTERN,
		"Pack version contains unsupported path characters.",
	);

export const packRelativePathSchema = z
	.string()
	.min(1)
	.refine(
		isSafePackRelativePath,
		"Pack file path must be a safe relative path.",
	);

export const packSha256Schema = z
	.string()
	.regex(SHA256_PATTERN, "Pack file sha256 must be a 64-character hex digest.");

export const packFileManifestSchema = z
	.object({
		path: packRelativePathSchema,
		size: z.number().int().nonnegative(),
		sha256: packSha256Schema,
		executable: z.boolean().optional(),
		downloadUrl: z.url().optional(),
	})
	.strict();

export const packExecuteHintSchema = z
	.object({
		runtime: z.string().min(1),
		entry: packRelativePathSchema,
		args: z.array(z.string()).optional(),
	})
	.strict();

export const packManifestSchema = z
	.object({
		schemaVersion: z.literal(1).optional(),
		packId: packIdSchema,
		version: packVersionSchema,
		minAppVersion: z.string().min(1).optional(),
		appVersionRange: z.string().min(1).optional(),
		downloadUrl: z.url(),
		files: z.array(packFileManifestSchema).min(1),
		executeHint: packExecuteHintSchema.optional(),
	})
	.strict();

export const packManifestIndexSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.string().optional(),
		packs: z.record(packIdSchema, z.array(packManifestSchema).min(1)),
	})
	.strict();

export const packInstallStateSchema = z.enum([
	"not_configured",
	"missing",
	"installed",
	"downloading",
	"verifying",
	"error",
]);

export const packProgressPhaseSchema = z.enum(["downloading", "verifying"]);

export const packProgressSchema = z
	.object({
		phase: packProgressPhaseSchema,
		filePath: z.string().nullable(),
		fileIndex: z.number().int().nonnegative(),
		fileCount: z.number().int().nonnegative(),
		bytesDownloaded: z.number().int().nonnegative(),
		totalBytes: z.number().int().nonnegative(),
	})
	.strict();

export const packStatusSchema = z
	.object({
		packId: packIdSchema,
		version: z.string().nullable(),
		status: packInstallStateSchema,
		installedPath: z.string().nullable(),
		progress: packProgressSchema.nullable(),
		error: z.string().nullable(),
		updatedAt: z.number().int().nonnegative(),
	})
	.strict();

export const packResolutionSchema = z.discriminatedUnion("ok", [
	z
		.object({
			ok: z.literal(true),
			status: packStatusSchema,
			path: z.string(),
			executeHint: packExecuteHintSchema.nullable(),
		})
		.strict(),
	z
		.object({
			ok: z.literal(false),
			status: packStatusSchema,
			error: z.string(),
		})
		.strict(),
]);

export type PackId = z.infer<typeof packIdSchema>;
export type PackFileManifest = z.infer<typeof packFileManifestSchema>;
export type PackExecuteHint = z.infer<typeof packExecuteHintSchema>;
export type PackManifest = z.infer<typeof packManifestSchema>;
export type PackManifestIndex = z.infer<typeof packManifestIndexSchema>;
export type PackInstallState = z.infer<typeof packInstallStateSchema>;
export type PackProgress = z.infer<typeof packProgressSchema>;
export type PackStatus = z.infer<typeof packStatusSchema>;
export type PackResolution = z.infer<typeof packResolutionSchema>;
