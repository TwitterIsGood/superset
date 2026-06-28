import type { ChatLaunchConfig } from "shared/tabs-types";
import type { TabsState } from "./types";

export function stripPersistedChatLaunchAttachments(
	launchConfig: ChatLaunchConfig | null | undefined,
): ChatLaunchConfig | null {
	if (!launchConfig) {
		return null;
	}

	const { initialFiles: _initialFiles, ...slimLaunchConfig } = launchConfig;
	return slimLaunchConfig;
}

export function createPersistedTabsState(state: TabsState): TabsState {
	let hasChanges = false;
	const panes = Object.fromEntries(
		Object.entries(state.panes).map(([paneId, pane]) => {
			if (pane.type !== "chat" || !pane.chat?.launchConfig?.initialFiles) {
				return [paneId, pane];
			}

			hasChanges = true;
			return [
				paneId,
				{
					...pane,
					chat: {
						...pane.chat,
						launchConfig: stripPersistedChatLaunchAttachments(
							pane.chat.launchConfig,
						),
					},
				},
			];
		}),
	);

	return hasChanges ? { ...state, panes } : state;
}
