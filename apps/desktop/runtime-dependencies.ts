type PackagedNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

type ExternalizedRuntimeModule = {
	asarUnpackGlobs: string[];
	materialize: string[];
	packagedCopies: PackagedNodeModuleCopy[];
	specifier: string;
};

export type RequiredNativeRuntimeFile = {
	description: string;
	mustBeExecutable?: boolean;
	relativePath: string;
};

export type RequiredPackagedRuntimeFile = {
	description: string;
	mustBeExecutable?: boolean;
	relativePath: string;
};

function copyWholeModule(moduleName: string): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

function copyModuleSubtree(
	moduleName: string,
	filter: string[],
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter,
	};
}

const externalizedRuntimeModules: ExternalizedRuntimeModule[] = [
	{
		specifier: "better-sqlite3",
		materialize: ["better-sqlite3"],
		packagedCopies: [copyWholeModule("better-sqlite3")],
		asarUnpackGlobs: ["**/node_modules/better-sqlite3/**/*"],
	},
	{
		specifier: "node-pty",
		materialize: ["node-pty"],
		packagedCopies: [copyWholeModule("node-pty")],
		asarUnpackGlobs: ["**/node_modules/node-pty/**/*"],
	},
	{
		specifier: "native-keymap",
		materialize: ["native-keymap"],
		packagedCopies: [copyWholeModule("native-keymap")],
		asarUnpackGlobs: ["**/node_modules/native-keymap/**/*"],
	},
	{
		specifier: "@superset/macos-process-metrics",
		materialize: ["@superset/macos-process-metrics"],
		packagedCopies: [copyWholeModule("@superset/macos-process-metrics")],
		asarUnpackGlobs: ["**/node_modules/@superset/macos-process-metrics/**/*"],
	},
	{
		specifier: "@parcel/watcher",
		materialize: ["@parcel/watcher"],
		packagedCopies: [
			copyModuleSubtree("@parcel", ["watcher/**/*", "watcher-*/**/*"]),
		],
		asarUnpackGlobs: ["**/node_modules/@parcel/watcher*/**/*"],
	},
];

const packagedSupportModules = [
	copyWholeModule("bindings"),
	copyWholeModule("file-uri-to-path"),
	copyWholeModule("detect-libc"),
	copyWholeModule("is-glob"),
	copyWholeModule("is-extglob"),
	copyWholeModule("picomatch"),
	copyWholeModule("node-addon-api"),
	copyWholeModule("ws"),
	copyWholeModule("@xterm/headless"),
	copyWholeModule("@xterm/addon-serialize"),
];

export const mainExternalizedDependencies = [
	...externalizedRuntimeModules.map((module) => module.specifier),
	"ws",
	"@xterm/headless",
	"@xterm/addon-serialize",
	"pg-native",
];

export const packagedNodeModuleCopies = [
	...externalizedRuntimeModules.flatMap((module) => module.packagedCopies),
	...packagedSupportModules,
];

export const packagedAsarUnpackGlobs = [
	...externalizedRuntimeModules.flatMap((module) => module.asarUnpackGlobs),
	"**/node_modules/bindings/**/*",
	"**/node_modules/file-uri-to-path/**/*",
	"**/node_modules/ws/**/*",
	"**/node_modules/@xterm/headless/**/*",
	"**/node_modules/@xterm/addon-serialize/**/*",
];

const packOnlyNodeModuleRoots = [
	"node_modules/@mindfoldhq/trellis",
	"node_modules/@mindfoldhq/trellis-core",
	"node_modules/@anthropic-ai/claude-agent-sdk",
	"node_modules/@anthropic-ai/claude-agent-sdk-*",
	"node_modules/@anthropic-ai/sdk",
	"node_modules/@browserbasehq",
	"node_modules/@modelcontextprotocol/sdk",
	"node_modules/json-schema-to-ts",
	"node_modules/ts-algebra",
	"node_modules/mastracode",
	"node_modules/@mastra/agent-browser",
	"node_modules/@mastra/duckdb",
	"node_modules/@mastra/memory",
	"node_modules/@mastra/stagehand",
	"node_modules/@duckdb",
	"node_modules/@libsql",
	"node_modules/@neon-rs",
	"node_modules/libsql",
	"node_modules/chromium-bidi",
	"node_modules/patchright-core",
	"node_modules/playwright",
	"node_modules/playwright-core",
	"node_modules/webdriver",
	"node_modules/webdriverio",
];

export const packOnlyNodeModuleFileExcludes = packOnlyNodeModuleRoots.flatMap(
	(moduleRoot) => [`!${moduleRoot}`, `!${moduleRoot}/**/*`],
);

export const requiredMaterializedNodeModules = [
	...externalizedRuntimeModules.flatMap((module) => module.materialize),
	"bindings",
	"file-uri-to-path",
	"detect-libc",
	"is-glob",
	"is-extglob",
	"picomatch",
	"node-addon-api",
	"ws",
	"@xterm/headless",
	"@xterm/addon-serialize",
];

function normalizeRuntimePlatform(platform: string): NodeJS.Platform | string {
	if (platform === "mac" || platform === "macos") return "darwin";
	if (platform === "windows") return "win32";
	return platform;
}

function normalizeRuntimeArch(arch: string): string {
	if (arch === "universal") return process.arch;
	return arch;
}

function getParcelWatcherRuntimePackage(
	platform: string,
	arch: string,
): string | null {
	if (platform === "darwin") {
		return `@parcel/watcher-darwin-${arch}`;
	}
	if (platform === "linux") {
		return `@parcel/watcher-linux-${arch}-glibc`;
	}
	if (platform === "win32") {
		return `@parcel/watcher-win32-${arch}`;
	}
	return null;
}

export function getRequiredNativeRuntimeFiles({
	targetArch = process.env.TARGET_ARCH ?? process.arch,
	targetPlatform = process.env.TARGET_PLATFORM ?? process.platform,
}: {
	targetArch?: string;
	targetPlatform?: string;
} = {}): RequiredNativeRuntimeFile[] {
	const platform = normalizeRuntimePlatform(targetPlatform);
	const arch = normalizeRuntimeArch(targetArch);
	const requiredFiles: RequiredNativeRuntimeFile[] = [
		{
			description: "better-sqlite3 native binding",
			relativePath: "better-sqlite3/build/Release/better_sqlite3.node",
		},
		{
			description: "native-keymap native binding",
			relativePath: "native-keymap/build/Release/keymapping.node",
		},
	];

	const parcelWatcherPackage = getParcelWatcherRuntimePackage(platform, arch);
	if (parcelWatcherPackage) {
		requiredFiles.push({
			description: "@parcel/watcher platform binding",
			relativePath: `${parcelWatcherPackage}/watcher.node`,
		});
	}

	if (platform === "darwin") {
		requiredFiles.push(
			{
				description: "node-pty macOS prebuild",
				relativePath: `node-pty/prebuilds/darwin-${arch}/pty.node`,
			},
			{
				description: "node-pty macOS spawn helper",
				mustBeExecutable: true,
				relativePath: `node-pty/prebuilds/darwin-${arch}/spawn-helper`,
			},
			{
				description: "macOS process metrics native binding",
				relativePath:
					"@superset/macos-process-metrics/build/Release/macos_process_metrics.node",
			},
		);
	} else if (platform === "linux") {
		requiredFiles.push({
			description: "node-pty Linux native binding",
			relativePath: "node-pty/build/Release/pty.node",
		});
	} else if (platform === "win32") {
		requiredFiles.push({
			description: "node-pty Windows prebuild",
			relativePath: `node-pty/prebuilds/win32-${arch}/pty.node`,
		});
	}

	return requiredFiles;
}

export function getRequiredPackagedRuntimeFiles({
	targetArch = process.env.TARGET_ARCH ?? process.arch,
	targetPlatform = process.env.TARGET_PLATFORM ?? process.platform,
}: {
	targetArch?: string;
	targetPlatform?: string;
} = {}): RequiredPackagedRuntimeFile[] {
	return [
		...getRequiredNativeRuntimeFiles({ targetArch, targetPlatform }),
		{
			description: "host-service WebSocket runtime package",
			relativePath: "ws/package.json",
		},
		{
			description: "host-service headless terminal runtime package",
			relativePath: "@xterm/headless/package.json",
		},
		{
			description: "host-service terminal serialization runtime package",
			relativePath: "@xterm/addon-serialize/package.json",
		},
	];
}
