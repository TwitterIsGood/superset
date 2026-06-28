import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Cpu } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRenderStressInstrumentation } from "renderer/lib/performance/stress-instrumentation";

const LazyResourceConsumptionContent = lazy(() =>
	import("./ResourceConsumptionContent").then((module) => ({
		default: module.ResourceConsumptionContent,
	})),
);

interface ResourceConsumptionProps {
	surface?: "v1" | "v2";
	className?: string;
}

export function ResourceConsumption({
	surface = "v1",
	className,
}: ResourceConsumptionProps) {
	const [open, setOpen] = useState(false);
	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	useRenderStressInstrumentation("ResourceConsumptionTrigger", {
		warnAt: 25,
		getDetails: () => ({ open, surface }),
	});

	if (!enabled) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Resource consumption"
							className={cn(
								"no-drag relative text-muted-foreground hover:text-foreground",
								className,
							)}
						>
							<Cpu className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
					Resources
				</TooltipContent>
			</Tooltip>

			{open && (
				<Suspense fallback={null}>
					<LazyResourceConsumptionContent
						surface={surface}
						onClose={() => setOpen(false)}
					/>
				</Suspense>
			)}
		</Popover>
	);
}
