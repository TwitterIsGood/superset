import { Button } from "@superset/ui/button";
import { Popover, PopoverTrigger } from "@superset/ui/popover";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import CircleUserRound from "lucide-react/dist/esm/icons/circle-user-round.js";
import { lazy, Suspense, useState } from "react";

interface AssigneeFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

const AssigneeFilterMenuContent = lazy(() =>
	import(
		"./components/AssigneeFilterMenuContent/AssigneeFilterMenuContent"
	).then((module) => ({
		default: module.AssigneeFilterMenuContent,
	})),
);

function getAssigneeTriggerLabel(value: string | null): string {
	if (value === "unassigned") return "Unassigned";
	if (value?.startsWith("ext:")) return "External";
	return "Assignee";
}

export function AssigneeFilter({ value, onChange }: AssigneeFilterProps) {
	const [open, setOpen] = useState(false);
	const triggerLabel = getAssigneeTriggerLabel(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={triggerLabel}
					aria-label={triggerLabel}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<CircleUserRound className="size-4" />
					<span className="text-sm hidden @4xl:inline">{triggerLabel}</span>
					<ChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			{open ? (
				<Suspense fallback={null}>
					<AssigneeFilterMenuContent
						value={value}
						onChange={onChange}
						onClose={() => setOpen(false)}
					/>
				</Suspense>
			) : null}
		</Popover>
	);
}
