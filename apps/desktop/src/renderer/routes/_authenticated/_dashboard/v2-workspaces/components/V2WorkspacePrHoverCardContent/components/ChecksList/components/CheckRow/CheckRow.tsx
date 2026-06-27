import { cn } from "@superset/ui/utils";
import { Check, LoaderCircle, Minus, X } from "lucide-react";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

const CHECK_ROW_CONFIG: Record<
	V2WorkspacePrSummary["checks"][number]["status"],
	{ Icon: typeof Check; className: string }
> = {
	success: { Icon: Check, className: "text-emerald-500" },
	failure: { Icon: X, className: "text-destructive-foreground" },
	pending: { Icon: LoaderCircle, className: "text-amber-500" },
	skipped: { Icon: Minus, className: "text-muted-foreground" },
	cancelled: { Icon: Minus, className: "text-muted-foreground" },
};

interface CheckRowProps {
	check: V2WorkspacePrSummary["checks"][number];
}

export function CheckRow({ check }: CheckRowProps) {
	const { Icon, className } = CHECK_ROW_CONFIG[check.status];
	const content = (
		<span className="flex items-center gap-1.5 py-0.5">
			<Icon
				className={cn(
					"size-3 shrink-0",
					className,
					check.status === "pending" && "animate-spin",
				)}
			/>
			<span className="truncate">{check.name}</span>
		</span>
	);

	if (check.url) {
		return (
			<a
				href={check.url}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(event) => event.stopPropagation()}
				className="block text-muted-foreground transition-colors hover:text-foreground"
			>
				{content}
			</a>
		);
	}

	return <div className="text-muted-foreground">{content}</div>;
}
