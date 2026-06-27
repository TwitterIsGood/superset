import { Button } from "@superset/ui/button";
import { FileText, Pencil, Play } from "lucide-react";

interface AutomationNoRunsPanelProps {
	onEditPrompt: () => void;
	onRunNow: () => void;
	runNowDisabled?: boolean;
}

export function AutomationNoRunsPanel({
	onEditPrompt,
	onRunNow,
	runNowDisabled,
}: AutomationNoRunsPanelProps) {
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
			<div className="flex size-12 items-center justify-center rounded-full border bg-muted/30">
				<FileText className="size-6 text-muted-foreground" />
			</div>
			<div>
				<h2 className="text-sm font-medium">No runs yet</h2>
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">
					Run this Automation to see its report here.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={onEditPrompt}>
					<Pencil className="size-4" />
					Edit prompt
				</Button>
				<Button size="sm" onClick={onRunNow} disabled={runNowDisabled}>
					<Play className="size-4" />
					Run now
				</Button>
			</div>
		</div>
	);
}
