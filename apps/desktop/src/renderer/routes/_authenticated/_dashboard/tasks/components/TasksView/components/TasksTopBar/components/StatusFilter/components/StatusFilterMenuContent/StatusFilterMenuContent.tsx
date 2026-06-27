import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { PopoverContent } from "@superset/ui/popover";
import { Check } from "lucide-react";
import { ActiveIcon } from "../../../../../shared/icons/ActiveIcon";
import { AllIssuesIcon } from "../../../../../shared/icons/AllIssuesIcon";
import { BacklogIcon } from "../../../../../shared/icons/BacklogIcon";

type TabValue = "all" | "active" | "backlog";

interface StatusFilterMenuContentProps {
	value: TabValue;
	onSelect: (value: TabValue) => void;
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

export function StatusFilterMenuContent({
	value,
	onSelect,
}: StatusFilterMenuContentProps) {
	return (
		<PopoverContent align="start" className="w-44 p-0">
			<Command>
				<CommandList>
					<CommandGroup>
						{OPTIONS.map((option) => {
							const Icon = option.Icon;
							return (
								<CommandItem
									key={option.value}
									onSelect={() => onSelect(option.value)}
								>
									<Icon className="size-3.5 shrink-0" />
									<span className="text-sm">{option.label}</span>
									{option.value === value && (
										<Check className="ml-auto size-3.5" />
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
				</CommandList>
			</Command>
		</PopoverContent>
	);
}
