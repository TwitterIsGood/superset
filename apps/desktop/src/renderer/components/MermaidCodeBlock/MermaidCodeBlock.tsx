import { cn } from "@superset/ui/lib/utils";

type MermaidThemeMode = "auto" | "base";

interface MermaidCodeBlockProps {
	source: string;
	isDark: boolean;
	mode?: MermaidThemeMode;
	darkThemeVariables?: Record<string, string>;
	lightThemeVariables?: Record<string, string>;
	className?: string;
}

export function MermaidCodeBlock({
	source,
	mode = "auto",
	darkThemeVariables,
	lightThemeVariables,
	className,
}: MermaidCodeBlockProps) {
	void mode;
	void darkThemeVariables;
	void lightThemeVariables;

	return (
		<div
			className={cn(
				"overflow-x-auto rounded-md border border-border bg-background p-4",
				className,
			)}
		>
			<pre className="m-0 whitespace-pre-wrap text-sm select-text cursor-text">
				{source}
			</pre>
		</div>
	);
}
