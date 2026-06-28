import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-workspace")(
	{
		component: V2WorkspaceLayout,
	},
);

const LazyV2WorkspaceLayoutContent = lazy(() =>
	import("./V2WorkspaceLayoutContent").then((module) => ({
		default: module.V2WorkspaceLayoutContent,
	})),
);

function V2WorkspaceLayout() {
	return (
		<Suspense fallback={null}>
			<LazyV2WorkspaceLayoutContent />
		</Suspense>
	);
}
