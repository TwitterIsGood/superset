import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";
import type { WorkspaceSearch } from "./V2WorkspacePageContent";

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

const V2WorkspacePageContent = lazy(() =>
	import("./V2WorkspacePageContent").then((module) => ({
		default: module.V2WorkspacePageContent,
	})),
);

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		terminalId: parseNonEmptyString(raw.terminalId),
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const search = Route.useSearch();

	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading workspace"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<V2WorkspacePageContent search={search} />
		</Suspense>
	);
}
