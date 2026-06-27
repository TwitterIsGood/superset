import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { ChevronsUpDown } from "lucide-react";
import type * as React from "react";

type PickerTriggerProps = Omit<
	React.ComponentProps<typeof Button>,
	"children"
> & {
	icon?: React.ReactNode;
	label: React.ReactNode;
	/** Rendered after the label and before the chevron (e.g. status dot). */
	endAdornment?: React.ReactNode;
	contentClassName?: string;
	labelClassName?: string;
};

export function PickerTrigger({
	icon,
	label,
	endAdornment,
	contentClassName,
	labelClassName,
	className,
	variant = "ghost",
	...props
}: PickerTriggerProps) {
	return (
		<Button
			variant={variant}
			{...props}
			className={cn("justify-between gap-1 px-2 text-xs", className)}
		>
			<span
				className={cn(
					"flex min-w-0 flex-1 items-center gap-1.5",
					contentClassName,
				)}
			>
				{icon}
				<span className={cn("truncate text-left", labelClassName)}>
					{label}
				</span>
				{endAdornment}
			</span>
			<ChevronsUpDown className="size-3 shrink-0" />
		</Button>
	);
}
