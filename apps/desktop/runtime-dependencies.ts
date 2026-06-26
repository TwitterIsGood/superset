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
		specifier: "@ast-grep/napi",
		materialize: ["@ast-grep/napi"],
		packagedCopies: [copyWholeModule("@ast-grep")],
		asarUnpackGlobs: ["**/node_modules/@ast-grep/napi*/**/*"],
	},
	{
		specifier: "@parcel/watcher",
		materialize: ["@parcel/watcher"],
		packagedCopies: [
			copyModuleSubtree("@parcel", ["watcher/**/*", "watcher-*/**/*"]),
		],
		asarUnpackGlobs: ["**/node_modules/@parcel/watcher*/**/*"],
	},
	{
		specifier: "libsql",
		materialize: ["libsql"],
		packagedCopies: [
			copyWholeModule("libsql"),
			copyWholeModule("@libsql"),
			copyWholeModule("@neon-rs"),
		],
		asarUnpackGlobs: ["**/node_modules/@libsql/**/*"],
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
];

export const mainExternalizedDependencies = [
	...externalizedRuntimeModules.map((module) => module.specifier),
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
];
