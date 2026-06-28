export * from "shiki/core";
export {
	createHighlighterCore as createHighlighter,
	normalizeTheme,
} from "shiki/core";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";
export { createOnigurumaEngine } from "shiki/engine/oniguruma";
export {
	bundledLanguages,
	bundledLanguagesAlias,
	bundledLanguagesBase,
	bundledLanguagesInfo,
} from "./languages";
export { bundledThemes, bundledThemesInfo } from "./themes";
