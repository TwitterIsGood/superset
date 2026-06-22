const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blockPath(pathname) {
	return new RegExp(`${escapeRegExp(pathname)}(?:[/\\\\].*)?$`);
}

const runtimePathBlockList = [
	blockPath(path.resolve(monorepoRoot, ".superset")),
	blockPath(path.resolve(monorepoRoot, ".trellis")),
	blockPath(path.resolve(monorepoRoot, "superset-dev-data")),
	blockPath(path.resolve(projectRoot, ".expo")),
	/[/\\]\.turbo(?:[/\\].*)?$/,
	/^(?!.*[/\\]node_modules[/\\]).*[/\\]dist(?:[/\\].*)?$/,
	/^(?!.*[/\\]node_modules[/\\]).*[/\\]build(?:[/\\].*)?$/,
	/[/\\][^/\\]+\.sqlite(?:-(?:wal|shm))?$/,
	/[/\\][^/\\]+\.db(?:-(?:wal|shm))?$/,
];

// Keep Expo's workspace package watch folders, but do not watch the whole
// worktree: host/chat runtime files change during normal mobile acceptance.
config.watchFolders = config.watchFolders.filter(
	(folder) => path.resolve(folder) !== monorepoRoot,
);
config.resolver.blockList = [
	...(Array.isArray(config.resolver.blockList)
		? config.resolver.blockList
		: [config.resolver.blockList].filter(Boolean)),
	...runtimePathBlockList,
];

// Let Metro find modules from the monorepo root
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(monorepoRoot, "node_modules"),
];

// Enable package exports for better-auth
config.resolver.unstable_enablePackageExports = true;

// Resolve local Expo Modules (modules/ dir)
config.resolver.extraNodeModules = {
	"@superset/tab-bar": path.resolve(projectRoot, "modules/tab-bar"),
	"@superset/native-terminal": path.resolve(
		projectRoot,
		"modules/native-terminal",
	),
};

module.exports = withUniwindConfig(config, {
	cssEntryFile: "./global.css",
	dtsFile: "./uniwind-types.d.ts",
});
