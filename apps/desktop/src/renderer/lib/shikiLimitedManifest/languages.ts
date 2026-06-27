interface LimitedLanguageDefinition {
	id: string;
	name: string;
	aliases?: string[];
	import: () => Promise<unknown>;
}

const languageDefinitions: LimitedLanguageDefinition[] = [
	{
		id: "javascript",
		name: "JavaScript",
		aliases: ["js", "mjs", "cjs"],
		import: () => import("shiki/langs/javascript.mjs"),
	},
	{
		id: "typescript",
		name: "TypeScript",
		aliases: ["ts"],
		import: () => import("shiki/langs/typescript.mjs"),
	},
	{
		id: "tsx",
		name: "TSX",
		import: () => import("shiki/langs/tsx.mjs"),
	},
	{
		id: "jsx",
		name: "JSX",
		import: () => import("shiki/langs/jsx.mjs"),
	},
	{
		id: "python",
		name: "Python",
		aliases: ["py"],
		import: () => import("shiki/langs/python.mjs"),
	},
	{
		id: "html",
		name: "HTML",
		import: () => import("shiki/langs/html.mjs"),
	},
	{
		id: "css",
		name: "CSS",
		import: () => import("shiki/langs/css.mjs"),
	},
	{
		id: "json",
		name: "JSON",
		import: () => import("shiki/langs/json.mjs"),
	},
	{
		id: "yaml",
		name: "YAML",
		aliases: ["yml"],
		import: () => import("shiki/langs/yaml.mjs"),
	},
	{
		id: "bash",
		name: "Bash",
		aliases: ["sh", "shell"],
		import: () => import("shiki/langs/bash.mjs"),
	},
	{
		id: "shellscript",
		name: "Shell",
		import: () => import("shiki/langs/shellscript.mjs"),
	},
	{
		id: "markdown",
		name: "Markdown",
		aliases: ["md"],
		import: () => import("shiki/langs/markdown.mjs"),
	},
	{
		id: "diff",
		name: "Diff",
		import: () => import("shiki/langs/diff.mjs"),
	},
	{
		id: "sql",
		name: "SQL",
		import: () => import("shiki/langs/sql.mjs"),
	},
	{
		id: "go",
		name: "Go",
		import: () => import("shiki/langs/go.mjs"),
	},
	{
		id: "rust",
		name: "Rust",
		aliases: ["rs"],
		import: () => import("shiki/langs/rust.mjs"),
	},
	{
		id: "java",
		name: "Java",
		import: () => import("shiki/langs/java.mjs"),
	},
	{
		id: "php",
		name: "PHP",
		import: () => import("shiki/langs/php.mjs"),
	},
];

export const bundledLanguagesInfo = languageDefinitions;

export const bundledLanguagesBase = Object.fromEntries(
	languageDefinitions.map((language) => [language.id, language.import]),
);

export const bundledLanguagesAlias = Object.fromEntries(
	languageDefinitions.flatMap((language) =>
		(language.aliases ?? []).map((alias) => [alias, language.import]),
	),
);

export const bundledLanguages = {
	...bundledLanguagesBase,
	...bundledLanguagesAlias,
};
