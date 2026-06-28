import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PlansPageContent = lazy(() =>
	import("./PlansPageContent").then((module) => ({
		default: module.PlansPageContent,
	})),
);

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

function PlansPage() {
	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading billing plans"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<PlansPageContent />
		</Suspense>
	);
}
