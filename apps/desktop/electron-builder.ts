/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import pkg from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
	packOnlyNodeModuleFileExcludes,
} from "./runtime-dependencies";
import {
	normalizeBuilderArch,
	prunePackagedElectronLocales,
	prunePackagedElectronSoftwareRenderer,
	prunePackagedNativePayloads,
} from "./scripts/prune-packaged-native-payloads";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const productName = pkg.productName;
const macIconPath = join(pkg.resources, "build/icons/icon.icns");
const linuxIconPath = join(pkg.resources, "build/icons");
const winIconPath = join(pkg.resources, "build/icons/icon.ico");
const dmgBackgroundPath = join(
	pkg.resources,
	"build/installer/background.tiff",
);
const skipMacCodeSigning = process.env.SKIP_MAC_CODE_SIGNING === "true";
const adHocMacCodeSigning = process.env.AD_HOC_MAC_CODE_SIGNING === "true";
const skipDeveloperIdMacSigning = skipMacCodeSigning || adHocMacCodeSigning;
const shouldRebuildNativeModules =
	process.env.ELECTRON_BUILDER_NPM_REBUILD !== "false";
const buildDependenciesFromSource =
	process.env.ELECTRON_BUILDER_BUILD_FROM_SOURCE === "true";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const bundledCliResourcePath = join(
	process.cwd(),
	"dist/resources/bin",
	targetPlatform === "win32" ? "superset.exe" : "superset",
);
const bundledCliExtraResources = existsSync(bundledCliResourcePath)
	? [
			{
				from: "dist/resources/bin",
				to: "resources/bin",
				filter: ["**/*"],
			},
		]
	: [];

const config: Configuration = {
	appId: "com.superset.desktop",
	productName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),

	// Generate update manifests for all channels (latest.yml, canary.yml, etc.)
	// This enables proper channel-based auto-updates following electron-builder conventions
	generateUpdatesFilesForAllChannels: true,

	// Generate latest-mac.yml for auto-update (workflow handles actual upload)
	publish: {
		provider: "github",
		owner: "superset-sh",
		repo: "superset",
	},

	// Directories
	directories: {
		output: "release",
		buildResources: join(pkg.resources, "build"),
	},

	// ASAR configuration for native modules and external resources
	asar: true,
	asarUnpack: [
		...packagedAsarUnpackGlobs,
		// Sound files must be unpacked so external audio players (afplay, paplay, etc.) can access them
		"**/resources/sounds/**/*",
		// Tray icon must be unpacked so Electron Tray can load it
		"**/resources/tray/**/*",
	],

	// Extra resources placed outside asar archive (accessible via process.resourcesPath)
	extraResources: [
		// Database migrations - must be outside asar for drizzle-orm to read
		{
			from: "dist/resources/migrations",
			to: "resources/migrations",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/host-migrations",
			to: "resources/host-migrations",
			filter: ["**/*"],
		},
		...bundledCliExtraResources,
		{
			from: "dist/resources/pack-system",
			to: "resources/pack-system",
			filter: ["pack-manifest-index.json"],
		},
	],

	files: [
		"dist/**/*",
		// Built-in sounds are copied from src/resources into app.asar.unpacked/resources/sounds.
		// Exclude the electron-vite preview copy to avoid packaging the same MP3s twice.
		"!dist/resources/sounds/**/*",
		"!dist/resource-packs/**/*",
		"!dist/resource-packs-test/**/*",
		"package.json",
		// Main/preload/renderer are bundled by electron-vite. Keep production
		// node_modules out of app.asar by default, then re-include only the
		// native/runtime modules listed below.
		"!node_modules/**/*",
		{
			from: pkg.resources,
			to: "resources",
			filter: [
				"**/*",
				"!build/installer/**/*",
				"!build/icons/*.png",
				"!build/*.plist",
				"!build/icons/*.icns",
				"!build/icons/*.ico",
			],
		},
		// Runtime modules that stay external to the main bundle.
		// bun creates symlinks for direct deps in workspace node_modules.
		// The copy:native-modules script replaces symlinks with real files
		// before building (required for Bun 1.3+ isolated installs).
		...packagedNodeModuleCopies,
		// Heavy feature runtimes are delivered as resource packs. Electron-builder's
		// dependency traversal can still discover them through workspace package deps.
		...packOnlyNodeModuleFileExcludes,
		"!**/.DS_Store",
		"!**/*.map",
		"!**/*.test.*",
		"!**/*.spec.*",
	],

	// CI runs `install-app-deps` and `copy:native-modules` explicitly. Let that
	// path skip electron-builder's duplicate native rebuild while preserving the
	// safer default for local ad-hoc packaging.
	npmRebuild: shouldRebuildNativeModules,
	buildDependenciesFromSource,

	afterPack: async (context) => {
		await prunePackagedNativePayloads({
			appOutDir: context.appOutDir,
			targetArch: normalizeBuilderArch(context.arch),
			targetPlatform: context.electronPlatformName,
		});
		if (context.electronPlatformName === "darwin") {
			await prunePackagedElectronLocales({
				appOutDir: context.appOutDir,
			});
			await prunePackagedElectronSoftwareRenderer({
				appOutDir: context.appOutDir,
			});
		}
	},

	// macOS DMG installer
	dmg: {
		...(existsSync(dmgBackgroundPath) ? { background: dmgBackgroundPath } : {}),
		// LZFSE-compressed DMGs are materially faster to create than the default
		// zlib UDZO images while staying compressed for GitHub Release downloads.
		format: "ULFO",
		// Explicit size — dmgbuild's auto-calc under-allocates and silently truncates
		// the last large file above ~1.7GB of contents. `shrink: true` (default) keeps
		// the final artifact compact.
		size: "4g",
	},

	// macOS
	mac: {
		...(existsSync(macIconPath) ? { icon: macIconPath } : {}),
		category: "public.app-category.utilities",
		target: "default",
		hardenedRuntime: !skipDeveloperIdMacSigning,
		gatekeeperAssess: false,
		notarize: !skipDeveloperIdMacSigning,
		...(skipMacCodeSigning ? { identity: null } : {}),
		...(adHocMacCodeSigning ? { identity: "-" } : {}),
		entitlements: join(pkg.resources, "build/entitlements.mac.plist"),
		entitlementsInherit: join(
			pkg.resources,
			"build/entitlements.mac.inherit.plist",
		),
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
			// Required for macOS microphone permission prompt
			NSMicrophoneUsageDescription:
				"Superset needs microphone access so voice-enabled tools like Codex transcription can capture audio input.",
			// Required for macOS local network permission prompt
			NSLocalNetworkUsageDescription:
				"Superset needs access to your local network to discover and connect to development servers running on your network.",
			// Bonjour service types to browse for (triggers the permission prompt)
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
			// Required for Apple Events / Automation permission prompt
			NSAppleEventsUsageDescription:
				"Superset needs to interact with other applications to run terminal commands and development tools.",
		},
	},

	// Deep linking protocol
	protocols: {
		name: productName,
		schemes: ["superset"],
	},

	// Linux
	linux: {
		...(existsSync(linuxIconPath) ? { icon: linuxIconPath } : {}),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage"],
		artifactName: `superset-\${version}-\${arch}.\${ext}`,
	},

	// Windows
	win: {
		...(existsSync(winIconPath) ? { icon: winIconPath } : {}),
		target: [
			{
				target: "nsis",
				arch: ["x64"],
			},
		],
		artifactName: `${productName}-${pkg.version}-\${arch}.\${ext}`,
	},

	// NSIS installer (Windows)
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
};

export default config;
