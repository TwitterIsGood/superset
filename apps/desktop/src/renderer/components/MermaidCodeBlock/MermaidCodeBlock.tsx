import { type MermaidConfig, mermaid } from "@streamdown/mermaid";
import { cn } from "@superset/ui/lib/utils";
import { useEffect, useId, useMemo, useState } from "react";

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
	isDark,
	mode = "auto",
	darkThemeVariables,
	lightThemeVariables,
	className,
}: MermaidCodeBlockProps) {
	const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const svgDataUrl = svg
		? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
		: null;
	const config: MermaidConfig = useMemo(
		() =>
			mode === "base"
				? {
						theme: "base",
						themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
					}
				: { theme: isDark ? "dark" : "default" },
		[darkThemeVariables, isDark, lightThemeVariables, mode],
	);

	useEffect(() => {
		let cancelled = false;
		setError(null);
		setSvg(null);

		mermaid
			.getMermaid(config)
			.render(`superset-mermaid-${id}`, source)
			.then(({ svg: renderedSvg }) => {
				if (!cancelled) {
					setSvg(renderedSvg);
				}
			})
			.catch((renderError) => {
				if (!cancelled) {
					setError(
						renderError instanceof Error
							? renderError.message
							: "Unable to render Mermaid diagram.",
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [config, id, source]);

	return (
		<div
			className={cn(
				"overflow-x-auto rounded-md border border-border bg-background p-4",
				className,
			)}
		>
			{error ? (
				<pre className="m-0 whitespace-pre-wrap text-destructive text-sm select-text cursor-text">
					{error}
				</pre>
			) : svg ? (
				<img
					alt="Mermaid diagram"
					className="max-w-full"
					src={svgDataUrl ?? undefined}
				/>
			) : (
				<div className="h-24 animate-pulse rounded bg-muted" />
			)}
		</div>
	);
}
