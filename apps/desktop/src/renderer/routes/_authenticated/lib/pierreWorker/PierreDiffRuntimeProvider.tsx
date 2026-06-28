import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { createPierreWorker } from "./pierreWorker";

interface PierreDiffRuntimeProviderProps {
	children: ReactNode;
}

export function PierreDiffRuntimeProvider({
	children,
}: PierreDiffRuntimeProviderProps) {
	return (
		<WorkerPoolContextProvider
			poolOptions={{ workerFactory: createPierreWorker, poolSize: 2 }}
			highlighterOptions={{ preferredHighlighter: "shiki-js" }}
		>
			{children}
		</WorkerPoolContextProvider>
	);
}
