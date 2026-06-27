import PanelsTopLeft from "lucide-react/dist/esm/icons/panels-top-left.js";

interface AllIssuesIconProps {
	color?: string;
	className?: string;
}

export function AllIssuesIcon({
	color = "currentColor",
	className,
}: AllIssuesIconProps) {
	return <PanelsTopLeft className={className} style={{ color }} />;
}
