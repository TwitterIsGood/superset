import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	Bell,
	Brain,
	Building2,
	Cpu,
	CreditCard,
	FlaskConical,
	Folder,
	GitBranch,
	Keyboard,
	KeyRound,
	Link as LinkIcon,
	Lock,
	Monitor,
	Paintbrush,
	Puzzle,
	ShieldCheck,
	Sparkles,
	SquareTerminal,
	User,
	Users,
	Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/account"
	| "/settings/organization"
	| "/settings/teams"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/git"
	| "/settings/agents"
	| "/settings/tools-and-skills"
	| "/settings/terminal"
	| "/settings/links"
	| "/settings/models"
	| "/settings/experimental"
	| "/settings/integrations"
	| "/settings/billing"
	| "/settings/api-keys"
	| "/settings/security"
	| "/settings/permissions"
	| "/settings/projects"
	| "/settings/hosts";

interface SectionItem {
	id: SettingsRoute;
	section: SettingsSection;
	label: string;
	icon: React.ReactNode;
	macOnly?: boolean;
}

interface SectionGroup {
	label: string;
	items: SectionItem[];
}

const SECTION_GROUPS: SectionGroup[] = [
	{
		label: "Personal",
		items: [
			{
				id: "/settings/account",
				section: "account",
				label: "Account",
				icon: <User className="h-4 w-4" />,
			},
			{
				id: "/settings/appearance",
				section: "appearance",
				label: "Appearance",
				icon: <Paintbrush className="h-4 w-4" />,
			},
			{
				id: "/settings/ringtones",
				section: "ringtones",
				label: "Notifications",
				icon: <Bell className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Editor & Workflow",
		items: [
			{
				id: "/settings/behavior",
				section: "behavior",
				label: "General",
				icon: <Sparkles className="h-4 w-4" />,
			},
			{
				id: "/settings/keyboard",
				section: "keyboard",
				label: "Keyboard",
				icon: <Keyboard className="h-4 w-4" />,
			},
			{
				id: "/settings/git",
				section: "git",
				label: "Git & Worktrees",
				icon: <GitBranch className="h-4 w-4" />,
			},
			{
				id: "/settings/agents",
				section: "agents",
				label: "Agents",
				icon: <Cpu className="h-4 w-4" />,
			},
			{
				id: "/settings/tools-and-skills",
				section: "toolsAndSkills",
				label: "Tools & Skills",
				icon: <Wrench className="h-4 w-4" />,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				label: "Terminal",
				icon: <SquareTerminal className="h-4 w-4" />,
			},
			{
				id: "/settings/links",
				section: "links",
				label: "Links",
				icon: <LinkIcon className="h-4 w-4" />,
			},
			{
				id: "/settings/models",
				section: "models",
				label: "Models",
				icon: <Brain className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Organization",
		items: [
			{
				id: "/settings/organization",
				section: "organization",
				label: "Organization",
				icon: <Building2 className="h-4 w-4" />,
			},
			{
				id: "/settings/teams",
				section: "teams",
				label: "Teams",
				icon: <Users className="h-4 w-4" />,
			},
			{
				id: "/settings/projects",
				section: "project",
				label: "Projects",
				icon: <Folder className="h-4 w-4" />,
			},
			{
				id: "/settings/hosts",
				section: "hosts",
				label: "Hosts",
				icon: <Monitor className="h-4 w-4" />,
			},
			{
				id: "/settings/integrations",
				section: "integrations",
				label: "Integrations",
				icon: <Puzzle className="h-4 w-4" />,
			},
			{
				id: "/settings/billing",
				section: "billing",
				label: "Billing",
				icon: <CreditCard className="h-4 w-4" />,
			},
			{
				id: "/settings/api-keys",
				section: "apikeys",
				label: "API Keys",
				icon: <KeyRound className="h-4 w-4" />,
			},
		],
	},
	{
		label: "System",
		items: [
			{
				id: "/settings/security",
				section: "security",
				label: "Security",
				icon: <Lock className="h-4 w-4" />,
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				label: "Permissions",
				icon: <ShieldCheck className="h-4 w-4" />,
				macOnly: true,
			},
			{
				id: "/settings/experimental",
				section: "experimental",
				label: "Experimental",
				icon: <FlaskConical className="h-4 w-4" />,
			},
		],
	},
];

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const allowedSections = useMemo(() => getAllowedSectionsForVariant(true), []);

	return (
		<>
			{SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter(
					(item) =>
						(!item.macOnly || isMac) && allowedSections.has(item.section),
				);
				const filteredItems = matchCounts
					? platformItems.filter((item) => (matchCounts[item.section] ?? 0) > 0)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.1em] px-3 mb-1">
							{group.label}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = matchCounts?.[section.section];

								return (
									<Link
										key={section.id}
										to={section.id}
										className={cn(
											"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
											isActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
										)}
									>
										{section.icon}
										<span className="flex-1">{section.label}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
												{count}
											</span>
										)}
									</Link>
								);
							})}
						</nav>
					</div>
				);
			})}
		</>
	);
}
