import { CodeBlock } from "@superset/ui/ai-elements/code-block";
import { lazy, type ReactNode, Suspense } from "react";
import { useTheme } from "renderer/stores";
import type { BundledLanguage } from "shiki";

const LazyMermaidCodeBlock = lazy(() =>
	import("renderer/components/MermaidCodeBlock").then((module) => ({
		default: module.MermaidCodeBlock,
	})),
);

const MERMAID_DARK_VARS = {
	background: "#1e1e2e",
	primaryColor: "#313244",
	primaryTextColor: "#cdd6f4",
	primaryBorderColor: "#45475a",
	secondaryColor: "#313244",
	secondaryTextColor: "#cdd6f4",
	secondaryBorderColor: "#45475a",
	tertiaryColor: "#313244",
	tertiaryTextColor: "#cdd6f4",
	tertiaryBorderColor: "#45475a",
	nodeBorder: "#45475a",
	nodeTextColor: "#cdd6f4",
	mainBkg: "#313244",
	clusterBkg: "#1e1e2e",
	titleColor: "#cdd6f4",
	edgeLabelBackground: "transparent",
	lineColor: "#6c7086",
	textColor: "#cdd6f4",
};

const MERMAID_LIGHT_VARS = {
	background: "#ffffff",
	primaryColor: "#f0f0f4",
	primaryTextColor: "#1e1e2e",
	primaryBorderColor: "#d0d0d8",
	lineColor: "#888",
	textColor: "#1e1e2e",
};

interface CommentCodeBlockProps {
	className?: string;
	children?: ReactNode;
}

/**
 * Lightweight code renderer for PR comments. Skips ShowCode's
 * line-number/copy chrome — too heavy for short inline review snippets.
 */
export function CommentCodeBlock({
	className,
	children,
}: CommentCodeBlockProps) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	if (language === "mermaid") {
		return (
			<Suspense fallback={<pre>{codeString}</pre>}>
				<LazyMermaidCodeBlock
					source={codeString}
					isDark={isDark}
					mode="base"
					darkThemeVariables={MERMAID_DARK_VARS}
					lightThemeVariables={MERMAID_LIGHT_VARS}
				/>
			</Suspense>
		);
	}

	if (!language) {
		return (
			<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
				{children}
			</code>
		);
	}

	return (
		<CodeBlock
			code={codeString}
			language={language as BundledLanguage}
			className="border-0 bg-muted/50 text-sm"
		/>
	);
}
