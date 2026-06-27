import { Button } from "@superset/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";
import { TaskActionMenu } from "../TaskActionMenu";

interface TaskDetailHeaderProps {
	task: TaskWithStatus;
	onBack: () => void;
	onDelete?: () => void;
}

export function TaskDetailHeader({
	task,
	onBack,
	onDelete,
}: TaskDetailHeaderProps) {
	return (
		<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8"
				onClick={onBack}
				aria-label="Back to tasks"
			>
				<ArrowLeft className="w-4 h-4" />
			</Button>
			<span className="text-sm text-muted-foreground">{task.slug}</span>
			<div className="ml-auto flex items-center gap-1">
				{task.externalUrl && (
					<a
						href={task.externalUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-muted-foreground hover:text-foreground transition-colors p-2"
						title="Open in Linear"
					>
						<ExternalLink className="w-4 h-4" />
					</a>
				)}
				<TaskActionMenu task={task} onDelete={onDelete} />
			</div>
		</div>
	);
}
