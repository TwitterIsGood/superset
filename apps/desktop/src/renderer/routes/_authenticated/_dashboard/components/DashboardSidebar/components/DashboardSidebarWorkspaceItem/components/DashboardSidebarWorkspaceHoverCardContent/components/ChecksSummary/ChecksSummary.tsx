import { Check, LoaderCircle, X } from "lucide-react";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { DashboardSidebarWorkspacePullRequestCheck } from "../../../../../../types";

interface ChecksSummaryProps {
	checks: DashboardSidebarWorkspacePullRequestCheck[];
	status: "success" | "failure" | "pending" | "none";
}

export function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	if (status === "none") return null;

	const passing = checks.filter((check) => check.status === "success").length;
	const total = checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	).length;

	const config = {
		success: {
			icon: Check,
			className: "text-emerald-500",
		},
		failure: {
			icon: X,
			className: "text-destructive-foreground",
		},
		pending: {
			icon: LoaderCircle,
			className: "text-amber-500",
		},
	};

	const { icon: Icon, className } = config[status];
	const label = total > 0 ? `${passing}/${total} checks` : "Checks";

	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<Icon
				className={`size-3 ${status === "pending" ? "animate-spin" : ""}`}
				strokeWidth={STROKE_WIDTH}
			/>
			<span>{label}</span>
		</span>
	);
}
