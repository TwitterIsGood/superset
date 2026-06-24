/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "WorkspaceMobileShell.tsx"),
	"utf8",
);
const templateDollar = "$";

describe("WorkspaceMobileShell ACP and terminal boundaries", () => {
	test("keeps terminal snapshots out of ACP chat messages", () => {
		expect(SOURCE).not.toContain("terminalAssistantMessage");
		expect(SOURCE).not.toContain("mobile-terminal-");

		const terminalEffectStart = SOURCE.indexOf("terminal polling is keyed");
		expect(terminalEffectStart).toBeGreaterThan(0);

		const terminalEffectEnd = SOURCE.indexOf(
			"const selectTerminalSession",
			terminalEffectStart,
		);
		expect(terminalEffectEnd).toBeGreaterThan(terminalEffectStart);

		const snapshotEffect = SOURCE.slice(terminalEffectStart, terminalEffectEnd);
		expect(snapshotEffect).toContain("getTerminalSnapshot");
		expect(snapshotEffect).toContain("setActiveTerminalRun");
		expect(snapshotEffect).toContain("mergeTerminalSnapshotIntoRun");
		expect(snapshotEffect).not.toContain("setMessages");
		expect(snapshotEffect).not.toContain("terminalOutputText");
	});

	test("does not replay stale terminal tail when attaching existing TUI sessions", () => {
		expect(SOURCE).toContain("suppressReplayUntilDelta");
		expect(SOURCE).toContain("usesScreenSnapshotBaseline");
		expect(SOURCE).toContain("mergeTerminalSnapshotState");
		expect(SOURCE).toContain("./utils/terminalSnapshotMerge");
		expect(SOURCE).toContain("terminalRawTailByIdRef");
		expect(SOURCE).toContain("redrawnTerminalIdsRef");
		expect(SOURCE).toContain('data: "\\u000c"');
		expect(SOURCE).toContain(
			"activeTerminalRun.hasLoadedSnapshot &&\n\t\t\tactiveTerminalRun.suppressReplayUntilDelta",
		);
		expect(SOURCE).toContain(
			"requestTerminalRedraw(activeTerminalRun.terminalId)",
		);

		const selectTerminalIndex = SOURCE.indexOf("const selectTerminalSession");
		const createTerminalIndex = SOURCE.indexOf(
			"const handleCreateTerminalSession",
		);
		expect(selectTerminalIndex).toBeGreaterThan(0);
		expect(createTerminalIndex).toBeGreaterThan(selectTerminalIndex);

		const selectTerminal = SOURCE.slice(
			selectTerminalIndex,
			createTerminalIndex,
		);
		expect(selectTerminal).toContain("suppressReplayUntilDelta: true");

		const createTerminal = SOURCE.slice(
			createTerminalIndex,
			SOURCE.indexOf("const handleSelectPanel", createTerminalIndex),
		);
		expect(createTerminal).toContain("suppressReplayUntilDelta: true");
		expect(createTerminal).toContain("usesScreenSnapshotBaseline: false");
		expect(SOURCE).toContain("replayInitialSnapshot");
		expect(SOURCE).toContain('liveSocket.state === "error"');
		expect(SOURCE).toContain("suppressReplayUntilDelta: false");
	});

	test("does not clear ordinary desktop shell history before initial snapshot replay", () => {
		expect(SOURCE).toContain("mergeTerminalSnapshotState(current, snapshot");
		expect(SOURCE).toContain(
			"previousRawTail: terminalRawTailByIdRef.current.get(current.terminalId)",
		);
		expect(SOURCE).toContain(
			"terminalRawTailByIdRef.current.set(\n\t\t\t\tcurrent.terminalId,\n\t\t\t\tresult.nextRawTail",
		);
		expect(SOURCE).not.toContain(
			"const shouldRequestRedraw = !redrawnTerminalIdsRef.current.has",
		);
	});

	test("does not expose ACP Chat as a backend agent label", () => {
		expect(SOURCE).toContain("Claude Code");
		expect(SOURCE).not.toContain("ACP Chat");
		expect(SOURCE).not.toContain("Superset ACP");
		expect(SOURCE).not.toContain("ACP 后端");
		expect(SOURCE).not.toContain("ACP 对话模型");
		expect(SOURCE).not.toContain("Structured ACP chat");
	});

	test("uses Codex-style native mobile chrome instead of desktop controls", () => {
		expect(SOURCE).toContain("expo-glass-effect");
		expect(SOURCE).toContain("ActionSheetIOS");
		expect(SOURCE).toContain("showNativeAgentSelector");
		expect(SOURCE).toContain("showNativeModelSelector");
		expect(SOURCE).toContain("showNativeWindowSwitcher");
		expect(SOURCE).toContain("showNativePermissionSelector");
		expect(SOURCE).toContain("showNativeQuestionSelector");
		expect(SOURCE).toContain("showNativePlanSelector");
		expect(SOURCE).toContain("showNativePendingActionSelector");
		expect(SOURCE).toContain("showNativeChatActions");
		expect(SOURCE).toContain("showNativeTerminalActions");
		expect(SOURCE).toContain("AdaptiveGlassSurface");
		expect(SOURCE).toContain("shellStyles.composerSurface");
		expect(SOURCE).toContain("shellStyles.sheetSurface");
		expect(SOURCE).toContain("compactWorkspaceTitle");
		expect(SOURCE).toContain("workspaceDisplayTitle");
		expect(SOURCE).toContain("\tModal,");
		expect(SOURCE).toContain("<Modal");
		expect(SOURCE).toContain('presentationStyle="overFullScreen"');
		expect(SOURCE).toContain('accessibilityLabel="Back to workspaces"');
		expect(SOURCE).toContain("router.back()");
		expect(SOURCE).toContain('accessibilityLabel="New conversation"');
		expect(SOURCE).toContain('accessibilityLabel="Conversation actions"');
		expect(SOURCE).toContain('accessibilityLabel="Terminal actions"');
		expect(SOURCE).toContain("新终端");
		expect(SOURCE).toContain("新对话");
		expect(SOURCE).toContain("sheetTitle");
		expect(SOURCE).toContain("workspace-terminal-switcher-sheet");
		expect(SOURCE).toContain("SquarePen");
		expect(SOURCE).toContain("Ellipsis");
		expect(SOURCE).toContain("ShieldAlert");
		expect(SOURCE).toContain("ChevronLeft");
		expect(SOURCE).toContain("切换会话");
		expect(SOURCE).toContain('"Agent"');
		expect(SOURCE).toContain('"模型"');
		expect(SOURCE).toContain("accessibilityLabel={pendingActionLabel}");
		expect(SOURCE).toContain("Review permission request");
		expect(SOURCE).toContain("shellStyles.terminalAccessorySurface");
		expect(SOURCE).not.toContain("renderChatHeaderRuntimeControls");
		expect(SOURCE).not.toContain("renderTerminalHeaderRuntimeControls");
		expect(SOURCE).not.toContain("Open conversation switcher");
		expect(SOURCE).not.toContain("Open worktree window switcher");
		expect(SOURCE).not.toContain("选择当前对话使用的后端 Agent");
	});

	test("treats missing mobile v2 workspace routes as a stale API server", () => {
		expect(SOURCE).toContain("Mobile is connected to an older Superset API");
		expect(SOURCE).toContain("Missing route:");
		expect(SOURCE).toContain('message.includes("v2Workspace.")');
	});

	test("maps host auth and relay failures to mobile runtime states", () => {
		expect(SOURCE).toContain("Host service is not authenticated with Superset");
		expect(SOURCE).toContain("Open the desktop app on that computer");
		expect(SOURCE).toContain("Host is not online");
		expect(SOURCE).toContain("Relay 暂时无法连接这台主机。");
		expect(SOURCE).toContain("const effectiveHostIsOnline");
		expect(SOURCE).toContain("terminalListError");
		expect(SOURCE).toContain("hostUpdatedAtKey");
		expect(SOURCE).toContain('if (isOnline === true) return "主机在线"');
		expect(SOURCE).toContain('"可控制"');
		expect(SOURCE).toContain('"主机离线"');
		expect(SOURCE).toContain("拥有这个 Worktree 的电脑当前离线。");
	});

	test("retries host-control routes after transient relay failures", () => {
		expect(SOURCE).toContain("let nextDelayMs: number | null = 5000");
		expect(SOURCE).toContain("let nextDelayMs: number | null = 1000");
		expect(SOURCE).toContain("nextDelayMs = relayUnavailable ? 5000 : 10_000");
		expect(SOURCE).toContain("if (!relayUnavailable)");
		expect(SOURCE).toContain("nextDelayMs = terminalGone ? null : 5000");
		expect(SOURCE).toContain("if (nextDelayMs !== null)");
	});

	test("renders host-disconnected chat as an offline state, not an unusable model picker", () => {
		expect(SOURCE).toContain("displayedActiveWindowTitle");
		expect(SOURCE).toContain("? hostControlLabel");
		expect(SOURCE).toContain("{canUseHost ? null : (");
		expect(SOURCE).toContain("{hostControlMessage}");
		expect(SOURCE).toContain("disabled={!canUseHost || agentIsRunning}");
		expect(SOURCE).toContain("disabled={!canUseHost || creatingConversation}");
		expect(SOURCE).toContain("Workspace host is unavailable");
		expect(SOURCE).toContain("hostDrawerStatus");
		expect(SOURCE).not.toContain("headerHostStatusLabel");
		expect(SOURCE).not.toContain("selectedModelLabel");
		expect(SOURCE).not.toContain("shouldShowChatModelRuntimeChip");
		expect(SOURCE).toContain("if (messages.length === 0) return null;");
		expect(SOURCE).toContain("LockKeyhole");
	});

	test("switches real worktree windows instead of chat-only rows", () => {
		expect(SOURCE).toContain("WorktreeWindowListItem");
		expect(SOURCE).toContain("worktreeWindowItems");
		expect(SOURCE).toContain("type ActiveSurfaceKind");
		expect(SOURCE).toContain("activeSurfaceKind");
		expect(SOURCE).toContain(
			'type TerminalActionsSheetMode = "actions" | "model" | "switcher"',
		);
		expect(SOURCE).toContain("apiClient.v2Workspace.listTerminals.query");
		expect(SOURCE).toContain("apiClient.v2Workspace.writeTerminalInput.mutate");
		expect(SOURCE).toContain("handleCreateTerminalWindow");
		expect(SOURCE).toContain("handleCreateConversation");
		expect(SOURCE).toContain("handleSelectPanel");
		expect(SOURCE).toContain("showNativeWindowSwitcher");
		expect(SOURCE).toContain("openTerminalSwitcherSheet");
		expect(SOURCE).toContain('setTerminalActionsSheetMode("switcher")');
		expect(SOURCE).toContain("renderTerminalSwitcherSheetContent");
		expect(SOURCE).toContain('testID="workspace-terminal-switcher-sheet"');
		expect(SOURCE).toContain("handleSelectPanel(item)");
		expect(SOURCE).not.toContain("worktreeWindowItems[buttonIndex - 3]");
		expect(SOURCE).not.toContain('const options = ["取消", "新终端", "新对话"');
		expect(SOURCE).toContain("新终端");
		expect(SOURCE).toContain("新对话");
		expect(SOURCE).toContain('item.kind === "terminal"');
		expect(SOURCE).not.toContain("handleSelectChat");

		const nativeWindowSwitcherStart = SOURCE.indexOf(
			"const showNativeWindowSwitcher = () =>",
		);
		const nativeWindowSwitcherEnd = SOURCE.indexOf(
			"const showNativeChatActions = () =>",
			nativeWindowSwitcherStart,
		);
		expect(nativeWindowSwitcherStart).toBeGreaterThan(0);
		expect(nativeWindowSwitcherEnd).toBeGreaterThan(nativeWindowSwitcherStart);
		const nativeWindowSwitcher = SOURCE.slice(
			nativeWindowSwitcherStart,
			nativeWindowSwitcherEnd,
		);
		expect(nativeWindowSwitcher).toContain("openTerminalSwitcherSheet()");
		expect(nativeWindowSwitcher).not.toContain("showActionSheetWithOptions");
		expect(nativeWindowSwitcher).not.toContain("buttonIndex");

		const switcherStart = SOURCE.indexOf("const renderSwitcher = () =>");
		const finalReturn = SOURCE.indexOf("\n\treturn (", switcherStart);
		expect(switcherStart).toBeGreaterThan(0);
		expect(finalReturn).toBeGreaterThan(switcherStart);
		const switcher = SOURCE.slice(switcherStart, finalReturn);
		expect(switcher).toContain('Platform.OS === "ios"');
		expect(switcher).toContain("会话");
		expect(switcher).toContain("新终端");
		expect(switcher).toContain("新对话");
		expect(switcher).toContain("暂无会话");
		expect(switcher).toContain("终端会话不可用");
		expect(switcher).not.toContain("Windows");
		expect(switcher).not.toContain("Tools");
		expect(switcher).not.toContain("Back to Workspace");
	});

	test("switches away from stale terminal ids after host session discovery refreshes", () => {
		expect(SOURCE).toContain("const activeTerminalIsLive =");
		expect(SOURCE).toContain("terminal.terminalId === activeTerminalId");
		expect(SOURCE).toContain("!terminal.exited");
		expect(SOURCE).toContain("if (activeTerminalIsLive) return;");
		expect(SOURCE).toContain("const latestTerminal = [...terminalSessions]");
		expect(SOURCE).toContain("selectTerminalSession(latestTerminal)");
		expect(SOURCE).toContain("terminalListError");
		expect(SOURCE).toContain("loadingTerminals");
	});

	test("waits for terminal discovery before auto-creating a mobile terminal", () => {
		expect(SOURCE).toContain("terminalDiscoveryReadyWorkspaceId");
		expect(SOURCE).toContain(
			"terminalDiscoveryReadyWorkspaceId === workspace.id",
		);
		expect(SOURCE).toContain("setTerminalDiscoveryReadyWorkspaceId(null)");
		expect(SOURCE).toContain(
			"setTerminalDiscoveryReadyWorkspaceId(workspace.id)",
		);

		const autoCreateStart = SOURCE.indexOf(
			'if (activeSurfaceKind !== "terminal" || activeTerminalRun) return;',
		);
		expect(autoCreateStart).toBeGreaterThan(0);
		const autoCreateEnd = SOURCE.indexOf(
			"void handleCreateTerminalSession();",
			autoCreateStart,
		);
		expect(autoCreateEnd).toBeGreaterThan(autoCreateStart);
		const autoCreateEffect = SOURCE.slice(
			autoCreateStart,
			autoCreateEnd + "void handleCreateTerminalSession();".length,
		);

		expect(autoCreateEffect).toContain("!terminalDiscoveryReady");
		expect(autoCreateEffect).toContain("loadingTerminals");
		expect(autoCreateEffect).toContain("terminalListError");
		expect(autoCreateEffect).toContain("selectTerminalSession(latestTerminal)");
		expect(autoCreateEffect.indexOf("!terminalDiscoveryReady")).toBeLessThan(
			autoCreateEffect.indexOf("void handleCreateTerminalSession();"),
		);
		expect(
			autoCreateEffect.indexOf("selectTerminalSession(latestTerminal)"),
		).toBeLessThan(
			autoCreateEffect.indexOf("void handleCreateTerminalSession();"),
		);
	});

	test("supports native worktree session management including terminal deletion", () => {
		expect(SOURCE).toContain("conversationSwipeStartRef");
		expect(SOURCE).toContain("Trash2");
		expect(SOURCE).toContain("conversationSelectionMode");
		expect(SOURCE).toContain("selectedConversationIds");
		expect(SOURCE).toContain("openSwipedConversationId");
		expect(SOURCE).toContain("optimisticallyDeletedConversationIds");
		expect(SOURCE).toContain("conversationDeleteError");
		expect(SOURCE).toContain("conversationManagementNotice");
		expect(SOURCE).toContain("clearDeletedActiveConversation");
		expect(SOURCE).toContain("apiClient.chat.deleteSession.mutate");
		expect(SOURCE).toContain("apiClient.v2Workspace.deleteTerminal.mutate");

		const deleteHandlerStart = SOURCE.indexOf(
			"const handleDeleteConversations = useCallback",
		);
		const selectPanelStart = SOURCE.indexOf(
			"const handleSelectPanel =",
			deleteHandlerStart,
		);
		expect(deleteHandlerStart).toBeGreaterThan(0);
		expect(selectPanelStart).toBeGreaterThan(deleteHandlerStart);
		const deleteHandler = SOURCE.slice(deleteHandlerStart, selectPanelStart);
		expect(deleteHandler).toContain("setOptimisticallyDeletedConversationIds");
		expect(deleteHandler).toContain(
			"clearDeletedActiveConversation(deletedChatIds)",
		);
		expect(deleteHandler).toContain("localSessionIds.has(item.resourceId)");
		expect(deleteHandler).toContain("apiClient.chat.deleteSession.mutate");
		expect(deleteHandler).toContain(
			"apiClient.v2Workspace.deleteTerminal.mutate",
		);
		expect(deleteHandler).toContain("setTerminalSessions((current)");
		expect(deleteHandler).toContain("setTerminalLiveStatus((current)");
		expect(deleteHandler).toContain(
			"selectTerminalSession(nextActiveTerminal)",
		);
		expect(deleteHandler).toContain("failedChatIds.length > 0");
		expect(deleteHandler).toContain("failedTerminalIds.length > 0");
		expect(deleteHandler).toContain(
			"for (const sessionId of failedChatIds) next.delete(sessionId);",
		);

		const selectPanelEnd = SOURCE.indexOf(
			"useEffect(() => {\n\t\tif (\n\t\t\t!initialTerminalId",
			selectPanelStart,
		);
		expect(selectPanelEnd).toBeGreaterThan(selectPanelStart);
		const selectPanel = SOURCE.slice(selectPanelStart, selectPanelEnd);
		expect(selectPanel).toContain("conversationSelectionMode");
		expect(selectPanel).toContain(
			"toggleConversationSelection(item.resourceId)",
		);
		expect(selectPanel.indexOf("conversationSelectionMode")).toBeLessThan(
			selectPanel.indexOf('item.kind === "chat"'),
		);
		expect(selectPanel.indexOf("toggleConversationSelection")).toBeLessThan(
			selectPanel.indexOf('setActiveSurfaceKind("chat")'),
		);
		expect(selectPanel.indexOf("toggleConversationSelection")).toBeLessThan(
			selectPanel.indexOf('setActiveSurfaceKind("terminal")'),
		);
		expect(selectPanel).toContain('setActiveSurfaceKind("chat")');
		expect(selectPanel).toContain('setActiveSurfaceKind("terminal")');
	});

	test("uses long press multi-select and swipe-to-delete for chat and terminal rows", () => {
		const rowStart = SOURCE.indexOf("const renderWorktreeWindowRow =");
		const headerStart = SOURCE.indexOf(
			"const renderConversationListHeader =",
			rowStart,
		);
		expect(rowStart).toBeGreaterThan(0);
		expect(headerStart).toBeGreaterThan(rowStart);
		const rowRenderer = SOURCE.slice(rowStart, headerStart);

		expect(rowRenderer).toContain(
			'const canDelete = item.kind === "chat" || item.kind === "terminal";',
		);
		expect(rowRenderer).toContain(
			'const WindowIcon = item.kind === "terminal" ? Terminal : MessageSquare;',
		);
		expect(rowRenderer).toContain(
			"const conversationSelectionTapZoneWidth = 56;",
		);
		expect(rowRenderer).toContain(
			"event.nativeEvent.locationX <= conversationSelectionTapZoneWidth",
		);
		expect(rowRenderer).toContain("enterConversationSelectionMode();");
		expect(rowRenderer).toContain(
			"onLongPress={() => handleConversationLongPress(item)}",
		);
		expect(rowRenderer).toContain("delayLongPress={280}");
		expect(rowRenderer).toContain(
			'accessibilityHint={\n\t\t\t\t\tcanDelete ? "Long press to select, swipe left to delete" : undefined\n\t\t\t\t}',
		);
		expect(rowRenderer).toContain("conversationSelectionMode && canDelete ? (");
		expect(rowRenderer).toContain("event.stopPropagation()");
		expect(rowRenderer).toContain(
			"toggleConversationSelection(item.resourceId);",
		);
		expect(rowRenderer).toContain(
			`testID={\`workspace-window-selection-${templateDollar}{item.resourceId}\`}`,
		);
		expect(rowRenderer).toContain('accessibilityRole="checkbox"');
		expect(rowRenderer).toContain(
			"if (!canDelete || conversationSelectionMode)",
		);
		expect(rowRenderer).toContain("shellStyles.worktreeWindowRowSheet");
		expect(rowRenderer).toContain("shellStyles.worktreeWindowRowDrawer");
		expect(rowRenderer).toContain("shellStyles.worktreeWindowRowSelectedSheet");
		expect(rowRenderer).toContain('className="flex-row items-center gap-3"');
		expect(rowRenderer).toContain("<Pressable");
		expect(rowRenderer).toContain("shouldSuppressConversationPress");
		expect(rowRenderer).toContain("onTouchStart");
		expect(rowRenderer).toContain("onTouchMove");
		expect(rowRenderer).toContain("onTouchEnd");
		expect(SOURCE).toContain("dx < -28");
		expect(SOURCE).toContain("Math.abs(dx) > Math.abs(dy) * 1.2");
		expect(SOURCE).toContain("suppressedConversationPressRef.current");
		expect(SOURCE).toContain("setOpenSwipedConversationId(item.resourceId)");
		expect(SOURCE).not.toContain("终端会话暂不支持左滑删除");
		expect(rowRenderer).toContain("renderConversationDeleteAction");
		expect(rowRenderer).toContain(
			`testID={\`workspace-window-swipe-${templateDollar}{item.resourceId}\`}`,
		);
		expect(SOURCE).toContain("apiClient.v2Workspace.deleteTerminal.mutate");

		const longPressStart = SOURCE.indexOf(
			"const handleConversationLongPress = useCallback",
		);
		const exitSelectionStart = SOURCE.indexOf(
			"const handleExitConversationSelection",
			longPressStart,
		);
		expect(longPressStart).toBeGreaterThan(0);
		expect(exitSelectionStart).toBeGreaterThan(longPressStart);
		const longPressHandler = SOURCE.slice(longPressStart, exitSelectionStart);
		expect(longPressHandler).not.toContain('item.kind !== "chat"');
		expect(longPressHandler).not.toContain("终端会话暂不支持在手机端删除");
		expect(longPressHandler).toContain(
			"deletingConversationIds.has(item.resourceId)",
		);
		expect(longPressHandler).toContain("enterConversationSelectionMode()");
		expect(longPressHandler).toContain(
			"toggleConversationSelection(item.resourceId)",
		);
		expect(SOURCE).toContain(
			"const enterConversationSelectionMode = useCallback",
		);
		expect(SOURCE).toContain("const renderConversationManagementActions =");
		expect(SOURCE).toContain(
			'accessibilityLabel="Cancel conversation selection"',
		);
		expect(SOURCE).toContain('accessibilityLabel="Delete selected sessions"');
		expect(SOURCE).not.toContain("conversationHeaderAction");
	});

	test("uses real native styles for switcher row spacing", () => {
		const stylesStart = SOURCE.indexOf("const shellStyles = StyleSheet.create");
		expect(stylesStart).toBeGreaterThan(0);
		const styles = SOURCE.slice(stylesStart);

		expect(styles).toContain("worktreeWindowRowSheet");
		expect(styles).toContain("minHeight: 58");
		expect(styles).toContain("marginBottom: 8");
		expect(styles).toContain("paddingVertical: 12");
		expect(styles).toContain("worktreeWindowRowDrawer");
		expect(styles).toContain("minHeight: 54");
		expect(styles).toContain("marginBottom: 6");
		expect(styles).toContain("paddingVertical: 10");
		expect(styles).toContain("conversationManagementAction");
		expect(styles).toContain("minHeight: 52");
	});

	test("does not show terminal-only no-delete hints now that terminals have a delete lifecycle", () => {
		expect(SOURCE).toContain("const conversationManagementHint =");
		expect(SOURCE).not.toContain(
			"当前只有终端会话；长按/左滑删除只适用于对话。",
		);
		expect(SOURCE).not.toContain("终端会话暂不支持");
		expect(SOURCE).toContain("const renderConversationManagementHint =");
		expect(SOURCE).toContain('testID="workspace-window-management-hint"');
		expect(SOURCE).toContain('renderConversationManagementHint("sheet")');
		expect(SOURCE).toContain('renderConversationManagementHint("drawer")');
	});

	test("renders the same managed conversation rows in both iOS sheet and fallback drawer", () => {
		const sheetStart = SOURCE.indexOf(
			"const renderTerminalSwitcherSheetContent = () =>",
		);
		const actionsSheetStart = SOURCE.indexOf(
			"const renderTerminalActionsSheet = () =>",
			sheetStart,
		);
		const drawerStart = SOURCE.indexOf("const renderSwitcher = () =>");
		const finalReturn = SOURCE.indexOf("\n\treturn (", drawerStart);
		expect(sheetStart).toBeGreaterThan(0);
		expect(actionsSheetStart).toBeGreaterThan(sheetStart);
		expect(drawerStart).toBeGreaterThan(0);
		expect(finalReturn).toBeGreaterThan(drawerStart);

		const sheet = SOURCE.slice(sheetStart, actionsSheetStart);
		const drawer = SOURCE.slice(drawerStart, finalReturn);
		expect(sheet).toContain("<GestureScrollView");
		expect(sheet).toContain("renderConversationListHeader()");
		expect(sheet).toContain('renderConversationManagementActions("sheet")');
		expect(sheet).toContain('renderConversationManagementHint("sheet")');
		expect(sheet).toContain("renderWorktreeWindowRow(item, {");
		expect(sheet).toContain('variant: "sheet"');
		expect(sheet).toContain("conversationDeleteError");
		expect(drawer).toContain("<GestureScrollView");
		expect(drawer).toContain("renderConversationListHeader()");
		expect(drawer).toContain('renderConversationManagementActions("drawer")');
		expect(drawer).toContain('renderConversationManagementHint("drawer")');
		expect(drawer).toContain("renderWorktreeWindowRow(item, {");
		expect(drawer).toContain('variant: "drawer"');
		expect(drawer).toContain("conversationDeleteError");
		expect(drawer).not.toContain("const WindowIcon =");
		expect(drawer).not.toContain("onPress={() => handleSelectPanel(item)}");
	});

	test("opens worktree detail on the real Terminal surface by default", () => {
		expect(SOURCE).toContain(
			'const [selectedAgentId, setSelectedAgentId] = useState("claude")',
		);
		expect(SOURCE).toContain(
			'const [activeSurfaceKind, setActiveSurfaceKind] =\n\t\tuseState<ActiveSurfaceKind>("terminal")',
		);
		expect(SOURCE).toContain('? (activeTerminalRun?.label ?? "Terminal")');
		expect(SOURCE).toContain("handleCreateTerminalWindow");
		expect(SOURCE).toContain('accessibilityLabel="New terminal"');

		const agentSelectionStart = SOURCE.indexOf(
			"if (\n\t\t\tagentOptions.some(",
		);
		expect(agentSelectionStart).toBeGreaterThan(0);
		const agentSelectionEnd = SOURCE.indexOf(
			"setSelectedModelId(chatModels[0]?.id ?? null);",
			agentSelectionStart,
		);
		expect(agentSelectionEnd).toBeGreaterThan(agentSelectionStart);
		const agentSelection = SOURCE.slice(agentSelectionStart, agentSelectionEnd);
		expect(agentSelection).toContain('activeSurfaceKind === "terminal"');
		expect(agentSelection).toContain(
			'agentOptions.find((agent) => agent.kind === "terminal")',
		);
		expect(agentSelection).toContain(
			'agentOptions.find((agent) => agent.kind === "chat")',
		);
		expect(agentSelection).not.toContain(
			"const nextAgent = agentOptions[0] ?? fallbackAgentOptions[0];",
		);
	});

	test("keeps bottom worktree window rows tappable above the host footer", () => {
		const switcherStart = SOURCE.indexOf(
			"const renderTerminalSwitcherSheetContent = () =>",
		);
		const switcherEnd = SOURCE.indexOf(
			"const renderTerminalActionsSheet = () =>",
			switcherStart,
		);
		expect(switcherStart).toBeGreaterThan(0);
		expect(switcherEnd).toBeGreaterThan(switcherStart);

		const switcher = SOURCE.slice(switcherStart, switcherEnd);
		expect(switcher).toContain("const switcherSheetMaxHeight = Math.max");
		expect(switcher).toContain(
			"const switcherSheetBottomPadding = Math.max(insets.bottom + 88, 116)",
		);
		expect(switcher).toContain("paddingBottom: switcherSheetBottomPadding");
		expect(switcher).toContain("maxHeight: switcherSheetMaxHeight");
		expect(switcher).toContain("alwaysBounceVertical={false}");
		expect(switcher).toContain('keyboardShouldPersistTaps="handled"');
		expect(switcher).toContain("renderWorktreeWindowRow(item, {");
		expect(SOURCE).toContain('accessibilityRole="button"');
		expect(SOURCE).toContain(
			"accessibilityLabel={`" +
				templateDollar +
				"{item.title}, " +
				templateDollar +
				"{item.subtitle}`}",
		);
		expect(SOURCE).toContain("hitSlop={4}");
	});

	test("uses the selected worktree window to choose the active surface", () => {
		const returnIndex = SOURCE.indexOf(
			"return (",
			SOURCE.indexOf("renderSwitcher"),
		);
		expect(returnIndex).toBeGreaterThan(0);
		const finalRender = SOURCE.slice(returnIndex);
		expect(finalRender).toContain('activeSurfaceKind === "chat"');
		expect(finalRender).not.toContain(
			'selectedAgent.kind === "chat"\n\t\t\t\t? renderChatSurface',
		);
		expect(SOURCE).toContain('setActiveSurfaceKind("chat")');
		expect(SOURCE).toContain('setActiveSurfaceKind("terminal")');
	});

	test("renders terminal output through the xterm WebView surface", () => {
		const terminalSurfaceIndex = SOURCE.indexOf("const renderTerminalKey");
		const composerIndex = SOURCE.indexOf(
			"const renderComposer",
			terminalSurfaceIndex,
		);
		expect(terminalSurfaceIndex).toBeGreaterThan(0);
		expect(composerIndex).toBeGreaterThan(terminalSurfaceIndex);

		const terminalSurface = SOURCE.slice(terminalSurfaceIndex, composerIndex);
		expect(terminalSurface).toContain("terminalKeyButtons");
		expect(terminalSurface).toContain("handleSendTerminalKey");
		expect(terminalSurface).toContain("renderTerminalControls");
		expect(terminalSurface).toContain("handleDismissTerminalKeyboard");
		expect(terminalSurface).toContain("terminalKeyboardAccessoryVisible");
		expect(terminalSurface).not.toContain("renderTerminalInput");
		expect(terminalSurface).not.toContain("handleSubmitTerminalInput");
		expect(terminalSurface).not.toContain("terminalInputDraft");
		expect(terminalSurface).not.toContain("TextInput");
		expect(terminalSurface).toContain("TerminalEmulator");
		expect(terminalSurface).toContain("output={activeTerminalRun.outputTail}");
		expect(terminalSurface).toContain(
			"restoreRevision={activeTerminalRun.restoreRevision}",
		);
		expect(terminalSurface).toContain("inputCommand={terminalInputCommand}");
		expect(terminalSurface).toContain(
			"terminalDimensions={activeTerminalRun.terminalDimensions}",
		);
		expect(terminalSurface).toContain(
			"screenSnapshot={activeTerminalRun.screenSnapshot}",
		);
		expect(terminalSurface).toContain("onInput");
		expect(terminalSurface).toContain(
			"onLocalResize={handleTerminalLocalResize}",
		);
		expect(terminalSurface).toContain("onResize={handleTerminalResize}");
		expect(SOURCE).toContain("apiClient.v2Workspace.createTerminal.mutate");
		expect(SOURCE).toContain("handleCreateTerminalSession");
		expect(SOURCE).toContain('accessibilityLabel="New terminal"');
		expect(SOURCE).toContain("apiClient.v2Workspace.createTerminal.mutate");
		expect(SOURCE).toContain("handleTerminalResize");
		expect(SOURCE).toContain("handleTerminalLocalResize");
		expect(SOURCE).toContain("handleSendTerminalData");
		expect(SOURCE).toContain("../TerminalEmulator");
		expect(terminalSurface).toContain("font-mono");
		expect(terminalSurface).not.toContain("terminalScrollViewRef");
		expect(terminalSurface).not.toContain("outputText");
		expect(terminalSurface).not.toContain("renderComposer()");
		expect(terminalSurface).not.toContain("renderTerminalAgentLauncher");
		expect(SOURCE).not.toContain("terminalInputPlaceholder");
		expect(terminalSurface).not.toContain("handlePickAttachments");
		expect(terminalSurface).not.toContain("Attach files");
		expect(terminalSurface).not.toContain("Paperclip");
		expect(terminalSurface).not.toContain("items-end");
		expect(terminalSurface).not.toContain("rounded-[18px] bg-[#f2f2f4]");
	});

	test("attaches terminal output through the relay WebSocket before falling back to polling", () => {
		expect(SOURCE).toContain("type TerminalLiveConnectionState");
		expect(SOURCE).toContain("type TerminalLiveControlMessage");
		expect(SOURCE).toContain("terminalLiveSocketRef");
		expect(SOURCE).toContain("terminalLiveFrameFromData");
		expect(SOURCE).toContain(
			"apiClient.v2Workspace.getTerminalAttachDescriptor.query",
		);
		expect(SOURCE).toContain("new WebSocket(descriptor.webSocketUrl)");
		expect(SOURCE).toContain('socket.binaryType = "arraybuffer"');
		expect(SOURCE).toContain("terminalDimensionsFromRecord(message)");
		expect(SOURCE).toContain("terminalLiveTransportIsActive");
		expect(SOURCE).toContain("terminalLiveTransportCanReplacePolling");
		expect(SOURCE).toContain("shouldShowTerminalWaitingIndicator");
		expect(SOURCE).toContain("cloudCanUseHost &&");
		expect(SOURCE).toContain("activeTerminalRun.outputTail.length === 0");
		expect(SOURCE).toContain("!activeTerminalRun.hasLoadedSnapshot");
		expect(SOURCE).toContain('activeTerminalLiveStatus?.state !== "error"');
		expect(SOURCE).toContain("!activeTerminalRun.errorMessage");
		expect(SOURCE).toContain("!snapshotError");
		expect(SOURCE).toContain("{shouldShowTerminalWaitingIndicator ? (");
		expect(SOURCE).toContain(
			"terminalLiveSocketRef.current?.receivedBytes === true",
		);
		expect(SOURCE).toContain("terminalLiveSnapshotReconcileIntervalMs");
		expect(SOURCE).toContain("terminalSnapshotPollIntervalMs");
		expect(SOURCE).toContain("current.outputTail + frame.text");
		expect(SOURCE).toContain("replay: false");
		expect(SOURCE).not.toContain("replay: !liveRef.receivedBytes");
		expect(SOURCE).toContain(
			"terminalRawTailByIdRef.current.set(\n\t\t\t\tcurrent.terminalId,\n\t\t\t\tresult.nextRawTail",
		);
		expect(SOURCE).toContain("previousRawTail + frame.text");
		expect(SOURCE).toContain("current.usesScreenSnapshotBaseline");
		expect(SOURCE).not.toContain(
			"const restoreRevision = current.restoreRevision + 1",
		);
		expect(SOURCE).toContain("terminalSnapshotRefreshEpoch,\n\t\tworkspace.id");
		expect(SOURCE).not.toContain(
			"!activeTerminalRun ||\n\t\t\t!cloudCanUseHost ||\n\t\t\tterminalLiveTransportCanReplacePolling",
		);
		expect(SOURCE).toContain('"reconnecting"');
		expect(SOURCE).toContain("getTerminalSnapshot");
		expect(SOURCE).not.toContain("terminalLiveTextMessage");
	});

	test("uses host terminal dimensions for mobile observer rendering without resizing the host PTY", () => {
		expect(SOURCE).toContain("type TerminalDimensions");
		expect(SOURCE).toContain("type TerminalScreenSnapshot");
		expect(SOURCE).toContain("screenSnapshot: TerminalScreenSnapshot | null");
		expect(SOURCE).toContain("terminalDimensionsFromRecord");
		expect(SOURCE).toContain("mergeTerminalSnapshotState");
		expect(SOURCE).toContain(
			"screenSnapshot={activeTerminalRun.screenSnapshot}",
		);
		expect(SOURCE).toContain(
			"terminalDimensions: terminalDimensionsFromRecord(terminal)",
		);
		expect(SOURCE).toContain("terminalDimensionsFromRecord(message)");
		expect(SOURCE).toContain("cols: terminalDimensions?.cols");
		expect(SOURCE).toContain("rows: terminalDimensions?.rows");
		expect(SOURCE).toContain(
			"terminalDimensions={activeTerminalRun.terminalDimensions}",
		);
		expect(SOURCE).toContain("onLocalResize={handleTerminalLocalResize}");
		expect(SOURCE).not.toContain("apiClient.v2Workspace.resizeTerminal");
		expect(SOURCE).not.toContain(
			'type TerminalSocketClientMessage =\\n\\t| { type: "input"; data: string }\\n\\t| { type: "resize"; cols: number; rows: number };',
		);
	});

	test("renders terminal unavailable states as Codex-style mobile states instead of debug text", () => {
		const unavailableStart = SOURCE.indexOf(
			"const renderTerminalUnavailableState = () =>",
		);
		const terminalSurfaceStart = SOURCE.indexOf(
			"const renderTerminalSurface = () =>",
			unavailableStart,
		);
		expect(unavailableStart).toBeGreaterThan(0);
		expect(terminalSurfaceStart).toBeGreaterThan(unavailableStart);

		const unavailableState = SOURCE.slice(
			unavailableStart,
			terminalSurfaceStart,
		);
		expect(unavailableState).toContain("正在连接终端");
		expect(unavailableState).toContain("等待终端会话");
		expect(unavailableState).toContain("终端无法连接");
		expect(unavailableState).toContain("重试连接");
		expect(unavailableState).toContain("items-center justify-center");
		expect(unavailableState).toContain("LockKeyhole");
		expect(unavailableState).toContain("ShieldAlert");
		expect(unavailableState).toContain(
			'accessibilityLabel="Retry terminal connection"',
		);
		expect(SOURCE).not.toContain("terminal session unavailable");
		expect(SOURCE).not.toContain("creating host terminal...");
		expect(SOURCE).not.toContain("retry attach");
	});

	test("keeps terminal input owned by xterm with a RootShell-style keyboard accessory", () => {
		expect(SOURCE).toContain("handleTerminalWebViewInteraction");
		expect(SOURCE).toContain("handleDismissTerminalKeyboard");
		expect(SOURCE).toContain("Keyboard.dismiss()");
		expect(SOURCE).toContain("terminalKeyboardDismissToken");
		expect(SOURCE).toContain("terminalKeyboardAccessoryVisible");
		expect(SOURCE).toContain(
			"onInteraction={handleTerminalWebViewInteraction}",
		);
		expect(SOURCE).toContain(
			"keyboardDismissSignal={terminalKeyboardDismissToken}",
		);
		expect(SOURCE).toContain('testID="workspace-terminal-keyboard-accessory"');
		expect(SOURCE).not.toContain("terminalCommandInputRef");
		expect(SOURCE).not.toContain("terminalInputDraft");
		expect(SOURCE).not.toContain("terminalNativeInputFocusedRef");
		expect(SOURCE).not.toContain("terminalWebViewInputSuppressedRef");
		expect(SOURCE).not.toContain("terminalIgnoreNativeSubmitUntilRef");
		expect(SOURCE).not.toContain("handleSubmitTerminalInput");
		expect(SOURCE).not.toContain("renderTerminalInput");
		expect(SOURCE).not.toContain('"Send terminal input"');
		expect(SOURCE).not.toContain('testID="workspace-terminal-command-input"');
		expect(SOURCE).not.toContain('accessibilityLabel="Terminal command input"');
		expect(SOURCE).not.toContain(
			'placeholder={activeTerminalRun.exited ? "session ended" : "$"}',
		);

		const terminalSurfaceBlockStart = SOURCE.indexOf(
			"const renderTerminalSurface = () =>",
		);
		const terminalSurfaceEnd = SOURCE.indexOf(
			"const renderComposer",
			terminalSurfaceBlockStart,
		);
		const terminalSurface = SOURCE.slice(
			terminalSurfaceBlockStart,
			terminalSurfaceEnd,
		);
		expect(terminalSurface).toContain("onInput={(data) => {");
		expect(terminalSurface).toContain("void handleSendTerminalData(data);");
		expect(terminalSurface).not.toContain("inputSuppressed");
		expect(terminalSurface).not.toContain("TextInput");
	});

	test("sends xterm input through the live terminal socket before serialized RPC fallback", () => {
		expect(SOURCE).toContain("const terminalInputQueueRef = useRef");
		expect(SOURCE).toContain("Promise.resolve()");
		expect(SOURCE).toContain("const sendTerminalLiveMessage =");
		expect(SOURCE).toContain("webSocketOpenReadyState");
		expect(SOURCE).toContain("liveSocket.socket.send(JSON.stringify(message))");
		expect(SOURCE).not.toContain("const lastTerminalInputChunkRef = useRef");
		expect(SOURCE).not.toContain("duplicateTerminalInputWindowMs");

		const sendTerminalDataStart = SOURCE.indexOf(
			"const handleSendTerminalData =",
		);
		const sendTerminalDataEnd = SOURCE.indexOf(
			"const toggleTerminalModifier",
			sendTerminalDataStart,
		);
		expect(sendTerminalDataStart).toBeGreaterThan(0);
		expect(sendTerminalDataEnd).toBeGreaterThan(sendTerminalDataStart);

		const sendTerminalData = SOURCE.slice(
			sendTerminalDataStart,
			sendTerminalDataEnd,
		);
		expect(sendTerminalData).toContain("data.length === 0");
		expect(sendTerminalData).toContain(
			"const terminalId = activeTerminalRun.terminalId",
		);
		expect(sendTerminalData).toContain("const workspaceId = workspace.id");
		expect(sendTerminalData).toContain(
			'sendTerminalLiveMessage(terminalId, { type: "input", data })',
		);
		expect(sendTerminalData).toContain("return;");
		expect(sendTerminalData).not.toContain("data.length > 1");
		expect(sendTerminalData).not.toContain("lastInput");
		expect(sendTerminalData).not.toContain("sentAt");
		expect(sendTerminalData).toContain("const writeInput = async () =>");
		expect(sendTerminalData).toContain(
			"apiClient.v2Workspace.writeTerminalInput.mutate",
		);
		expect(sendTerminalData).toContain("setTerminalSnapshotRefreshEpoch");
		expect(sendTerminalData).toContain("terminalInputQueueRef.current");
		expect(sendTerminalData).toContain(".catch(() => undefined)");
		expect(sendTerminalData).toContain(".then(writeInput)");
		expect(sendTerminalData).toContain(
			"terminalInputQueueRef.current = queuedWrite.then",
		);
		expect(sendTerminalData).not.toContain(
			"const handleSendTerminalData = async",
		);
	});

	test("does not let a mobile xterm fit resize the shared host PTY", () => {
		expect(SOURCE).not.toContain("apiClient.v2Workspace.resizeTerminal");
		expect(SOURCE).not.toContain("lastTerminalResizeKeyRef");

		const localResizeStart = SOURCE.indexOf(
			"const handleTerminalLocalResize =",
		);
		const resizeStart = SOURCE.indexOf("const handleTerminalResize =");
		const nextEffect = SOURCE.indexOf("useEffect(() =>", resizeStart);
		expect(localResizeStart).toBeGreaterThan(0);
		expect(resizeStart).toBeGreaterThan(0);
		expect(nextEffect).toBeGreaterThan(resizeStart);
		const localResizeHandler = SOURCE.slice(localResizeStart, resizeStart);
		expect(localResizeHandler).toContain("terminalSizeRef.current = size");
		const resizeHandler = SOURCE.slice(resizeStart, nextEffect);
		expect(resizeHandler).toContain("handleTerminalLocalResize(size)");
		expect(resizeHandler).toContain("shouldRequestRedraw");
		expect(resizeHandler).toContain("requestTerminalRedraw");
		expect(resizeHandler).not.toContain("resizeTerminal");
		expect(resizeHandler).not.toContain("sendTerminalLiveMessage");
		expect(resizeHandler).not.toContain('type: "resize"');
	});

	test("renders mobile ACP pending actions with native iOS permission actions", () => {
		const pendingRendererIndex = SOURCE.indexOf(
			"const renderPendingChatActions",
		);
		const chatSurfaceIndex = SOURCE.indexOf("const renderChatSurface");
		const composerIndex = SOURCE.indexOf(
			"const renderComposer",
			chatSurfaceIndex,
		);
		const agentSheetIndex = SOURCE.indexOf(
			"const renderAgentSheet",
			composerIndex,
		);
		expect(pendingRendererIndex).toBeGreaterThan(0);
		expect(chatSurfaceIndex).toBeGreaterThan(0);
		expect(composerIndex).toBeGreaterThan(chatSurfaceIndex);
		expect(agentSheetIndex).toBeGreaterThan(composerIndex);

		const chatSurface = SOURCE.slice(chatSurfaceIndex, composerIndex);
		const composer = SOURCE.slice(composerIndex, agentSheetIndex);
		expect(chatSurface).toContain("renderPendingChatActions()");
		expect(SOURCE).toContain("renderPendingApprovalCard");
		expect(SOURCE).toContain("renderPendingQuestionCard");
		expect(SOURCE).toContain("renderPendingPlanCard");
		expect(SOURCE).toContain("showNativePermissionSelector");
		expect(SOURCE).toContain("showNativeQuestionSelector");
		expect(SOURCE).toContain("showNativePlanSelector");
		expect(SOURCE).toContain("showNativePendingActionSelector");
		expect(SOURCE).toContain("Alert.prompt");
		expect(SOURCE).toContain('if (Platform.OS === "ios")');
		expect(SOURCE).toContain("return null;");
		expect(composer).toContain("PendingActionIcon &&");
		expect(composer).toContain("pendingActionLabel &&");
		expect(composer).toContain('Platform.OS === "ios"');
		expect(composer).toContain("showNativePendingActionSelector");
		expect(composer).toContain("Review permission request");
		expect(composer).toContain("Answer agent question");
		expect(composer).toContain("Review plan");
		expect(composer).toContain("ShieldAlert");
		expect(SOURCE).toContain('"允许一次"');
		expect(SOURCE).toContain('"始终允许"');
		expect(SOURCE).toContain('"批准"');
		expect(SOURCE).toContain('"拒绝"');
		expect(SOURCE).toContain("respondToChatApproval");
		expect(SOURCE).toContain("respondToChatQuestion");
		expect(SOURCE).toContain("respondToChatPlan");
	});

	test("renders assistant markdown and uses stable unique part keys", () => {
		expect(SOURCE).toContain("./components/MobileMarkdown");
		expect(SOURCE).toContain(
			"<MobileMarkdown key={key}>{part.text}</MobileMarkdown>",
		);
		expect(SOURCE).toContain("function partRenderKey");
		expect(SOURCE).toContain(
			"return `" +
				templateDollar +
				"{part.type}:" +
				templateDollar +
				"{identity}:" +
				templateDollar +
				"{index}`;",
		);
		expect(SOURCE).not.toContain("function partId");
		expect(SOURCE).not.toContain(
			'return typeof record.id === "string" ? record.id',
		);
	});

	test("renders ACP tool calls as compact normalized rows instead of raw JSON cards", () => {
		expect(SOURCE).toContain("classifyAgentToolName");
		expect(SOURCE).toContain("toolPartViewModel");
		expect(SOURCE).toContain("renderStructuredToolPart");
		expect(SOURCE).toContain("assistantContentPartsForDisplay");
		expect(SOURCE).toContain("AssistantDisplayPartWithToolState");
		expect(SOURCE).toContain("mobileToolDisplayState");
		expect(SOURCE).toContain("allowPendingToolCalls");
		expect(SOURCE).toContain('part.type !== "tool_call"');
		expect(SOURCE).toContain(
			"displayContent.map(renderStructuredAssistantPart)",
		);
		expect(SOURCE).toContain("classification.displayName");
		expect(SOURCE).toContain("toolCallSummary(classification.kind");
		expect(SOURCE).toContain("toolResultSummary(classification.kind");
		expect(SOURCE).toContain("toolIconForKind(classification.kind)");
		expect(SOURCE).toContain('case "tool_call":');
		expect(SOURCE).toContain('case "tool_result":');
		expect(SOURCE).toContain("return renderStructuredToolPart(part, key);");
		expect(SOURCE).not.toContain("Calling {part.name}");
		expect(SOURCE).not.toMatch(/Calling \${part\.name}/);
		expect(SOURCE).not.toContain("{compactJson(part.args)}");
		expect(SOURCE).not.toContain("{compactJson(part.result)}");
	});

	test("clears the native composer input after send and disables autocorrection for code prompts", () => {
		expect(SOURCE).toContain(
			"const [composerInputEpoch, setComposerInputEpoch]",
		);
		expect(SOURCE).toContain('setPrompt("");');
		expect(SOURCE).toContain("setComposerInputEpoch((value) => value + 1)");
		expect(SOURCE).toContain(
			`key={\`composer-input-${templateDollar}{composerInputEpoch}\`}`,
		);
		expect(SOURCE).toContain('autoCapitalize="none"');
		expect(SOURCE).toContain('autoComplete="off"');
		expect(SOURCE).toContain("autoCorrect={false}");
		expect(SOURCE).toContain("spellCheck={false}");
	});

	test("keeps first-send user bubble visible while chat session creation finishes", () => {
		expect(SOURCE).not.toContain("const ensureConversationSession = async");

		const firstSendStart = SOURCE.indexOf("const existingSessionId =");
		expect(firstSendStart).toBeGreaterThan(0);

		const setRunStateIndex = SOURCE.indexOf(
			'setRunState({ status: "sending", ...submittedPrompt });',
			firstSendStart,
		);
		const setMessagesIndex = SOURCE.indexOf(
			"setMessages((current) =>",
			firstSendStart,
		);
		const createSessionIndex = SOURCE.indexOf(
			"await apiClient.chat.createSession.mutate",
			firstSendStart,
		);
		const sendMessageIndex = SOURCE.indexOf(
			"await apiClient.v2Workspace.sendChatMessage.mutate",
			firstSendStart,
		);
		expect(setRunStateIndex).toBeGreaterThan(firstSendStart);
		expect(setMessagesIndex).toBeGreaterThan(setRunStateIndex);
		expect(createSessionIndex).toBeGreaterThan(setMessagesIndex);
		expect(sendMessageIndex).toBeGreaterThan(createSessionIndex);
		expect(SOURCE).toContain(
			"submittedPrompt?.sessionId === selectedSessionId",
		);
	});

	test("clears stale send errors once the host snapshot shows assistant progress", () => {
		expect(SOURCE).toContain("snapshotAcknowledgesSubmittedPrompt");
		expect(SOURCE).toContain(
			"snapshotContainsAssistantProgressAfterSubmittedPrompt",
		);
		expect(SOURCE).toContain('if (message.role !== "assistant") return false;');
		expect(SOURCE).toContain("submittedPromptAckWindowMs");
		expect(SOURCE).toContain("snapshotAcknowledgesSubmittedPrompt(");
		expect(SOURCE).not.toContain("Agent could not start");
		expect(SOURCE).toContain("发送失败");
	});

	test("renders persisted signal turns as user-originated ACP messages", () => {
		expect(SOURCE).toContain("function isUserOriginatedMessage");
		expect(SOURCE).toContain(
			'return message.role === "user" || message.role === "signal";',
		);
		expect(SOURCE).toContain(
			"const isUser = isUserOriginatedMessage(message);",
		);
		expect(SOURCE).not.toContain('const isUser = message.role === "user";');
	});

	test("keeps chat runtime controls in native top actions, not persistent chips", () => {
		expect(SOURCE).not.toContain("const renderChatHeaderRuntimeControls");
		expect(SOURCE).not.toContain("shouldShowChatModelRuntimeChip");
		expect(SOURCE).not.toContain("shouldShowHostRuntimeChip");
		expect(SOURCE).not.toContain("headerHostStatusLabel");
		const nativeChatActionsIndex = SOURCE.indexOf(
			"const showNativeChatActions = () =>",
		);
		const edgeSwipeIndex = SOURCE.indexOf(
			"const handleEdgeSwipeStart",
			nativeChatActionsIndex,
		);
		expect(nativeChatActionsIndex).toBeGreaterThan(0);
		expect(edgeSwipeIndex).toBeGreaterThan(nativeChatActionsIndex);
		const nativeChatActions = SOURCE.slice(
			nativeChatActionsIndex,
			edgeSwipeIndex,
		);
		expect(nativeChatActions).toContain("showNativeAgentSelector");
		expect(nativeChatActions).toContain("showNativeModelSelector");
		expect(nativeChatActions).toContain("showNativeWindowSwitcher");
		expect(nativeChatActions).toContain('"切换会话"');
		expect(nativeChatActions).toContain('"Agent"');
		expect(nativeChatActions).toContain('"模型"');
		expect(nativeChatActions).toContain("handleStopChatSession");
		expect(nativeChatActions).toContain("handleEndChatSession");
		expect(nativeChatActions).toContain('"停止回复"');
		expect(nativeChatActions).toContain('"结束会话"');
		expect(SOURCE).toContain("showNativeWindowSwitcher");
		expect(SOURCE).toContain("选择当前对话使用的 Agent");
		expect(SOURCE).toContain("模型");
		expect(SOURCE).toContain("apiClient.v2Workspace.stopChatSession.mutate");
		expect(SOURCE).toContain("apiClient.v2Workspace.endChatSession.mutate");
	});

	test("keeps terminal runtime controls in a popup sheet opened from the top action", () => {
		expect(SOURCE).not.toContain("const renderTerminalHeaderRuntimeControls");
		expect(SOURCE).toContain('} from "@expo/ui/swift-ui";');
		expect(SOURCE).toContain("BottomSheet as SwiftUIBottomSheet");
		expect(SOURCE).toContain("Group as SwiftUIGroup");
		expect(SOURCE).toContain("Host as SwiftUIHost");
		expect(SOURCE).toContain("RNHostView");
		expect(SOURCE).toContain('} from "@expo/ui/swift-ui/modifiers";');
		expect(SOURCE).toContain("background");
		expect(SOURCE).toContain("environment");
		expect(SOURCE).not.toContain("interactiveDismissDisabled");
		expect(SOURCE).not.toContain("presentationDetents");
		expect(SOURCE).not.toContain("presentationDragIndicator");
		const terminalActionsIndex = SOURCE.indexOf(
			"const showNativeTerminalActions = () =>",
		);
		const edgeSwipeIndex = SOURCE.indexOf(
			"const handleEdgeSwipeStart",
			terminalActionsIndex,
		);
		expect(terminalActionsIndex).toBeGreaterThan(0);
		expect(edgeSwipeIndex).toBeGreaterThan(terminalActionsIndex);
		const terminalActions = SOURCE.slice(terminalActionsIndex, edgeSwipeIndex);
		expect(terminalActions).toContain("Keyboard.dismiss()");
		expect(terminalActions).toContain("setSwitcherOpen(false)");
		expect(terminalActions).toContain("setControlSheet(null)");
		expect(terminalActions).toContain("openTerminalActionsSheet()");
		expect(terminalActions).not.toContain("showActionSheetWithOptions");

		const terminalSheetStart = SOURCE.indexOf(
			"const renderTerminalActionsSheet = () =>",
		);
		const terminalSheetEnd = SOURCE.indexOf(
			"const renderControlSheet",
			terminalSheetStart,
		);
		expect(terminalSheetStart).toBeGreaterThan(0);
		expect(terminalSheetEnd).toBeGreaterThan(terminalSheetStart);
		const terminalSheet = SOURCE.slice(terminalSheetStart, terminalSheetEnd);
		expect(terminalSheet).toContain("<SwiftUIHost");
		expect(terminalSheet).toContain("<SwiftUIBottomSheet");
		expect(terminalSheet).toContain("<SwiftUIGroup");
		expect(terminalSheet).toContain("<RNHostView>");
		expect(terminalSheet).toContain("terminalActionsSheetBackground");
		expect(terminalSheet).not.toContain("terminalActionsSheetDetents");
		expect(terminalSheet).not.toContain("terminalActionsSheetExpandedDetent");
		expect(terminalSheet).not.toContain("selectedTerminalActionsSheetDetent");
		expect(terminalSheet).toContain('environment("colorScheme", "dark")');
		expect(terminalSheet).not.toContain(
			"presentationDetents(terminalActionsSheetDetents",
		);
		expect(terminalSheet).not.toContain('presentationDragIndicator("hidden")');
		expect(terminalSheet).not.toContain("interactiveDismissDisabled(false)");
		expect(terminalSheet).toContain(
			"background(terminalActionsSheetBackground)",
		);
		expect(terminalSheet).toContain("isPresented={terminalActionsSheetOpen}");
		expect(terminalSheet).toContain(
			"onIsPresentedChange={handleTerminalActionsPresentedChange}",
		);
		expect(terminalSheet).toContain("onDismiss={handleTerminalActionsDismiss}");
		expect(terminalSheet).toContain("fitToContents={false}");
		expect(terminalSheet).toContain(
			"mb-3 h-1 w-12 self-center rounded-full bg-[#73737c]",
		);
		expect(terminalSheet).toContain(
			"backgroundColor: terminalActionsSheetBackground",
		);
		expect(terminalSheet).toContain("<ScrollView");
		expect(terminalSheet).toContain(
			"paddingBottom: Math.max(insets.bottom + 22, 34)",
		);
		expect(terminalSheet).toContain("workspace-terminal-actions-sheet");
		expect(terminalSheet).toContain("终端操作");
		expect(terminalSheet).toContain("运行时");
		expect(terminalSheet).toContain("会话");
		expect(terminalSheet).toContain("Terminal presets");
		expect(terminalSheet).toContain("presetTileWidth");
		expect(terminalSheet).toContain('const presetTileWidth = "48%" as const');
		expect(terminalSheet).toContain("canFillTerminalPreset");
		expect(terminalSheet).toContain("flexBasis: presetTileWidth");
		expect(terminalSheet).toContain("maxWidth: presetTileWidth");
		expect(terminalSheet).toContain("compactActionWidth");
		expect(terminalSheet).toContain("flex-row flex-wrap");
		expect(terminalSheet).toContain("horizontal");
		expect(terminalSheet).toContain("showsHorizontalScrollIndicator={false}");
		expect(SOURCE).toContain(
			'type TerminalActionsSheetMode = "actions" | "model" | "switcher";',
		);
		expect(SOURCE).toContain(
			"const openTerminalModelConfigurationSheet = useCallback",
		);
		expect(SOURCE).toContain('setTerminalActionsSheetMode("model")');
		expect(terminalSheet).toContain("openTerminalModelConfigurationSheet");
		expect(terminalSheet).toContain('terminalActionsSheetMode === "model"');
		expect(terminalSheet).toContain("终端模型配置");
		expect(terminalSheet).toContain("终端模型由主机 Agent 配置控制");
		expect(terminalSheet).toContain("当前终端 Agent");
		expect(terminalSheet).toContain("可用终端预设");
		expect(terminalSheet).toContain("返回终端操作");
		expect(terminalSheet).not.toContain("showNativeModelSelector");
		expect(terminalSheet).toContain('terminalActionsSheetMode === "switcher"');
		expect(terminalSheet).toContain("renderTerminalSwitcherSheetContent()");
		expect(terminalSheet).toContain("openTerminalSwitcherSheet");
		expect(terminalSheet).not.toContain("showNativeWindowSwitcher");
		expect(terminalSheet).toContain("handleFillTerminalPreset");
		expect(terminalSheet).toContain("terminalPresetOptions.map((preset)");
		expect(terminalSheet).toContain("terminalPresetOptionCommand(preset)");
		expect(terminalSheet).toContain("loadingTerminalPresets");
		expect(terminalSheet).toContain("terminalPresetError");
		expect(terminalSheet).not.toContain("terminalAgentOptions.map");
		expect(terminalSheet).not.toContain("terminalPresetCommand(agent)");
		expect(terminalSheet).toContain(
			"accessibilityLabel={`Fill " +
				templateDollar +
				"{preset.label} terminal preset`}",
		);
		expect(terminalSheet).toContain("handleCreateTerminalWindow");
		expect(terminalSheet).toContain("handleCreateConversation");
		expect(terminalSheet).toContain("新终端");
		expect(terminalSheet).toContain("新对话");
		expect(terminalSheet).toContain("切换");
		expect(terminalSheet).not.toContain("快捷输入");
		expect(terminalSheet).not.toContain("handleInsertTerminalAgentCommand");
		expect(terminalSheet).not.toContain("Insert selected agent command");
		expect(terminalSheet).not.toContain("Run selected terminal agent");
		expect(terminalSheet).not.toContain("运行 {selectedAgentLabel}");
		expect(terminalSheet).not.toContain("selectedTerminalAgentCommand");
		expect(terminalSheet).not.toContain("自定义命令未同步");
		expect(terminalSheet).not.toContain("主机默认，由 {hostName} 控制");
		expect(terminalSheet).not.toContain("const options = [");
	});

	test("keeps the native terminal actions sheet mounted until dismiss animation completes", () => {
		expect(SOURCE).toContain(
			"const [terminalActionsSheetMounted, setTerminalActionsSheetMounted]",
		);
		expect(SOURCE).toContain(
			"const terminalActionsSheetOpenRef = useRef(false)",
		);
		expect(SOURCE).toContain("terminalActionsSheetOpenRef.current =");
		expect(SOURCE).toContain("const openTerminalActionsSheet = useCallback");
		expect(SOURCE).toContain("setTerminalActionsSheetMounted(true)");
		expect(SOURCE).toContain("terminalActionsSheetOpenRef.current = true");
		expect(SOURCE).toContain("const closeTerminalActionsSheet = useCallback");
		expect(SOURCE).toContain("terminalActionsSheetOpenRef.current = false");
		expect(SOURCE).toContain("setTerminalActionsSheetOpen(false)");
		expect(SOURCE).toContain(
			"const handleTerminalActionsPresentedChange = useCallback",
		);
		expect(SOURCE).toContain(
			"terminalActionsSheetOpenRef.current = isPresented",
		);
		expect(SOURCE).toContain("setTerminalActionsSheetOpen(isPresented)");
		expect(SOURCE).toContain(
			"const handleTerminalActionsDismiss = useCallback",
		);
		expect(SOURCE).toContain("if (!terminalActionsSheetOpenRef.current)");
		expect(SOURCE).toContain("if (!terminalActionsSheetMounted) return null;");
		expect(SOURCE).toContain("onDismiss={handleTerminalActionsDismiss}");
		expect(SOURCE).toContain(
			"onIsPresentedChange={handleTerminalActionsPresentedChange}",
		);

		const terminalSheetStart = SOURCE.indexOf(
			"const renderTerminalActionsSheet = () =>",
		);
		const terminalSheetEnd = SOURCE.indexOf(
			"const renderControlSheet",
			terminalSheetStart,
		);
		const terminalSheet = SOURCE.slice(terminalSheetStart, terminalSheetEnd);
		expect(terminalSheet).not.toContain(
			"if (!terminalActionsSheetOpen) return null;",
		);
		expect(terminalSheet).not.toContain(
			"onIsPresentedChange={setTerminalActionsSheetOpen}",
		);
	});

	test("fills terminal preset commands through xterm input without auto-running them", () => {
		expect(SOURCE).toContain("fallbackTerminalPresetCommands");
		expect(SOURCE).toContain("fallbackTerminalPresetOptions");
		expect(SOURCE).toContain('claude: "claude --dangerously-skip-permissions"');
		expect(SOURCE).toContain(
			'codex: "codex --dangerously-bypass-approvals-and-sandbox"',
		);
		expect(SOURCE).toContain('opencode: "opencode"');
		expect(SOURCE).toContain('copilot: "copilot --allow-tool=write"');
		expect(SOURCE).not.toContain('amp: "amp"');
		expect(SOURCE).not.toContain('gemini: "gemini --approval-mode=auto_edit"');
		expect(SOURCE).toContain("function terminalPresetCommand");
		expect(SOURCE).toContain("function terminalPresetOptionCommand");
		expect(SOURCE).toContain("quoteTerminalPresetShellToken");
		expect(SOURCE).toContain("formatTerminalPresetEnv");
		expect(SOURCE).toContain("agent.command?.trim()");
		expect(SOURCE).toContain("agent.args ?? []");
		expect(SOURCE).toContain("agent.env");
		expect(SOURCE).toContain("apiClient.v2Workspace.listTerminalPresets");
		expect(SOURCE).toContain("const handleFillTerminalPreset =");
		expect(SOURCE).toContain(
			"const command = terminalPresetOptionCommand(preset);",
		);
		expect(SOURCE).toContain("handleSendTerminalData(command);");
		expect(SOURCE).toContain("setTerminalKeyboardAccessoryVisible(true);");
		expect(SOURCE).toContain("closeTerminalActionsSheet();");
		expect(SOURCE).not.toContain("const handleInsertTerminalAgentCommand");
		expect(SOURCE).not.toContain("暂时没有移动端可快捷输入的启动命令");

		const fillStart = SOURCE.indexOf("const handleFillTerminalPreset =");
		const fillEnd = SOURCE.indexOf(
			"const handleTerminalWebViewInteraction",
			fillStart,
		);
		expect(fillStart).toBeGreaterThan(0);
		expect(fillEnd).toBeGreaterThan(fillStart);
		const fillPreset = SOURCE.slice(fillStart, fillEnd);
		expect(fillPreset).not.toContain("\\r");
		expect(fillPreset).not.toContain('"\r"');
		expect(fillPreset).not.toContain("handleSendTerminalKey");
	});

	test("does not launch terminal agents from the ACP chat composer", () => {
		const handleSendPromptStart = SOURCE.indexOf("const handleSendPrompt");
		const handleSendPromptEnd = SOURCE.indexOf(
			"const handleRespondToApproval",
			handleSendPromptStart,
		);
		expect(handleSendPromptStart).toBeGreaterThan(0);
		expect(handleSendPromptEnd).toBeGreaterThan(handleSendPromptStart);
		const handleSendPrompt = SOURCE.slice(
			handleSendPromptStart,
			handleSendPromptEnd,
		);

		expect(SOURCE).not.toContain("canSendTerminalAgentPrompt");
		expect(SOURCE).toContain("const canSendPrompt = canSendChat;");
		expect(handleSendPrompt).toContain(
			"await apiClient.v2Workspace.sendChatMessage.mutate",
		);
		expect(handleSendPrompt).not.toContain("apiClient.v2Workspace.runAgent");
		expect(handleSendPrompt).not.toContain('if (result.kind !== "terminal")');
		expect(SOURCE).not.toContain("selectedRuntimeModelLabel");
		expect(SOURCE).toContain('"主机默认"');
		expect(SOURCE).not.toContain("setActiveSurfaceKind(agent.kind)");
	});

	test("does not forward the Claude Code default model as provider metadata", () => {
		expect(SOURCE).toContain("function shouldForwardChatModelMetadata");
		expect(SOURCE).toContain('model.id !== "claude-code-default"');
		expect(SOURCE).toContain('model.modelId !== "claude-code-default"');
		expect(SOURCE).toContain("function chatModelMetadataForSend");
		const metadataHelperStart = SOURCE.indexOf(
			"function chatModelMetadataForSend",
		);
		const metadataHelperEnd = SOURCE.indexOf(
			"function formatBytes",
			metadataHelperStart,
		);
		expect(metadataHelperStart).toBeGreaterThan(0);
		expect(metadataHelperEnd).toBeGreaterThan(metadataHelperStart);
		const metadataHelper = SOURCE.slice(metadataHelperStart, metadataHelperEnd);
		expect(metadataHelper).toContain("shouldForwardChatModelMetadata(model)");
		expect(metadataHelper).toContain("model: model.id");
		expect(metadataHelper).toContain("undefined");
		expect(SOURCE).toContain(
			"metadata: chatModelMetadataForSend(selectedChatModel)",
		);
		expect(SOURCE).not.toContain("metadata: { model: selectedChatModel.id }");
	});

	test("sends terminal Enter as carriage return for PTY compatibility", () => {
		const terminalKeysStart = SOURCE.indexOf("const terminalKeyButtons = [");
		const terminalKeysEnd = SOURCE.indexOf("] as const;", terminalKeysStart);
		expect(terminalKeysStart).toBeGreaterThan(0);
		expect(terminalKeysEnd).toBeGreaterThan(terminalKeysStart);

		const terminalKeys = SOURCE.slice(terminalKeysStart, terminalKeysEnd);
		expect(terminalKeys).toContain(
			'{ id: "enter", label: "Enter", data: "\\r" }',
		);
		expect(terminalKeys).not.toContain(
			'{ id: "enter", label: "Enter", data: "\\n" }',
		);
		expect(terminalKeys.indexOf('{ id: "enter"')).toBeLessThan(
			terminalKeys.indexOf('{ id: "up"'),
		);
		expect(terminalKeys.indexOf('{ id: "enter"')).toBeLessThan(
			terminalKeys.indexOf('{ id: "backspace"'),
		);
		expect(terminalKeys.indexOf('{ id: "ctrl-c"')).toBeLessThan(
			terminalKeys.indexOf('{ id: "enter"'),
		);
		expect(SOURCE).toContain("terminalInputCommandIdRef");
		expect(SOURCE).toContain("setTerminalInputCommand({");
		expect(SOURCE).toContain("data: command");
		expect(SOURCE).toContain('if (data === "\\r")');
	});

	test("keeps terminal virtual keys in the RootShell keyboard accessory", () => {
		const virtualKeyboardStart = SOURCE.indexOf(
			"const renderTerminalVirtualKeyboard = () =>",
		);
		const virtualKeyboardEnd = SOURCE.indexOf(
			"const renderTerminalControls = () =>",
			virtualKeyboardStart,
		);
		expect(virtualKeyboardStart).toBeGreaterThan(0);
		expect(virtualKeyboardEnd).toBeGreaterThan(virtualKeyboardStart);

		const virtualKeyboard = SOURCE.slice(
			virtualKeyboardStart,
			virtualKeyboardEnd,
		);
		expect(virtualKeyboard).toContain("handleDismissTerminalKeyboard");
		expect(virtualKeyboard).toContain('"Hide terminal keyboard"');
		expect(virtualKeyboard).toContain('keyboardShouldPersistTaps="always"');
		expect(virtualKeyboard).toContain('renderTerminalModifier("ctrl")');
		expect(virtualKeyboard).toContain('renderTerminalModifier("alt")');
		expect(virtualKeyboard).toContain('renderTerminalModifier("shift")');
		expect(virtualKeyboard).toContain("terminalKeyButtons.map");
		expect(virtualKeyboard).toContain("return null;");
		expect(virtualKeyboard).not.toContain("TextInput");
	});

	test("keeps the RootShell terminal accessory above the iOS keyboard", () => {
		expect(SOURCE).toContain("Keyboard.addListener");
		expect(SOURCE).toContain("terminalKeyboardBottomInset");
		expect(SOURCE).toContain("terminalKeyboardAccessoryVisible");
		expect(SOURCE).toContain(
			"Math.max(0, height - event.endCoordinates.screenY)",
		);
		expect(SOURCE).toContain("setTerminalKeyboardAccessoryVisible(true)");
		expect(SOURCE).toContain("setTerminalKeyboardAccessoryVisible(false)");

		const terminalControlsStart = SOURCE.indexOf(
			"const renderTerminalControls = () =>",
		);
		const terminalControlsEnd = SOURCE.indexOf(
			"const renderTerminalSurface = () =>",
			terminalControlsStart,
		);
		expect(terminalControlsStart).toBeGreaterThan(0);
		expect(terminalControlsEnd).toBeGreaterThan(terminalControlsStart);

		const terminalControls = SOURCE.slice(
			terminalControlsStart,
			terminalControlsEnd,
		);
		expect(terminalControls).toContain("terminalKeyboardAccessoryVisible");
		expect(terminalControls).toContain(
			"marginBottom: terminalKeyboardBottomInset",
		);
		expect(terminalControls).toContain("controlsPaddingBottom");
		expect(terminalControls).toContain("terminalKeyboardBottomInset > 0");
		expect(terminalControls).toContain("shellStyles.terminalAccessorySurface");
		expect(terminalControls).not.toContain(
			"shellStyles.terminalControlSurface",
		);
		expect(terminalControls).not.toContain("TextInput");
		expect(terminalControls).toContain("zIndex: 60");
		expect(terminalControls).toContain("elevation: 60");
	});

	test("does not add fake tools or voice controls to the worktree shell", () => {
		expect(SOURCE).not.toContain("Tools");
		expect(SOURCE).not.toContain("Voice");
		expect(SOURCE).not.toContain("Dictation");
		expect(SOURCE).not.toContain("Microphone");
		expect(SOURCE).not.toContain("Back to Workspace");
		expect(SOURCE).not.toContain("Terminal config");
		expect(SOURCE).not.toContain("Paperclip");
	});

	test("keeps the Codex-style composer as a single floating capsule", () => {
		const composerStart = SOURCE.indexOf("const renderComposer = () =>");
		const agentSheetStart = SOURCE.indexOf(
			"const renderAgentSheet",
			composerStart,
		);
		expect(composerStart).toBeGreaterThan(0);
		expect(agentSheetStart).toBeGreaterThan(composerStart);

		const composer = SOURCE.slice(composerStart, agentSheetStart);
		expect(composer).toContain("shellStyles.composerSurface");
		expect(composer).toContain('accessibilityLabel="Attach files"');
		expect(composer).toContain(
			"size-10 items-center justify-center rounded-full",
		);
		expect(composer).toContain("style={{ maxHeight: 96 }}");
		expect(composer).toContain('accessibilityLabel="Attach files"');
		expect(composer).toContain("handleSendPrompt");
		expect(composer).not.toContain("Select Model");
		expect(composer).not.toContain("Select Agent");
		expect(composer).not.toContain("hostControlLabel");
		expect(composer).not.toContain("Microphone");
		expect(SOURCE).not.toContain("promptSuggestions");
	});
});
