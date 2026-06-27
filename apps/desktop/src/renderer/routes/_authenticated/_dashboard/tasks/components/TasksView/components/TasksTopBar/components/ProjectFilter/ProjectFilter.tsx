import { Button } from "@superset/ui/button";
import { Popover, PopoverTrigger } from "@superset/ui/popover";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import Folder from "lucide-react/dist/esm/icons/folder.js";
import { lazy, Suspense, useMemo, useState } from "react";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { isProjectlessTaskFilter } from "../../../../../../stores/tasks-filter-state";

export interface ProjectFilterProject {
	id: string;
	name: string;
	iconUrl?: string | null;
}

interface ProjectFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	includeTaskOptions?: boolean;
	projects: ProjectFilterProject[];
}

const ProjectFilterMenuContent = lazy(() =>
	import("./components/ProjectFilterMenuContent/ProjectFilterMenuContent").then(
		(module) => ({
			default: module.ProjectFilterMenuContent,
		}),
	),
);

export function ProjectFilter({
	value,
	onChange,
	includeTaskOptions = false,
	projects,
}: ProjectFilterProps) {
	const [open, setOpen] = useState(false);

	const selected = useMemo(
		() => (value ? (projects.find((p) => p.id === value) ?? null) : null),
		[value, projects],
	);
	const isProjectless = isProjectlessTaskFilter(value);
	const triggerLabel = selected
		? selected.name
		: isProjectless
			? "No project"
			: includeTaskOptions
				? "All tasks"
				: "Project";

	const handleSelect = (id: string | null) => {
		onChange(id);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={triggerLabel}
					aria-label={triggerLabel}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selected ? (
						<ProjectThumbnail
							projectName={selected.name}
							iconUrl={selected.iconUrl}
							className="size-4 rounded-[3px]"
						/>
					) : (
						<Folder className="size-4" />
					)}
					<span className="text-sm hidden @4xl:inline">{triggerLabel}</span>
					<ChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			{open ? (
				<Suspense fallback={null}>
					<ProjectFilterMenuContent
						value={value}
						includeTaskOptions={includeTaskOptions}
						isProjectless={isProjectless}
						projects={projects}
						onSelect={handleSelect}
					/>
				</Suspense>
			) : null}
		</Popover>
	);
}
