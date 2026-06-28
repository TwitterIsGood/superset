import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const TaskDetailPageContent = lazy(() =>
	import("./TaskDetailPageContent").then((module) => ({
		default: module.TaskDetailPageContent,
	})),
);

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	return (
		<Suspense
			fallback={
				<output
					aria-label="Loading task"
					className="flex h-full flex-1 items-center justify-center text-muted-foreground"
				/>
			}
		>
			<TaskDetailPageContent taskId={taskId} />
		</Suspense>
	);
}
