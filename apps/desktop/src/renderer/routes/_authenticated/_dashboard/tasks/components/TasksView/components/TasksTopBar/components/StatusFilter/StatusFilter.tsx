import { Button } from "@superset/ui/button";
import { Popover, PopoverTrigger } from "@superset/ui/popover";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import { lazy, Suspense, useState } from "react";
import { ActiveIcon } from "../../../shared/icons/ActiveIcon";
import { AllIssuesIcon } from "../../../shared/icons/AllIssuesIcon";
import { BacklogIcon } from "../../../shared/icons/BacklogIcon";

type TabValue = "all" | "active" | "backlog";

interface StatusFilterProps {
	value: TabValue;
	onChange: (value: TabValue) => void;
}

const OPTIONS: ReadonlyArray<{
	value: TabValue;
	label: string;
	Icon: typeof AllIssuesIcon;
}> = [
	{ value: "all", label: "All tasks", Icon: AllIssuesIcon },
	{ value: "active", label: "Active", Icon: ActiveIcon },
	{ value: "backlog", label: "Backlog", Icon: BacklogIcon },
];

const StatusFilterMenuContent = lazy(() =>
	import("./components/StatusFilterMenuContent/StatusFilterMenuContent").then(
		(module) => ({
			default: module.StatusFilterMenuContent,
		}),
	),
);

export function StatusFilter({ value, onChange }: StatusFilterProps) {
	const [open, setOpen] = useState(false);
	const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
	const SelectedIcon = selected.Icon;

	const handleSelect = (next: TabValue) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={selected.label}
					aria-label={selected.label}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<SelectedIcon className="size-3.5" />
					<span className="text-sm hidden @4xl:inline">{selected.label}</span>
					<ChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			{open ? (
				<Suspense fallback={null}>
					<StatusFilterMenuContent value={value} onSelect={handleSelect} />
				</Suspense>
			) : null}
		</Popover>
	);
}
