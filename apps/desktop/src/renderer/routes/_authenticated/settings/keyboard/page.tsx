import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const KeyboardShortcutsPageContent = lazy(() =>
	import("./KeyboardShortcutsPageContent").then((module) => ({
		default: module.KeyboardShortcutsPageContent,
	})),
);

export const Route = createFileRoute("/_authenticated/settings/keyboard/")({
	component: KeyboardShortcutsPage,
});

function KeyboardShortcutsPage() {
	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading keyboard shortcuts"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<KeyboardShortcutsPageContent />
		</Suspense>
	);
}
