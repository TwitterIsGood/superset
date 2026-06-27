import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { AutomationDetailSearch } from "./AutomationDetailPageContent";

const AutomationDetailPageContent = lazy(() =>
	import("./AutomationDetailPageContent").then((module) => ({
		default: module.AutomationDetailPageContent,
	})),
);

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (search: Record<string, unknown>): AutomationDetailSearch => {
		const parsed: AutomationDetailSearch = {};
		if (search.editPrompt === true) parsed.editPrompt = true;
		if (search.history === true) parsed.history = true;
		if (typeof search.runId === "string") parsed.runId = search.runId;
		return parsed;
	},
});

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const search = Route.useSearch();

	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading automation"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<AutomationDetailPageContent
				automationId={automationId}
				search={search}
			/>
		</Suspense>
	);
}
