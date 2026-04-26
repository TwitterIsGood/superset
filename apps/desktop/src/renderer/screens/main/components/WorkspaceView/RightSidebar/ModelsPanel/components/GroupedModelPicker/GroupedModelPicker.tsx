import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupModelIds } from "../../utils/groupModelIds";

interface GroupedModelPickerProps {
	label: string;
	value: string;
	models: string[];
	onChange: (model: string) => void;
	disabled?: boolean;
}

export function GroupedModelPicker({
	label,
	value,
	models,
	onChange,
	disabled,
}: GroupedModelPickerProps) {
	const [open, setOpen] = useState(false);
	const selectedItemRef = useRef<HTMLDivElement | null>(null);
	const groupedModels = useMemo(() => groupModelIds(models), [models]);

	useEffect(() => {
		if (!open) return;

		const frame = requestAnimationFrame(() => {
			selectedItemRef.current?.scrollIntoView({ block: "center" });
		});

		return () => cancelAnimationFrame(frame);
	}, [open]);

	return (
		<div className="space-y-1.5 text-sm">
			<div className="font-medium">{label}</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-between font-normal"
						disabled={disabled}
					>
						<span className="truncate">{value || "Select a model"}</span>
						<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command shouldFilter={true}>
						<CommandInput placeholder="Search models..." />
						<CommandList>
							<CommandEmpty>No models found.</CommandEmpty>
							{groupedModels.map((group) => (
								<CommandGroup key={group.prefix} heading={group.prefix}>
									{group.models.map((model) => (
										<CommandItem
											key={model}
											ref={model === value ? selectedItemRef : undefined}
											value={model}
											onSelect={() => {
												onChange(model);
												setOpen(false);
											}}
										>
											<span className="flex-1 truncate">{model}</span>
											{model === value ? (
												<CheckIcon className="size-4 shrink-0 opacity-70" />
											) : null}
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
