import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { HotkeyLabel } from "renderer/hotkeys";

export function RightSidebarToggle() {
	const { preferences, setRightSidebarOpen } = useV2UserPreferences();
	const isOpen = preferences.rightSidebarOpen;

	const toggle = () => setRightSidebarOpen((prev) => !prev);

	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<PanelRightOpen className="size-4" strokeWidth={1.5} />
			) : (
				<PanelRight className="size-4" strokeWidth={1.5} />
			);
		}
		return isHovering ? (
			<PanelRightClose className="size-4" strokeWidth={1.5} />
		) : (
			<PanelRight className="size-4" strokeWidth={1.5} />
		);
	};

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={
						isOpen ? "Close workspace sidebar" : "Open workspace sidebar"
					}
					data-testid="workspace-right-sidebar-toggle"
					onClick={toggle}
					className="no-drag group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">
				<HotkeyLabel label="Toggle sidebar" id="TOGGLE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
