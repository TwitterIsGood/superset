import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { HotkeyLabel } from "renderer/hotkeys";

export function SettingsButton() {
	const navigate = useNavigate();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/settings/account" })}
					aria-label="Open settings"
					className="no-drag"
				>
					<Settings className="size-5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8}>
				<HotkeyLabel label="Open settings" id="OPEN_SETTINGS" />
			</TooltipContent>
		</Tooltip>
	);
}
