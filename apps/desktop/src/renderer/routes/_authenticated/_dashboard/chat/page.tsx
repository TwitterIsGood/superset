import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { ChatSearch } from "./ChatHomePageContent";

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

const ChatHomePageContent = lazy(() =>
	import("./ChatHomePageContent").then((module) => ({
		default: module.ChatHomePageContent,
	})),
);

export const Route = createFileRoute("/_authenticated/_dashboard/chat/")({
	component: ChatHomePage,
	validateSearch: (raw: Record<string, unknown>): ChatSearch => ({
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
	}),
});

function ChatHomePage() {
	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading chat"
					className="flex h-full w-full flex-1 items-center justify-center"
				/>
			}
		>
			<ChatHomePageContent />
		</Suspense>
	);
}
