import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

export function createMarkdownLowlight() {
	const lowlight = createLowlight({
		bash,
		css,
		javascript,
		json,
		markdown,
		plaintext,
		python,
		sql,
		typescript,
		xml,
		yaml,
	});

	lowlight.registerAlias({
		bash: ["shell", "sh"],
		xml: ["html"],
		yaml: ["yml"],
	});

	return lowlight;
}
