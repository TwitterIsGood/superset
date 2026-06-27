import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { PopoverContent } from "@superset/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { Check, CircleUserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

type Tab = "all" | "internal" | "external";

interface AssigneeFilterMenuContentProps {
	value: string | null;
	onChange: (value: string | null) => void;
	onClose: () => void;
}

export function AssigneeFilterMenuContent({
	value,
	onChange,
	onClose,
}: AssigneeFilterMenuContentProps) {
	const collections = useCollections();
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<Tab>("all");

	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const externalAssignees = useMemo(() => {
		if (!allTasks) return [];
		const seen = new Map<
			string,
			{ id: string; name: string | null; avatar: string | null }
		>();
		for (const task of allTasks) {
			if (task.assigneeExternalId && !seen.has(task.assigneeExternalId)) {
				seen.set(task.assigneeExternalId, {
					id: task.assigneeExternalId,
					name: task.assigneeDisplayName,
					avatar: task.assigneeAvatarUrl,
				});
			}
		}
		return [...seen.values()];
	}, [allTasks]);

	const query = search.toLowerCase();

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(user) =>
					user.name?.toLowerCase().includes(query) ||
					user.email?.toLowerCase().includes(query),
			),
		[users, query],
	);

	const filteredExternal = useMemo(
		() =>
			externalAssignees.filter(
				(assignee) => !query || assignee.name?.toLowerCase().includes(query),
			),
		[externalAssignees, query],
	);

	const visibleUsers = tab === "external" ? [] : filteredUsers;
	const visibleExternal = tab === "internal" ? [] : filteredExternal;
	const hasResults = visibleUsers.length > 0 || visibleExternal.length > 0;

	const [canScroll, setCanScroll] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);

	const checkScroll = useCallback(() => {
		const element = listRef.current;
		if (!element) return;
		const hasOverflow = element.scrollHeight > element.clientHeight;
		const atBottom =
			element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
		setCanScroll(hasOverflow && !atBottom);
	}, []);

	useEffect(() => {
		checkScroll();
	}, [checkScroll]);

	const handleSelect = (userId: string | null) => {
		onChange(userId);
		onClose();
	};

	return (
		<PopoverContent align="start" className="w-60 p-0">
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search people..."
					value={search}
					onValueChange={setSearch}
				/>
				<div className="flex items-center gap-0.5 border-b px-2 py-1.5">
					{(["all", "internal", "external"] as const).map((nextTab) => (
						<button
							key={nextTab}
							type="button"
							onClick={() => setTab(nextTab)}
							className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
								tab === nextTab
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{nextTab === "all"
								? "All"
								: nextTab === "internal"
									? "Internal"
									: "External"}
						</button>
					))}
				</div>
				<div className="relative">
					<CommandList
						ref={listRef}
						className="max-h-80"
						onScroll={checkScroll}
					>
						<CommandGroup>
							<CommandItem onSelect={() => handleSelect(null)}>
								<span className="text-sm">All assignees</span>
								{value === null && <Check className="ml-auto size-3.5" />}
							</CommandItem>
							<CommandItem onSelect={() => handleSelect("unassigned")}>
								<CircleUserRound className="size-4" />
								<span className="text-sm">Unassigned</span>
								{value === "unassigned" && (
									<Check className="ml-auto size-3.5" />
								)}
							</CommandItem>
						</CommandGroup>

						{!hasResults && search && (
							<CommandEmpty>No people found.</CommandEmpty>
						)}

						{visibleUsers.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup
									heading={
										tab === "all" && visibleExternal.length > 0
											? "Internal"
											: undefined
									}
								>
									{visibleUsers.map((user) => (
										<CommandItem
											key={user.id}
											onSelect={() => handleSelect(user.id)}
										>
											<Avatar
												size="xs"
												fullName={user.name}
												image={user.image}
											/>
											<div className="flex flex-col min-w-0">
												<span className="text-sm truncate">{user.name}</span>
												<span className="text-xs text-muted-foreground truncate">
													{user.email}
												</span>
											</div>
											{user.id === value && (
												<Check className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}

						{visibleExternal.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup
									heading={
										tab === "all" && visibleUsers.length > 0
											? "External"
											: undefined
									}
								>
									{visibleExternal.map((assignee) => (
										<CommandItem
											key={assignee.id}
											onSelect={() => handleSelect(`ext:${assignee.id}`)}
										>
											<Avatar
												size="xs"
												fullName={assignee.name || "External"}
												image={assignee.avatar}
											/>
											<span className="text-sm truncate">
												{assignee.name || "External"}
											</span>
											{value === `ext:${assignee.id}` && (
												<Check className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</CommandList>
					{canScroll && (
						<div
							className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover to-transparent"
							aria-hidden="true"
						/>
					)}
				</div>
			</Command>
		</PopoverContent>
	);
}
