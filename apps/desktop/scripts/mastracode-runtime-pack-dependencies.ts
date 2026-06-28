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
const LIBSQL_PLATFORM_PACKAGE_PATTERN = /^@libsql\/(?:darwin|linux|win32)-/;

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
	if (name.startsWith(DUCKDB_NODE_BINDINGS_PLATFORM_PACKAGE_PREFIX)) {
		return name === getDuckdbNodeBindingsPackageName(options);
	}
	if (LIBSQL_PLATFORM_PACKAGE_PATTERN.test(name)) {
		return getLibsqlPlatformPackageNames(options).includes(name);
	}
	return true;
}

export function getLibsqlPlatformPackageNames(options?: {
	targetArch?: string;
	targetPlatform?: string;
}): string[] {
	const targetArch =
		options?.targetArch ?? process.env.TARGET_ARCH ?? process.arch;
	const targetPlatform =
		options?.targetPlatform ?? process.env.TARGET_PLATFORM ?? process.platform;
	if (targetPlatform === "darwin") {
		if (targetArch === "universal") {
			return ["@libsql/darwin-arm64", "@libsql/darwin-x64"];
		}
		return [`@libsql/darwin-${targetArch}`];
	}
	if (targetPlatform === "linux") {
		if (targetArch === "x64") {
			return ["@libsql/linux-x64-gnu", "@libsql/linux-x64-musl"];
		}
		return [`@libsql/linux-${targetArch}-gnu`];
	}
	return [];
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
		...getLibsqlPlatformPackageNames(options),
		"@mastra/pg",
	];
}
