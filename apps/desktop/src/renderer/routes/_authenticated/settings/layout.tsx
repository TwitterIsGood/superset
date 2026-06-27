import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
	component: SettingsLayout,
});

const LazySettingsLayoutContent = lazy(() =>
	import("./SettingsLayoutContent").then((module) => ({
		default: module.SettingsLayoutContent,
	})),
);

function SettingsLayout() {
	return (
		<Suspense fallback={null}>
			<LazySettingsLayoutContent />
		</Suspense>
	);
}
