import type { PaneActionConfig } from "@superset/panes";
import { Columns2, Rows2, X } from "lucide-react";
import { useMemo } from "react";
import { HotkeyLabel } from "renderer/hotkeys";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultPaneActions({
	launcher,
}: {
	launcher: TerminalLauncher;
}): PaneActionConfig<PaneViewerData>[] {
	return useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<Rows2 className="size-3.5" />
					) : (
						<Columns2 className="size-3.5" />
					),
				tooltip: <HotkeyLabel label="Split pane" id="SPLIT_AUTO" />,
				onClick: async (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					const terminalId = await launcher.create();
					ctx.actions.split(position, {
						kind: "terminal",
						data: { terminalId } as TerminalPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <X className="size-3.5" />,
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_PANE" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[launcher],
	);
}
