export type ClaudeAgentRuntimePackNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

function copyWholeModule(
	moduleName: string,
): ClaudeAgentRuntimePackNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

export function getClaudeAgentSdkPlatformPackageName(options?: {
	targetArch?: string;
	targetPlatform?: string;
}): string {
	const targetArch =
		options?.targetArch ?? process.env.TARGET_ARCH ?? process.arch;
	const targetPlatform =
		options?.targetPlatform ?? process.env.TARGET_PLATFORM ?? process.platform;

	if (targetPlatform === "darwin") {
		return targetArch === "arm64"
			? "@anthropic-ai/claude-agent-sdk-darwin-arm64"
			: "@anthropic-ai/claude-agent-sdk-darwin-x64";
	}
	if (targetPlatform === "win32") {
		return targetArch === "arm64"
			? "@anthropic-ai/claude-agent-sdk-win32-arm64"
			: "@anthropic-ai/claude-agent-sdk-win32-x64";
	}
	if (targetPlatform === "linux") {
		return targetArch === "arm64"
			? "@anthropic-ai/claude-agent-sdk-linux-arm64"
			: "@anthropic-ai/claude-agent-sdk-linux-x64";
	}
	return `@anthropic-ai/claude-agent-sdk-${targetPlatform}-${targetArch}`;
}

export const claudeAgentRuntimeBasePackModuleNames = [
	"@anthropic-ai/claude-agent-sdk",
	"@anthropic-ai/sdk",
	"@modelcontextprotocol/sdk",
	"json-schema-to-ts",
	"@babel/runtime",
	"ts-algebra",
	"zod",
] as const;

export function getClaudeAgentRuntimePackModuleNames(): string[] {
	return [
		...claudeAgentRuntimeBasePackModuleNames,
		getClaudeAgentSdkPlatformPackageName(),
	];
}

export function getClaudeAgentRuntimePackResourceCopies(): ClaudeAgentRuntimePackNodeModuleCopy[] {
	return getClaudeAgentRuntimePackModuleNames().map((moduleName) =>
		copyWholeModule(moduleName),
	);
}
