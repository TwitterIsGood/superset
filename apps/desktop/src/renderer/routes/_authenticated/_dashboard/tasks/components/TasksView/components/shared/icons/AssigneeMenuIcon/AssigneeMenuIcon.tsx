import { CircleUserRound } from "lucide-react";

interface AssigneeMenuIconProps {
	color?: string;
	className?: string;
}

export function AssigneeMenuIcon({
	color = "currentColor",
	className,
}: AssigneeMenuIconProps) {
	return <CircleUserRound className={className} style={{ color }} />;
}
