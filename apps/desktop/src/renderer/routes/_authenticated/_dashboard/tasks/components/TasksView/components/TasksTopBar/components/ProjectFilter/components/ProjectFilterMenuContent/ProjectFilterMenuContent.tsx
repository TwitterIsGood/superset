import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { PopoverContent } from "@superset/ui/popover";
import { Check, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { PROJECTLESS_TASKS_FILTER } from "../../../../../../../../stores/tasks-filter-state";
import type { ProjectFilterProject } from "../../ProjectFilter";

interface ProjectFilterMenuContentProps {
	value: string | null;
	includeTaskOptions: boolean;
	isProjectless: boolean;
	projects: ProjectFilterProject[];
	onSelect: (value: string | null) => void;
}

export function ProjectFilterMenuContent({
	value,
	includeTaskOptions,
	isProjectless,
	projects,
	onSelect,
}: ProjectFilterMenuContentProps) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;
		return projects.filter((project) =>
			project.name.toLowerCase().includes(query),
		);
	}, [projects, search]);

	return (
		<PopoverContent align="start" className="w-60 p-0">
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search projects..."
					value={search}
					onValueChange={setSearch}
				/>
				<CommandList className="max-h-80">
					{filtered.length === 0 && search && (
						<CommandEmpty>No projects found.</CommandEmpty>
					)}
					{includeTaskOptions && (
						<CommandGroup>
							<CommandItem onSelect={() => onSelect(null)}>
								<Folder className="size-4 shrink-0 text-muted-foreground" />
								<span className="text-sm truncate">All tasks</span>
								{value === null && (
									<Check className="ml-auto size-3.5 shrink-0" />
								)}
							</CommandItem>
							<CommandItem onSelect={() => onSelect(PROJECTLESS_TASKS_FILTER)}>
								<Folder className="size-4 shrink-0 text-muted-foreground" />
								<span className="text-sm truncate">No project</span>
								{isProjectless && (
									<Check className="ml-auto size-3.5 shrink-0" />
								)}
							</CommandItem>
						</CommandGroup>
					)}
					{filtered.length > 0 && (
						<CommandGroup>
							{filtered.map((project) => (
								<CommandItem
									key={project.id}
									onSelect={() => onSelect(project.id)}
								>
									<ProjectThumbnail
										projectName={project.name}
										iconUrl={project.iconUrl}
										className="size-4 shrink-0 rounded-[3px]"
									/>
									<span className="text-sm truncate">{project.name}</span>
									{project.id === value && (
										<Check className="ml-auto size-3.5 shrink-0" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</Command>
		</PopoverContent>
	);
}
