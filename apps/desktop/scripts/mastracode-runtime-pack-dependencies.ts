import {
	MASTRA_MEMORY_RUNTIME_ENTRY,
	MASTRACODE_RUNTIME_ENTRY,
} from "../src/lib/pack-system/runtime-pack-entries";

export const MASTRACODE_PACKAGE_NAME = "mastracode";
export { MASTRA_MEMORY_RUNTIME_ENTRY, MASTRACODE_RUNTIME_ENTRY };

export const mastracodeRuntimeSeedPackageNames = [
	"@ai-sdk/anthropic",
	"@ai-sdk/openai",
	"@ai-sdk/openai-compatible",
	"@mastra/core",
	"@mastra/duckdb",
	"@mastra/fastembed",
	"@mastra/libsql",
	"@mastra/mcp",
	"@mastra/memory",
	"@mastra/observability",
	"@mastra/pg",
	"@mastra/schema-compat",
	"@mastra/tavily",
	"ai",
	"chalk",
	"tokenx",
	"zod",
] as const;

const DUCKDB_NODE_BINDINGS_PLATFORM_PACKAGE_PREFIX = "@duckdb/node-bindings-";

export function getDuckdbNodeBindingsPackageName(options?: {
	targetArch?: string;
	targetPlatform?: string;
}): string {
	const targetArch =
		options?.targetArch ?? process.env.TARGET_ARCH ?? process.arch;
	const targetPlatform =
		options?.targetPlatform ?? process.env.TARGET_PLATFORM ?? process.platform;
	return `@duckdb/node-bindings-${targetPlatform}-${targetArch}`;
}

export function shouldIncludeMastracodeRuntimeDependency(
	name: string,
	options?: {
		targetArch?: string;
		targetPlatform?: string;
	},
): boolean {
	if (!name.startsWith(DUCKDB_NODE_BINDINGS_PLATFORM_PACKAGE_PREFIX)) {
		return true;
	}
	return name === getDuckdbNodeBindingsPackageName(options);
}

export function getMastracodeRuntimeNativePackageNames(options?: {
	targetArch?: string;
	targetPlatform?: string;
}): string[] {
	return [
		"@ast-grep/napi",
		"@mastra/duckdb",
		"@duckdb/node-api",
		"@duckdb/node-bindings",
		getDuckdbNodeBindingsPackageName(options),
		"@mastra/fastembed",
		"onnxruntime-node",
		"@mastra/libsql",
		"libsql",
		"@mastra/pg",
	];
}
