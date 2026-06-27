import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Clock, LoaderCircle, Pause, Play, Save, Trash2 } from "lucide-react";

interface AutomationDetailHeaderProps {
	name: string;
	enabled: boolean;
	mode?: "detail" | "editPrompt";
	onBack: () => void;
	onToggleEnabled: () => void;
	onDelete: () => void;
	onRunNow: () => void;
	onOpenHistory: () => void;
	onCancelPromptEdit?: () => void;
	onSavePrompt?: () => void;
	toggleDisabled?: boolean;
	deleteDisabled?: boolean;
	runNowDisabled?: boolean;
	savePromptDisabled?: boolean;
	savePromptPending?: boolean;
}

export function AutomationDetailHeader({
	name,
	enabled,
	mode = "detail",
	onBack,
	onToggleEnabled,
	onDelete,
	onRunNow,
	onOpenHistory,
	onCancelPromptEdit,
	onSavePrompt,
	toggleDisabled,
	deleteDisabled,
	runNowDisabled,
	savePromptDisabled,
	savePromptPending,
}: AutomationDetailHeaderProps) {
	return (
		<header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
			<Breadcrumb>
				<BreadcrumbList className="text-sm">
					<BreadcrumbItem>
						<BreadcrumbLink onClick={onBack} className="cursor-pointer">
							Automations
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage className="font-medium">{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex items-center gap-1">
				{mode === "editPrompt" ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 px-3"
							onClick={onCancelPromptEdit}
							disabled={savePromptPending}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							className="h-8 gap-1.5 px-3"
							onClick={onSavePrompt}
							disabled={savePromptDisabled || savePromptPending}
						>
							{savePromptPending ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Save className="size-4" />
							)}
							<span>Save</span>
						</Button>
					</>
				) : (
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onOpenHistory}
									aria-label="Version history"
								>
									<Clock className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Version history</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onToggleEnabled}
									disabled={toggleDisabled}
									aria-label={enabled ? "Pause" : "Resume"}
								>
									{enabled ? (
										<Pause className="size-4" />
									) : (
										<Play className="size-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>{enabled ? "Pause" : "Resume"}</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onDelete}
									disabled={deleteDisabled}
									aria-label="Delete"
								>
									<Trash2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Delete</TooltipContent>
						</Tooltip>
						<div className="mx-1 h-4 w-px bg-border" />
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 px-3"
							onClick={onRunNow}
							disabled={runNowDisabled}
						>
							<Play className="size-4" />
							<span>Run now</span>
						</Button>
					</>
				)}
			</div>
		</header>
	);
}
