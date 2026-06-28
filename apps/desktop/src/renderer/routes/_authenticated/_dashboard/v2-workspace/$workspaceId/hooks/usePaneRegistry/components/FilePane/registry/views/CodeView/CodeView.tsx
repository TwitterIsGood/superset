import { lazy, Suspense } from "react";
import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";

const LazyCodeEditor = lazy(async () => ({
	default: (await import("./components/CodeEditor")).CodeEditor,
}));

export function CodeView({ document, filePath }: ViewProps) {
	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<Suspense
			fallback={<div className="h-full w-full animate-pulse bg-muted/20" />}
		>
			<LazyCodeEditor
				key={document.id}
				value={document.content.value}
				language={detectLanguage(filePath)}
				onChange={(next) => document.setContent(next)}
				onSave={() => void document.save()}
				fillHeight
			/>
		</Suspense>
	);
}
