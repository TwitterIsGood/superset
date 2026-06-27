import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const AutomationsPageContent = lazy(() =>
	import("./AutomationsPageContent").then((module) => ({
		default: module.AutomationsPageContent,
	})),
);

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

function AutomationsPage() {
	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading automations"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<AutomationsPageContent />
		</Suspense>
	);
}
