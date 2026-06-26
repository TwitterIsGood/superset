import { type MermaidConfig, mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

type MermaidThemeMode = "auto" | "base";

interface MermaidCodeBlockProps {
	source: string;
	isDark: boolean;
	mode?: MermaidThemeMode;
	darkThemeVariables?: Record<string, string>;
	lightThemeVariables?: Record<string, string>;
	className?: string;
}

const mermaidPlugins = { mermaid };

export function MermaidCodeBlock({
	source,
	isDark,
	mode = "auto",
	darkThemeVariables,
	lightThemeVariables,
	className,
}: MermaidCodeBlockProps) {
	const config: MermaidConfig =
		mode === "base"
			? {
					theme: "base",
					themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
				}
			: { theme: isDark ? "dark" : "default" };

	return (
		<div className={className}>
			<Streamdown mode="static" plugins={mermaidPlugins} mermaid={{ config }}>
				{`\`\`\`mermaid\n${source}\n\`\`\``}
			</Streamdown>
		</div>
	);
}
