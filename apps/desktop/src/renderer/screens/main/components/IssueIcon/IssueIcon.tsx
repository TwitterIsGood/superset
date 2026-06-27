import { cn } from "@superset/ui/utils";
import { CircleCheck, CircleDot } from "lucide-react";

export type IssueState = "open" | "closed";

interface IssueIconProps {
	state: IssueState;
	className?: string;
}

const stateStyles: Record<IssueState, string> = {
	open: "text-emerald-500",
	closed: "text-violet-500",
};

/**
 * Renders an issue icon with color based on state.
 * - open: green dot icon
 * - closed: purple/violet check icon
 */
export function IssueIcon({ state, className }: IssueIconProps) {
	const baseClass = cn(stateStyles[state], className);

	if (state === "closed") {
		return <CircleCheck className={baseClass} />;
	}

	// open
	return <CircleDot className={baseClass} />;
}
