import { Progress } from "@superset/ui/progress";
import { cn } from "@superset/ui/utils";

interface PackLoadingStateProps {
	title: string;
	description: string;
	progressPercent?: number | null;
	className?: string;
}

export function PackLoadingState({
	title,
	description,
	progressPercent = null,
	className,
}: PackLoadingStateProps) {
	return (
		<div className={cn("min-w-0 flex-1", className)}>
			<div className="truncate text-xs font-medium text-foreground">
				{title}
			</div>
			<div className="truncate text-[11px] text-muted-foreground">
				{progressPercent !== null
					? `${description} ${progressPercent}%`
					: description}
			</div>
			{progressPercent !== null && (
				<Progress
					className="mt-1 h-1 bg-muted"
					value={Math.max(0, Math.min(100, progressPercent))}
				/>
			)}
		</div>
	);
}
