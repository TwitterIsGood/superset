import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { RotateCcw } from "lucide-react";

interface PackErrorStateProps {
	title: string;
	description: string;
	actionLabel?: string;
	className?: string;
	isRetrying?: boolean;
	onRetry?: () => void;
}

export function PackErrorState({
	title,
	description,
	actionLabel = "Retry",
	className,
	isRetrying = false,
	onRetry,
}: PackErrorStateProps) {
	return (
		<div className={cn("flex min-w-0 flex-1 items-start gap-2", className)}>
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium text-foreground">
					{title}
				</div>
				<div className="truncate text-[11px] text-muted-foreground">
					{description}
				</div>
			</div>
			{onRetry && (
				<Button
					className="h-6 shrink-0 gap-1 px-2 text-[11px]"
					disabled={isRetrying}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onRetry();
					}}
					size="sm"
					type="button"
					variant="ghost"
				>
					<RotateCcw className={cn("size-3", isRetrying && "animate-spin")} />
					{actionLabel}
				</Button>
			)}
		</div>
	);
}
