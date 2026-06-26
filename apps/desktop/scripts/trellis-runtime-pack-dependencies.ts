export type RuntimePackNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

function copyWholeModule(moduleName: string): RuntimePackNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

function copyNestedModule(
	parentModuleName: string,
	moduleName: string,
): RuntimePackNodeModuleCopy {
	return {
		from: `node_modules/${parentModuleName}/node_modules/${moduleName}`,
		to: `node_modules/${parentModuleName}/node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

export const trellisRuntimePackModuleNames = [
	"@mindfoldhq/trellis",
	"@mindfoldhq/trellis-core",
	"chalk",
	"commander",
	"figlet",
	"giget",
	"inquirer",
	"@inquirer/external-editor",
	"chardet",
	"iconv-lite",
	"safer-buffer",
	"@inquirer/figures",
	"ansi-escapes",
	"environment",
	"cli-width",
	"mute-stream",
	"ora",
	"cli-cursor",
	"restore-cursor",
	"onetime",
	"signal-exit",
	"cli-spinners",
	"is-interactive",
	"is-unicode-supported",
	"log-symbols",
	"yoctocolors",
	"stdin-discarder",
	"string-width",
	"get-east-asian-width",
	"strip-ansi",
	"ansi-regex",
	"run-async",
	"rxjs",
	"tslib",
	"wrap-ansi",
	"ansi-styles",
	"color-convert",
	"color-name",
	"supports-color",
	"has-flag",
	"yoctocolors-cjs",
	"undici",
	"zod",
] as const;

export const trellisRuntimePackResourceCopies = [
	...trellisRuntimePackModuleNames.map((moduleName) =>
		copyWholeModule(moduleName),
	),
	copyNestedModule("onetime", "mimic-fn"),
	copyNestedModule("restore-cursor", "signal-exit"),
];
