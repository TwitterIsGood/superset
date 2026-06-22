import {
	RNHostView,
	BottomSheet as SwiftUIBottomSheet,
	Group as SwiftUIGroup,
	Host as SwiftUIHost,
} from "@expo/ui/swift-ui";
import {
	background,
	environment,
	interactiveDismissDisabled,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { classifyAgentToolName } from "@superset/chat/shared";
import type {
	SelectChatSession,
	SelectV2Host,
	SelectV2Project,
	SelectV2Workspace,
} from "@superset/db/schema";
import { randomUUID } from "expo-crypto";
import { File as ExpoFile } from "expo-file-system";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useRouter } from "expo-router";
import {
	Bot,
	Check,
	ChevronDown,
	ChevronLeft,
	Ellipsis,
	FileText,
	Globe,
	Laptop,
	LockKeyhole,
	type LucideIcon,
	MessageSquare,
	Pencil,
	Plus,
	Search,
	Send,
	ShieldAlert,
	Sparkles,
	SquarePen,
	Terminal,
	Trash2,
	Wrench,
	X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActionSheetIOS,
	ActivityIndicator,
	Alert,
	type GestureResponderEvent,
	Keyboard,
	KeyboardAvoidingView,
	type KeyboardEvent,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	type StyleProp,
	StyleSheet,
	TextInput,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { apiClient } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
	TerminalEmulator,
	type TerminalInputCommand,
} from "../TerminalEmulator";
import { MobileMarkdown } from "./components/MobileMarkdown";
import {
	type AssistantDisplayPartWithToolState,
	assistantContentPartsForDisplay,
} from "./utils/assistantContentPartsForDisplay";
import { mergeSnapshotMessagesWithPending } from "./utils/mergeSnapshotMessagesWithPending";
import {
	shouldReplayInitialTerminalSnapshot,
	terminalTailDelta,
} from "./utils/terminalTailDelta";
import {
	embeddedFileLabelsFromText,
	stripEmbeddedFilePayloads,
} from "./utils/userMessageDisplay";

type ChatMessage = Awaited<
	ReturnType<typeof apiClient.chat.listMessages.query>
>[number];
type WorkspaceChatSnapshot = Awaited<
	ReturnType<typeof apiClient.v2Workspace.getChatSnapshot.query>
>;
type WorkspaceChatModel = Awaited<
	ReturnType<typeof apiClient.v2Workspace.listChatModels.query>
>[number];
type WorkspaceAgentOption = Awaited<
	ReturnType<typeof apiClient.v2Workspace.listAgents.query>
>[number];
type WorkspaceTerminalPresetOption = Awaited<
	ReturnType<typeof apiClient.v2Workspace.listTerminalPresets.query>
>[number];
type WorkspaceTerminalSession = Awaited<
	ReturnType<typeof apiClient.v2Workspace.listTerminals.query>
>["sessions"][number];
type WorkspaceTerminalSnapshot = Awaited<
	ReturnType<typeof apiClient.v2Workspace.getTerminalSnapshot.query>
>;
type WorkspaceChatRuntimeMessage = WorkspaceChatSnapshot["messages"][number];
type WorkspaceChatCurrentMessage = NonNullable<
	WorkspaceChatSnapshot["displayState"]["currentMessage"]
>;
type BaseVisibleChatMessage =
	| ChatMessage
	| WorkspaceChatRuntimeMessage
	| WorkspaceChatCurrentMessage;
type VisibleChatMessage = BaseVisibleChatMessage;
type VisibleChatMessagePart = VisibleChatMessage["content"][number];
type DisplayVisibleChatMessagePart =
	AssistantDisplayPartWithToolState<VisibleChatMessagePart>;
type SubmittedChatPrompt = {
	sessionId: string;
	content: string;
	createdAt: Date;
};
type WorkspaceChatRunState =
	| { status: "idle" }
	| ({ status: "sending" } & Partial<SubmittedChatPrompt>)
	| ({ status: "sent" } & SubmittedChatPrompt)
	| ({ status: "error"; message: string } & Partial<SubmittedChatPrompt>);
type TerminalAgentRun = {
	terminalId: string;
	label: string;
	prompt: string;
	createdAt: Date;
	outputTail: string;
	restoreRevision: number;
	hasLoadedSnapshot: boolean;
	suppressReplayUntilDelta: boolean;
	exited: boolean;
	exitCode: number | null;
	errorMessage: string | null;
};
type ConversationSwipeStart = {
	resourceId: string;
	pageX: number;
	pageY: number;
};
type SuppressedConversationPress = {
	resourceId: string;
	until: number;
};
type ComposerAttachment = {
	id: string;
	filename: string;
	mediaType: string;
	data: string;
	size: number;
};
type PendingApprovalView = {
	toolCallId: string | null;
	toolName: string;
	title: string;
	description: string | null;
	blockedPath: string | null;
	argsText: string | null;
};
type PendingQuestionView = {
	questionId: string;
	question: string;
	description: string | null;
	options: Array<{ label: string; description: string | null }>;
};
type PendingPlanApprovalView = {
	planId: string;
	title: string;
	description: string | null;
};
type AgentToolKind = ReturnType<typeof classifyAgentToolName>["kind"];
type ToolPartViewModel = {
	displayName: string;
	summary: string | null;
	statusLabel: string | null;
	isError: boolean;
	isPending: boolean;
	icon: LucideIcon;
};
type PendingActionKind =
	| "approval-approve"
	| "approval-decline"
	| "approval-always"
	| "question"
	| "plan-approved"
	| "plan-rejected";
type ChatLifecycleAction = "stop" | "end";
type ActiveSurfaceKind = "chat" | "terminal";
type TerminalActionsSheetMode = "actions" | "model" | "switcher";
type TerminalLiveConnectionState =
	| "idle"
	| "connecting"
	| "live"
	| "reconnecting"
	| "error"
	| "exited";
type TerminalLiveStatus = {
	terminalId: string | null;
	state: TerminalLiveConnectionState;
	message: string | null;
};
type TerminalLiveControlMessage =
	| { type: "attached"; terminalId: string; canResize?: boolean }
	| { type: "title"; title: string | null }
	| { type: "exit"; exitCode?: number | null; signal?: number | null }
	| { type: "error"; message: string };
type TerminalLiveFrame =
	| { type: "output"; text: string }
	| { type: "control"; message: TerminalLiveControlMessage };
type TerminalLiveSocketRef = {
	terminalId: string;
	socket: WebSocket | null;
	state: TerminalLiveConnectionState;
	receivedBytes: boolean;
};
type TerminalSocketClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number };

interface WorkspaceMobileShellProps {
	workspace: Pick<
		SelectV2Workspace,
		"id" | "name" | "branch" | "projectId" | "hostId"
	>;
	project: SelectV2Project | null;
	host: Pick<
		SelectV2Host,
		"machineId" | "name" | "isOnline" | "updatedAt"
	> | null;
	hasHostAccess: boolean | null;
	chatSessions: SelectChatSession[];
	initialTerminalId?: string | null;
}

interface WorktreeWindowListItem {
	id: string;
	kind: "chat" | "terminal";
	resourceId: string;
	title: string;
	subtitle: string;
	isLocal: boolean;
}

type ControlSheet = "agent" | "model" | null;
type TerminalModifier = "ctrl" | "shift" | "alt";

const terminalModifierLabels: Record<TerminalModifier, string> = {
	ctrl: "Ctrl",
	shift: "Shift",
	alt: "Alt",
};

const emptyTerminalModifiers: Record<TerminalModifier, boolean> = {
	ctrl: false,
	shift: false,
	alt: false,
};

const terminalKeyButtons = [
	{ id: "esc", label: "Esc", data: "\u001b" },
	{ id: "tab", label: "Tab", data: "\t" },
	{ id: "ctrl-c", label: "C-c", data: "\u0003" },
	{ id: "enter", label: "Enter", data: "\r" },
	{ id: "backspace", label: "⌫", data: "\u007f" },
	{ id: "up", label: "↑", data: "\u001b[A" },
	{ id: "down", label: "↓", data: "\u001b[B" },
	{ id: "left", label: "←", data: "\u001b[D" },
	{ id: "right", label: "→", data: "\u001b[C" },
] as const;

const terminalSnapshotPollIntervalMs = 1000;
const terminalLiveSnapshotReconcileIntervalMs = 2500;
const terminalActionsSheetBackground = "#111116";
const terminalActionsSheetCompactDetent = { fraction: 0.56 };
const terminalActionsSheetExpandedDetent = { fraction: 0.92 };
const terminalActionsSheetDetents = [
	terminalActionsSheetCompactDetent,
	terminalActionsSheetExpandedDetent,
];
const safeShellTokenPattern = /^[A-Za-z0-9_@%+=:,./~-]+$/;
const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const fallbackTerminalPresetCommands: Record<string, string> = {
	claude: "claude --dangerously-skip-permissions",
	codex: "codex --dangerously-bypass-approvals-and-sandbox",
	opencode: "opencode",
	copilot: "copilot --allow-tool=write",
};

const fallbackTerminalPresetOptions: WorkspaceTerminalPresetOption[] = [
	{
		id: "claude",
		presetId: "claude",
		label: "Claude",
		description: "Claude terminal preset",
		command: fallbackTerminalPresetCommands.claude,
		commands: [fallbackTerminalPresetCommands.claude],
		order: 0,
	},
	{
		id: "codex",
		presetId: "codex",
		label: "Codex",
		description: "Codex terminal preset",
		command: fallbackTerminalPresetCommands.codex,
		commands: [fallbackTerminalPresetCommands.codex],
		order: 1,
	},
	{
		id: "opencode",
		presetId: "opencode",
		label: "OpenCode",
		description: "OpenCode terminal preset",
		command: fallbackTerminalPresetCommands.opencode,
		commands: [fallbackTerminalPresetCommands.opencode],
		order: 2,
	},
	{
		id: "copilot",
		presetId: "copilot",
		label: "Copilot",
		description: "Copilot terminal preset",
		command: fallbackTerminalPresetCommands.copilot,
		commands: [fallbackTerminalPresetCommands.copilot],
		order: 3,
	},
];

const fallbackAgentOptions: WorkspaceAgentOption[] = [
	{
		id: "superset",
		label: "Claude Code",
		kind: "chat",
		presetId: "superset",
	},
	{
		id: "claude",
		label: "Claude Code",
		kind: "terminal",
		presetId: "claude",
		command: "claude --dangerously-skip-permissions",
		args: [],
		env: {},
	},
	{
		id: "codex",
		label: "Codex",
		kind: "terminal",
		presetId: "codex",
		command: "codex --dangerously-bypass-approvals-and-sandbox",
		args: [],
		env: {},
	},
];

const maxAttachmentBytes = 8 * 1024 * 1024;
const edgeSwipeWidth = 18;
const edgeSwipeDistance = 90;
const edgeSwipeVerticalTolerance = 64;
const submittedPromptAckWindowMs = 5 * 60 * 1000;
const hostOnlineStaleMs = 24 * 60 * 60 * 1000;

function AdaptiveGlassSurface({
	children,
	isInteractive = false,
	style,
	tone = "dark",
}: {
	children: ReactNode;
	isInteractive?: boolean;
	style?: StyleProp<ViewStyle>;
	tone?: "dark" | "light";
}) {
	const glassAvailable = Platform.OS === "ios" && isGlassEffectAPIAvailable();
	const toneStyle =
		tone === "light" ? shellStyles.glassLight : shellStyles.glassDark;
	if (glassAvailable) {
		return (
			<GlassView
				colorScheme={tone === "light" ? "light" : "dark"}
				glassEffectStyle="regular"
				isInteractive={isInteractive}
				style={[shellStyles.glassSurface, toneStyle, style]}
				tintColor={
					tone === "light"
						? "rgba(242, 242, 244, 0.9)"
						: "rgba(22, 22, 26, 0.78)"
				}
			>
				{children}
			</GlassView>
		);
	}

	return (
		<View style={[shellStyles.glassSurface, toneStyle, style]}>{children}</View>
	);
}

function hostStatusLabel(isOnline: boolean | null | undefined): string {
	if (isOnline === true) return "在线";
	if (isOnline === false) return "离线";
	return "未知";
}

function hostUpdatedAtMs(value: Date | string | number | null | undefined) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	const time = date.getTime();
	return Number.isNaN(time) ? null : time;
}

function isHostOnlineStale(
	isOnline: boolean | null | undefined,
	updatedAt: Date | string | number | null | undefined,
): boolean {
	if (isOnline !== true) return false;
	const updatedAtTime = hostUpdatedAtMs(updatedAt);
	if (updatedAtTime === null) return false;
	return Date.now() - updatedAtTime > hostOnlineStaleMs;
}

function hostReachabilityLabel({
	isOnline,
	updatedAt,
}: {
	isOnline: boolean | null | undefined;
	updatedAt: Date | string | number | null | undefined;
}): string {
	if (isHostOnlineStale(isOnline, updatedAt)) return "状态可能过期";
	if (isOnline === true) return "主机在线";
	return hostStatusLabel(isOnline);
}

function hostDotClassName(isOnline: boolean | null | undefined): string {
	if (isOnline === true) return "bg-emerald-500";
	if (isOnline === false) return "bg-muted-foreground";
	return "bg-amber-500";
}

function terminalDataWithModifiers(
	data: string,
	modifiers: Record<TerminalModifier, boolean>,
): string {
	let output = data;
	if (modifiers.ctrl && output.length === 1 && /[a-z]/i.test(output)) {
		output = String.fromCharCode(output.toLowerCase().charCodeAt(0) - 96);
	}
	if (modifiers.shift && output.length === 1) {
		output = output.toUpperCase();
	}
	if (modifiers.alt && output.length > 0) {
		output = `\u001b${output}`;
	}
	return output;
}

function shortId(value: string): string {
	return value.length > 8 ? value.slice(0, 8) : value;
}

function compactWorkspaceTitle(
	name: string,
	projectName: string | null,
): string {
	const fallback = projectName?.trim() || "Workspace";
	const trimmedName = name.trim();
	if (!trimmedName) return fallback;
	const withoutCodexPrefix = trimmedName.replace(/^codex\//, "");
	const leafName = withoutCodexPrefix.split("/").filter(Boolean).at(-1);
	const displayName = leafName || withoutCodexPrefix;
	return displayName.length > 34
		? `${displayName.slice(0, 31)}...`
		: displayName;
}

function agentDisplayLabel(agent: WorkspaceAgentOption): string {
	const id = agent.presetId ?? agent.id;
	if (id === "superset") return "Claude Code";
	if (id === "claude") return "Claude Code";
	if (id === "codex") return "Codex";
	return agent.label;
}

function agentSubtitle(agent: WorkspaceAgentOption): string {
	if (agent.kind === "chat") {
		return "Claude Code 对话，可切换模型";
	}
	return terminalPresetCommand(agent) ?? "等待主机同步命令";
}

function quoteTerminalPresetShellToken(value: string): string {
	if (value === "") return "''";
	if (safeShellTokenPattern.test(value)) return value;
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatTerminalPresetEnv(env: Record<string, string> | undefined) {
	if (!env) return "";
	return Object.entries(env)
		.filter(([key]) => envKeyPattern.test(key))
		.map(([key, value]) => `${key}=${quoteTerminalPresetShellToken(value)}`)
		.join(" ");
}

function terminalPresetCommand(agent: WorkspaceAgentOption): string | null {
	if (agent.kind !== "terminal") return null;
	const configuredCommand = agent.command?.trim();
	const fallbackCommand =
		(agent.presetId ? fallbackTerminalPresetCommands[agent.presetId] : null) ??
		fallbackTerminalPresetCommands[agent.id] ??
		null;
	const command = configuredCommand || fallbackCommand;
	if (!command) return null;
	const args = agent.args ?? [];
	const commandText =
		configuredCommand && args.length > 0
			? [
					quoteTerminalPresetShellToken(configuredCommand),
					...args.map(quoteTerminalPresetShellToken),
				].join(" ")
			: command;
	const envPrefix = formatTerminalPresetEnv(agent.env);
	return envPrefix ? `${envPrefix} ${commandText}` : commandText;
}

function terminalPresetOptionCommand(
	preset: WorkspaceTerminalPresetOption,
): string | null {
	const command = preset.command.trim() || preset.commands[0]?.trim() || "";
	return command.length > 0 ? command : null;
}

function isEquivalentBuiltInAgent(
	agent: WorkspaceAgentOption,
	fallback: WorkspaceAgentOption,
): boolean {
	const agentPreset = agent.presetId ?? agent.id;
	const fallbackPreset = fallback.presetId ?? fallback.id;
	return agent.kind === fallback.kind && agentPreset === fallbackPreset;
}

function mergeAgentOptions(
	hostAgents: WorkspaceAgentOption[],
): WorkspaceAgentOption[] {
	const seen = new Set<string>();
	const merged: WorkspaceAgentOption[] = [];
	const append = (agent: WorkspaceAgentOption) => {
		if (seen.has(agent.id)) return false;
		seen.add(agent.id);
		merged.push(agent);
		return true;
	};

	append(fallbackAgentOptions[0]);
	for (const agent of hostAgents) {
		if (isEquivalentBuiltInAgent(agent, fallbackAgentOptions[0])) continue;
		append(agent);
	}
	for (const fallback of fallbackAgentOptions.slice(1)) {
		if (merged.some((agent) => isEquivalentBuiltInAgent(agent, fallback))) {
			continue;
		}
		append(fallback);
	}
	return merged;
}

function modelDisplayName(model: WorkspaceChatModel): string {
	return model.name.trim() || model.modelId;
}

function modelSubtitle(model: WorkspaceChatModel): string {
	return `${model.provider} - ${model.modelId}`;
}

function shouldForwardChatModelMetadata(model: WorkspaceChatModel): boolean {
	return (
		model.id !== "claude-code-default" &&
		model.modelId !== "claude-code-default"
	);
}

function chatModelMetadataForSend(
	model: WorkspaceChatModel,
): { model: string } | undefined {
	return shouldForwardChatModelMetadata(model)
		? { model: model.id }
		: undefined;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSessionTime(value: Date | string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function sessionTitle(session: SelectChatSession, index: number): string {
	const title = session.title?.trim();
	return title && title.length > 0 ? title : `Conversation ${index + 1}`;
}

function formatWorkspaceRuntimeError(
	error: unknown,
	fallbackMessage: string,
): string {
	const message = error instanceof Error ? error.message : fallbackMessage;
	if (
		message.includes("No procedure found") &&
		message.includes("v2Workspace.")
	) {
		const routeMatch = message.match(/"((?:v2Workspace|chat)\.[^"]+)"/);
		const route = routeMatch?.[1] ?? "v2Workspace route";
		return `Mobile is connected to an older Superset API, not this worktree's API. Restart the current worktree dev services and reload the app. Missing route: ${route}.`;
	}
	if (
		message.includes("No procedure found") &&
		message.includes("terminal.getSnapshot")
	) {
		return "The selected host is running an older Superset host-service that cannot stream terminal agent output to mobile. Restart or update Superset on that computer, then try again. Missing host route: terminal.getSnapshot.";
	}
	if (
		message
			.toLowerCase()
			.includes(
				"not authenticated. provide a bearer jwt, x-api-key, or session",
			)
	) {
		return "Host service is not authenticated with Superset. Open the desktop app on that computer, sign in again, and make sure Relay is enabled.";
	}
	const relayMarkerIndex = message.indexOf(": relay ");
	const payloadStartIndex = message.indexOf("{", relayMarkerIndex);

	if (relayMarkerIndex >= 0 && payloadStartIndex >= 0) {
		const prefix = message.slice(0, relayMarkerIndex);
		try {
			const payload = JSON.parse(message.slice(payloadStartIndex));
			const relayMessage =
				typeof payload?.error?.json?.message === "string"
					? payload.error.json.message
					: null;
			const relayPath =
				typeof payload?.error?.json?.data?.path === "string"
					? payload.error.json.data.path
					: null;
			if (relayMessage) {
				return relayPath
					? `${prefix}: ${relayMessage} (${relayPath})`
					: `${prefix}: ${relayMessage}`;
			}
		} catch {
			return message.slice(0, payloadStartIndex).trim();
		}
	}

	return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function formatChatRuntimeDisplayError(
	message: string,
	selectedModel: WorkspaceChatModel | null,
): string {
	if (/bad gateway/i.test(message) && selectedModel) {
		return `Model provider failed for ${modelDisplayName(selectedModel)}. Choose another chat model or update the host model provider.`;
	}
	if (/unknown provider for model/i.test(message) && selectedModel) {
		return `The host model provider cannot run ${modelDisplayName(selectedModel)}. Choose another chat model.`;
	}
	return message;
}

function textFromMessage(message: VisibleChatMessage): string {
	const textParts = message.content
		.map((part) => {
			switch (part.type) {
				case "text":
				case "reasoning":
					return part.text;
				case "thinking":
					return part.thinking;
				case "tool_call":
				case "tool_result":
					return toolPartDisplayText(part);
				case "permission_requested":
					return (
						part.title ?? part.displayName ?? `Permission: ${part.toolName}`
					);
				case "permission_resolved":
					return `${part.toolName}: ${part.decision}`;
				case "tool_progress":
					return (
						part.summary ?? `${part.toolName}: ${part.status ?? "running"}`
					);
				case "subagent_event":
					return part.summary ?? part.description ?? `Subagent ${part.status}`;
				case "mode_changed":
					return `Mode changed to ${part.label ?? part.mode}`;
				case "model_changed":
					return `Model changed to ${part.label ?? part.model}`;
				case "context_attachment":
					return `Attached ${part.title}`;
				case "branch_marker":
					return part.label;
				case "file":
					return `File: ${part.filename ?? "attachment"}`;
				case "image":
					return "Image attachment";
				default:
					return "";
			}
		})
		.filter((text) => text.trim().length > 0);
	return textParts.join("\n\n") || "(structured message)";
}

function userAttachmentLabelsFromMessage(
	message: VisibleChatMessage,
): string[] {
	const labels = embeddedFileLabelsFromText(textFromMessage(message));
	for (const part of message.content) {
		if (part.type === "file") {
			const filename = part.filename?.trim() || "attachment";
			if (!labels.includes(filename)) labels.push(filename);
		}
		if (part.type === "image") {
			const filename =
				"filename" in part && typeof part.filename === "string"
					? part.filename.trim()
					: "";
			const label = filename || "image attachment";
			if (!labels.includes(label)) labels.push(label);
		}
	}
	return labels;
}

function userDisplayTextFromMessage(message: VisibleChatMessage): string {
	const text = stripEmbeddedFilePayloads(textFromMessage(message));
	return (
		text || (userAttachmentLabelsFromMessage(message).length > 0 ? "" : text)
	);
}

function materializeSnapshotMessages(
	snapshot: WorkspaceChatSnapshot,
): VisibleChatMessage[] {
	const messages: VisibleChatMessage[] = [...snapshot.messages];
	const currentMessage = snapshot.displayState.currentMessage;
	if (
		snapshot.displayState.isRunning &&
		currentMessage?.role === "assistant" &&
		currentMessage.content.length > 0
	) {
		const currentMessageId = currentMessage.id;
		if (
			!currentMessageId ||
			!messages.some((message) => message.id === currentMessageId)
		) {
			messages.push(currentMessage);
		}
	}
	return messages;
}

function hasSnapshotFeedback(snapshot: WorkspaceChatSnapshot): boolean {
	return (
		snapshot.messages.length > 0 ||
		snapshot.displayState.isRunning === true ||
		Boolean(snapshot.displayState.currentMessage) ||
		Boolean(snapshot.displayState.errorMessage) ||
		Boolean(snapshot.displayState.pendingApproval) ||
		Boolean(snapshot.displayState.pendingQuestion) ||
		Boolean(snapshot.displayState.pendingPlanApproval)
	);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function stringField(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function compactJson(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	try {
		const json = JSON.stringify(value, null, 2);
		return json.length > 420 ? `${json.slice(0, 417)}...` : json;
	} catch {
		return String(value);
	}
}

function shortenToolSummary(value: string | null): string | null {
	const normalized = value?.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	return normalized.length > 120
		? `${normalized.slice(0, 117)}...`
		: normalized;
}

function firstStringField(
	record: Record<string, unknown> | null,
	keys: string[],
): string | null {
	if (!record) return null;
	for (const key of keys) {
		const value = stringField(record, key);
		if (value) return value;
	}
	return null;
}

function firstNumberField(
	record: Record<string, unknown> | null,
	keys: string[],
): number | null {
	if (!record) return null;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

function firstOutputLine(value: string | null): string | null {
	if (!value) return null;
	return (
		value
			.split("\n")
			.map((line) => line.trim())
			.find((line) => line.length > 0) ?? null
	);
}

function toolIconForKind(kind: AgentToolKind): LucideIcon {
	switch (kind) {
		case "shell":
			return Terminal;
		case "read":
			return FileText;
		case "edit":
		case "write":
			return Pencil;
		case "search":
			return Search;
		case "fetch":
			return Globe;
		case "subagent":
			return Bot;
		case "skill":
			return Sparkles;
		case "unknown":
			return Wrench;
		default:
			return Wrench;
	}
}

function commandSummary(command: string | null): string | null {
	if (!command) return null;
	const normalized = command.replace(/\\\s*\n\s*/g, " ");
	const parts = normalized.split(/\s*(?:&&|\|\||;|\|)\s*/);
	const firstWords = parts
		.map((part) => part.trim().split(/\s+/)[0])
		.filter(Boolean);
	if (firstWords.length === 0) return shortenToolSummary(normalized);
	const limited = firstWords.slice(0, 4).join(", ");
	return firstWords.length > 4 ? `${limited}...` : limited;
}

function toolCallSummary(
	kind: AgentToolKind,
	args: Record<string, unknown>,
): string | null {
	const record = asRecord(args);
	switch (kind) {
		case "shell":
			return (
				commandSummary(
					firstStringField(record, ["command", "cmd", "script", "input"]),
				) ?? firstStringField(record, ["description", "summary"])
			);
		case "read":
		case "edit":
		case "write":
			return firstStringField(record, [
				"filePath",
				"file_path",
				"path",
				"targetPath",
				"target_path",
			]);
		case "search":
			return firstStringField(record, [
				"query",
				"pattern",
				"regex",
				"glob",
				"path",
			]);
		case "fetch":
			return firstStringField(record, ["url", "href"]);
		case "subagent":
			return firstStringField(record, ["description", "prompt", "task"]);
		case "skill":
			return firstStringField(record, ["skill", "skillName", "name"]);
		case "unknown":
			return firstStringField(record, ["description", "summary", "title"]);
		default:
			return null;
	}
}

function toolResultSummary(
	kind: AgentToolKind,
	result: unknown,
	isError: boolean,
): string | null {
	if (typeof result === "string") {
		return firstOutputLine(result);
	}
	const record = asRecord(result);
	const errorSummary = firstStringField(record, [
		"error",
		"message",
		"stderr",
		"reason",
	]);
	if (isError && errorSummary) return firstOutputLine(errorSummary);
	if (kind === "shell") {
		const stdoutSummary = firstOutputLine(firstStringField(record, ["stdout"]));
		const stderrSummary = firstOutputLine(firstStringField(record, ["stderr"]));
		return (
			stdoutSummary ??
			stderrSummary ??
			(firstNumberField(record, ["exitCode", "exit_code", "code"]) !== null
				? `exit ${firstNumberField(record, ["exitCode", "exit_code", "code"])}`
				: null)
		);
	}
	return (
		firstStringField(record, [
			"summary",
			"title",
			"path",
			"filePath",
			"file_path",
			"url",
		]) ?? errorSummary
	);
}

function toolPartViewModel(
	part: DisplayVisibleChatMessagePart,
): ToolPartViewModel | null {
	if (part.type !== "tool_call" && part.type !== "tool_result") return null;
	const classification = classifyAgentToolName(part.name);
	const isResult = part.type === "tool_result";
	const isError = isResult ? part.isError === true : false;
	const toolCallDisplayState =
		part.type === "tool_call"
			? (part.mobileToolDisplayState ?? "running")
			: null;
	const rawSummary = isResult
		? toolResultSummary(classification.kind, part.result, isError)
		: toolCallSummary(classification.kind, part.args);
	return {
		displayName: classification.displayName,
		summary: shortenToolSummary(rawSummary),
		statusLabel: isResult
			? isError
				? "failed"
				: "done"
			: toolCallDisplayState,
		isError,
		isPending: part.type === "tool_call" && toolCallDisplayState === "running",
		icon: toolIconForKind(classification.kind),
	};
}

function toolPartDisplayText(part: VisibleChatMessagePart): string {
	const viewModel = toolPartViewModel(part);
	if (!viewModel) return "";
	return [viewModel.displayName, viewModel.summary, viewModel.statusLabel]
		.filter(Boolean)
		.join(" ");
}

function pendingApprovalView(value: unknown): PendingApprovalView | null {
	const record = asRecord(value);
	if (!record) return null;
	const toolName =
		stringField(record, "toolName") ??
		stringField(record, "tool_name") ??
		stringField(record, "name") ??
		"tool";
	return {
		toolCallId:
			stringField(record, "toolCallId") ?? stringField(record, "tool_call_id"),
		toolName,
		title:
			stringField(record, "title") ??
			stringField(record, "displayName") ??
			stringField(record, "display_name") ??
			`Approve ${toolName}`,
		description:
			stringField(record, "description") ??
			stringField(record, "decisionReason") ??
			stringField(record, "decision_reason"),
		blockedPath:
			stringField(record, "blockedPath") ?? stringField(record, "blocked_path"),
		argsText:
			"args" in record
				? compactJson(record.args)
				: "arguments" in record
					? compactJson(record.arguments)
					: "input" in record
						? compactJson(record.input)
						: null,
	};
}

function pendingQuestionView(value: unknown): PendingQuestionView | null {
	const record = asRecord(value);
	const questionId = record ? stringField(record, "questionId") : null;
	const question = record
		? (stringField(record, "question") ?? stringField(record, "title"))
		: null;
	if (!record || !questionId || !question) return null;
	const optionsValue = Array.isArray(record.options) ? record.options : [];
	const options = optionsValue
		.map((option) => {
			const optionRecord = asRecord(option);
			if (!optionRecord) return null;
			const label = stringField(optionRecord, "label");
			if (!label) return null;
			return {
				label,
				description: stringField(optionRecord, "description"),
			};
		})
		.filter((option): option is { label: string; description: string | null } =>
			Boolean(option),
		);
	return {
		questionId,
		question,
		description: stringField(record, "description"),
		options,
	};
}

function pendingPlanApprovalView(
	value: unknown,
): PendingPlanApprovalView | null {
	const record = asRecord(value);
	const planId = record ? stringField(record, "planId") : null;
	if (!record || !planId) return null;
	return {
		planId,
		title:
			stringField(record, "title") ??
			stringField(record, "summary") ??
			"Review plan",
		description:
			stringField(record, "description") ??
			stringField(record, "plan") ??
			stringField(record, "content"),
	};
}

function partRenderKey(part: VisibleChatMessagePart, index: number): string {
	const record = part as Record<string, unknown>;
	const identity = typeof record.id === "string" ? record.id : "anonymous";
	return `${part.type}:${identity}:${index}`;
}

function renderStructuredToolPart(
	part: DisplayVisibleChatMessagePart,
	key: string,
) {
	const viewModel = toolPartViewModel(part);
	if (!viewModel) return null;
	const StatusIcon = viewModel.isError ? X : Check;
	return (
		<View
			key={key}
			className={cn(
				"-mx-1 flex-row items-center gap-2 rounded-md px-1.5 py-1",
				viewModel.isError ? "bg-red-500/10" : "bg-transparent",
			)}
		>
			<View className="h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#202027]">
				<Icon as={viewModel.icon} className="size-3 text-[#a6a6af]" />
			</View>
			<View className="min-w-0 flex-1 flex-row items-center gap-1.5">
				<Text className="shrink-0 font-mono text-[12px] text-[#d9d9df]">
					{viewModel.displayName}
				</Text>
				{viewModel.summary ? (
					<Text
						className="min-w-0 shrink font-mono text-[12px] text-[#8b8b96]"
						numberOfLines={1}
					>
						{viewModel.summary}
					</Text>
				) : null}
			</View>
			<View className="shrink-0 flex-row items-center gap-1">
				{viewModel.isPending ? (
					<ActivityIndicator color="#8b8b96" size="small" />
				) : (
					<Icon
						as={StatusIcon}
						className={cn(
							"size-3",
							viewModel.isError ? "text-red-300" : "text-emerald-300",
						)}
					/>
				)}
				{viewModel.statusLabel ? (
					<Text
						className={cn(
							"text-[11px] uppercase",
							viewModel.isError ? "text-red-300" : "text-[#74747f]",
						)}
					>
						{viewModel.statusLabel}
					</Text>
				) : null}
			</View>
		</View>
	);
}

function renderStructuredAssistantPart(
	part: DisplayVisibleChatMessagePart,
	index: number,
) {
	const key = partRenderKey(part, index);
	switch (part.type) {
		case "text":
			return <MobileMarkdown key={key}>{part.text}</MobileMarkdown>;
		case "reasoning":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[12px] font-medium uppercase text-[#8b8b96]">
						Reasoning
					</Text>
					<Text className="mt-1 text-[14px] leading-5 text-[#c8c8d0]">
						{part.text}
					</Text>
				</View>
			);
		case "thinking":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[12px] font-medium uppercase text-[#8b8b96]">
						Thinking
					</Text>
					<Text className="mt-1 text-[14px] leading-5 text-[#c8c8d0]">
						{part.thinking}
					</Text>
				</View>
			);
		case "tool_call":
		case "tool_result":
			return renderStructuredToolPart(part, key);
		case "permission_requested":
			return (
				<View key={key} className="rounded-md bg-amber-500/10 px-3 py-2">
					<Text className="text-[13px] font-medium text-amber-300">
						{part.title ?? part.displayName ?? `Permission: ${part.toolName}`}
					</Text>
					{part.description ? (
						<Text className="mt-1 text-[13px] leading-5 text-[#9b9ba5]">
							{part.description}
						</Text>
					) : null}
					{part.blockedPath ? (
						<Text className="mt-1 font-mono text-[12px] text-[#9b9ba5]">
							{part.blockedPath}
						</Text>
					) : null}
				</View>
			);
		case "permission_resolved":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[13px] text-[#c8c8d0]">
						{part.toolName}: {part.decision}
					</Text>
				</View>
			);
		case "tool_progress":
			return (
				<View
					key={key}
					className="rounded-md border border-[#2d2d36] px-3 py-2"
				>
					<Text className="text-[13px] font-medium text-[#d9d9df]">
						{part.toolName}
					</Text>
					<Text className="mt-1 text-[13px] leading-5 text-[#8b8b96]">
						{part.summary ?? part.status ?? "running"}
						{typeof part.elapsedTimeSeconds === "number"
							? ` - ${Math.round(part.elapsedTimeSeconds)}s`
							: ""}
					</Text>
				</View>
			);
		case "subagent_event":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[13px] font-medium text-[#d9d9df]">
						{part.subagentType ?? "Subagent"} {part.status}
					</Text>
					{(part.summary ?? part.description) ? (
						<Text className="mt-1 text-[13px] leading-5 text-[#8b8b96]">
							{part.summary ?? part.description}
						</Text>
					) : null}
				</View>
			);
		case "mode_changed":
			return (
				<Text key={key} className="text-[13px] text-[#8b8b96]">
					Mode changed to {part.label ?? part.mode}
				</Text>
			);
		case "model_changed":
			return (
				<Text key={key} className="text-[13px] text-[#8b8b96]">
					Model changed to {part.label ?? part.model}
				</Text>
			);
		case "context_attachment":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[13px] font-medium text-[#d9d9df]">
						Attached {part.title}
					</Text>
					{part.mediaType ? (
						<Text className="mt-0.5 text-[12px] text-[#8b8b96]">
							{part.mediaType}
						</Text>
					) : null}
				</View>
			);
		case "branch_marker":
			return (
				<Text key={key} className="text-[13px] text-[#8b8b96]">
					{part.label}
				</Text>
			);
		case "file":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[13px] text-[#d9d9df]">
						File: {part.filename ?? "attachment"}
					</Text>
				</View>
			);
		case "image":
			return (
				<View key={key} className="rounded-md bg-[#19191f] px-3 py-2">
					<Text className="text-[13px] text-[#d9d9df]">Image attachment</Text>
					<Text className="mt-0.5 text-[12px] text-[#8b8b96]">
						{part.mimeType}
					</Text>
				</View>
			);
		default:
			return null;
	}
}

function isRecoverableWorkspaceRuntimeError(message: string): boolean {
	return (
		message.includes("Workspace not found") ||
		message.includes("Project is not set up on this host") ||
		message.includes("Workspace is not available on the host") ||
		message.includes("automatic recovery failed") ||
		message.includes("Failed to clone repository") ||
		message.includes("No existing worktree") ||
		message.includes("workspaceCreation.adopt") ||
		message.includes("workspaceCreation.ensureLocal")
	);
}

function isHostRelayUnavailableMessage(message: string | null): boolean {
	if (!message) return false;
	return (
		message.includes("Host is not online") ||
		message.includes("Host not connected") ||
		message.includes("Workspace host is offline") ||
		message.includes("Relay is unavailable") ||
		message.includes("fetch failed") ||
		message.includes("Network request failed")
	);
}

function isBlobLike(value: unknown): value is {
	arrayBuffer: () => Promise<ArrayBuffer>;
} {
	return (
		value !== null &&
		typeof value === "object" &&
		"arrayBuffer" in value &&
		typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
	);
}

function parseTerminalLiveControlMessage(
	value: string,
): TerminalLiveControlMessage | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== "object") return null;
		const record = parsed as Record<string, unknown>;
		if (record.type === "attached" && typeof record.terminalId === "string") {
			return {
				type: "attached",
				terminalId: record.terminalId,
				canResize:
					typeof record.canResize === "boolean" ? record.canResize : undefined,
			};
		}
		if (record.type === "title") {
			return {
				type: "title",
				title: typeof record.title === "string" ? record.title : null,
			};
		}
		if (record.type === "exit") {
			return {
				type: "exit",
				exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
				signal: typeof record.signal === "number" ? record.signal : null,
			};
		}
		if (record.type === "error") {
			return {
				type: "error",
				message:
					typeof record.message === "string"
						? record.message
						: "Terminal stream error",
			};
		}
	} catch {
		return null;
	}
	return null;
}

async function terminalLiveFrameFromData(
	data: unknown,
	decoder: TextDecoder,
): Promise<TerminalLiveFrame | null> {
	if (typeof data === "string") {
		const controlMessage = parseTerminalLiveControlMessage(data);
		return controlMessage
			? { type: "control", message: controlMessage }
			: { type: "output", text: data };
	}

	let bytes: Uint8Array | null = null;
	if (data instanceof ArrayBuffer) {
		bytes = new Uint8Array(data);
	} else if (ArrayBuffer.isView(data)) {
		bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	} else if (isBlobLike(data)) {
		bytes = new Uint8Array(await data.arrayBuffer());
	}

	if (!bytes || bytes.byteLength === 0) return null;
	return { type: "output", text: decoder.decode(bytes, { stream: true }) };
}

function messageCreatedAt(message: VisibleChatMessage): number | null {
	if (!message.createdAt) return null;
	const createdAt = new Date(message.createdAt).getTime();
	return Number.isNaN(createdAt) ? null : createdAt;
}

function isUserOriginatedMessage(message: VisibleChatMessage): boolean {
	return message.role === "user" || message.role === "signal";
}

function snapshotContainsSubmittedPrompt(
	messages: VisibleChatMessage[],
	submittedPrompt: SubmittedChatPrompt,
): boolean {
	const submittedAt = submittedPrompt.createdAt.getTime();
	return messages.some((message) => {
		if (!isUserOriginatedMessage(message)) return false;
		if (
			userDisplayTextFromMessage(message).trim() !== submittedPrompt.content
		) {
			return false;
		}

		const createdAt = messageCreatedAt(message);
		return (
			createdAt === null ||
			createdAt >= submittedAt - submittedPromptAckWindowMs
		);
	});
}

function snapshotContainsAssistantProgressAfterSubmittedPrompt(
	messages: VisibleChatMessage[],
	submittedPrompt: SubmittedChatPrompt,
): boolean {
	const submittedAt = submittedPrompt.createdAt.getTime();
	return messages.some((message) => {
		if (message.role !== "assistant") return false;
		if (message.content.length === 0 && !message.errorMessage) return false;

		const createdAt = messageCreatedAt(message);
		return (
			createdAt !== null &&
			createdAt >= submittedAt - submittedPromptAckWindowMs
		);
	});
}

function snapshotAcknowledgesSubmittedPrompt(
	messages: VisibleChatMessage[],
	submittedPrompt: SubmittedChatPrompt,
): boolean {
	return (
		snapshotContainsSubmittedPrompt(messages, submittedPrompt) ||
		snapshotContainsAssistantProgressAfterSubmittedPrompt(
			messages,
			submittedPrompt,
		)
	);
}

function runStateSubmittedPrompt(
	runState: WorkspaceChatRunState,
): SubmittedChatPrompt | null {
	if (
		!("sessionId" in runState) ||
		!("content" in runState) ||
		!("createdAt" in runState) ||
		!runState.sessionId ||
		!runState.content ||
		!runState.createdAt
	) {
		return null;
	}

	return {
		sessionId: runState.sessionId,
		content: runState.content,
		createdAt: runState.createdAt,
	};
}

function shouldClearRunStateFromSnapshot({
	runState,
	selectedSessionId,
	snapshotMessages,
}: {
	runState: WorkspaceChatRunState;
	selectedSessionId: string;
	snapshotMessages: VisibleChatMessage[];
}): boolean {
	const submittedPrompt = runStateSubmittedPrompt(runState);
	if (submittedPrompt?.sessionId === selectedSessionId) {
		return snapshotAcknowledgesSubmittedPrompt(
			snapshotMessages,
			submittedPrompt,
		);
	}

	return (
		runState.status === "error" &&
		isRecoverableWorkspaceRuntimeError(runState.message)
	);
}

function firstMatchingRuntimeError(
	predicate: (message: string) => boolean,
	...messages: Array<string | null>
): string | null {
	return (
		messages.find((message) => message !== null && predicate(message)) ?? null
	);
}

export function WorkspaceMobileShell({
	workspace,
	project,
	host,
	hasHostAccess,
	chatSessions,
	initialTerminalId = null,
}: WorkspaceMobileShellProps) {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { width, height } = useWindowDimensions();
	const chatScrollViewRef = useRef<ScrollView>(null);
	const shouldFollowChatOutputRef = useRef(false);
	const appliedInitialTerminalIdRef = useRef<string | null>(null);
	const terminalSizeRef = useRef<{ rows: number; cols: number } | null>(null);
	const lastTerminalResizeKeyRef = useRef<string | null>(null);
	const terminalRawTailByIdRef = useRef<Map<string, string>>(new Map());
	const redrawnTerminalIdsRef = useRef<Set<string>>(new Set());
	const terminalInputQueueRef = useRef<Promise<void>>(Promise.resolve());
	const terminalInputCommandIdRef = useRef(0);
	const terminalLiveSocketRef = useRef<TerminalLiveSocketRef | null>(null);
	const edgeSwipeStartRef = useRef<{ pageX: number; pageY: number } | null>(
		null,
	);
	const [switcherOpen, setSwitcherOpen] = useState(false);
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const [messages, setMessages] = useState<VisibleChatMessage[]>([]);
	const [chatDisplayState, setChatDisplayState] = useState<
		WorkspaceChatSnapshot["displayState"] | null
	>(null);
	const [loadingMessages, setLoadingMessages] = useState(false);
	const [agents, setAgents] =
		useState<WorkspaceAgentOption[]>(fallbackAgentOptions);
	const [loadingAgents, setLoadingAgents] = useState(false);
	const [agentError, setAgentError] = useState<string | null>(null);
	const [terminalPresets, setTerminalPresets] = useState<
		WorkspaceTerminalPresetOption[]
	>(fallbackTerminalPresetOptions);
	const [loadingTerminalPresets, setLoadingTerminalPresets] = useState(false);
	const [terminalPresetError, setTerminalPresetError] = useState<string | null>(
		null,
	);
	const [selectedAgentId, setSelectedAgentId] = useState("claude");
	const [activeSurfaceKind, setActiveSurfaceKind] =
		useState<ActiveSurfaceKind>("terminal");
	const [chatModels, setChatModels] = useState<WorkspaceChatModel[]>([]);
	const [loadingChatModels, setLoadingChatModels] = useState(false);
	const [chatModelError, setChatModelError] = useState<string | null>(null);
	const [terminalSessions, setTerminalSessions] = useState<
		WorkspaceTerminalSession[]
	>([]);
	const [loadingTerminals, setLoadingTerminals] = useState(false);
	const [terminalListError, setTerminalListError] = useState<string | null>(
		null,
	);
	const [creatingTerminal, setCreatingTerminal] = useState(false);
	const [terminalCreateError, setTerminalCreateError] = useState<string | null>(
		null,
	);
	const [terminalLiveStatus, setTerminalLiveStatus] =
		useState<TerminalLiveStatus>({
			terminalId: null,
			state: "idle",
			message: null,
		});
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [composerInputEpoch, setComposerInputEpoch] = useState(0);
	const [terminalModifiers, setTerminalModifiers] = useState<
		Record<TerminalModifier, boolean>
	>(emptyTerminalModifiers);
	const [terminalKeyboardBottomInset, setTerminalKeyboardBottomInset] =
		useState(0);
	const [
		terminalKeyboardAccessoryVisible,
		setTerminalKeyboardAccessoryVisible,
	] = useState(false);
	const [terminalKeyboardDismissToken, setTerminalKeyboardDismissToken] =
		useState(0);
	const [terminalSnapshotRefreshEpoch, setTerminalSnapshotRefreshEpoch] =
		useState(0);
	const [terminalInputCommand, setTerminalInputCommand] =
		useState<TerminalInputCommand | null>(null);
	const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);
	const [creatingConversation, setCreatingConversation] = useState(false);
	const [controlSheet, setControlSheet] = useState<ControlSheet>(null);
	const [terminalActionsSheetMounted, setTerminalActionsSheetMounted] =
		useState(false);
	const [terminalActionsSheetOpen, setTerminalActionsSheetOpen] =
		useState(false);
	const [terminalActionsSheetMode, setTerminalActionsSheetMode] =
		useState<TerminalActionsSheetMode>("actions");
	const terminalActionsSheetOpenRef = useRef(false);
	const conversationSwipeStartRef = useRef<ConversationSwipeStart | null>(null);
	const suppressedConversationPressRef =
		useRef<SuppressedConversationPress | null>(null);
	const [localSessionIds, setLocalSessionIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [conversationSelectionMode, setConversationSelectionMode] =
		useState(false);
	const [selectedConversationIds, setSelectedConversationIds] = useState<
		Set<string>
	>(() => new Set());
	const [deletingConversationIds, setDeletingConversationIds] = useState<
		Set<string>
	>(() => new Set());
	const [openSwipedConversationId, setOpenSwipedConversationId] = useState<
		string | null
	>(null);
	const [
		optimisticallyDeletedConversationIds,
		setOptimisticallyDeletedConversationIds,
	] = useState<Set<string>>(() => new Set());
	const [conversationDeleteError, setConversationDeleteError] = useState<
		string | null
	>(null);
	const [conversationManagementNotice, setConversationManagementNotice] =
		useState<string | null>(null);
	const [conversationError, setConversationError] = useState<string | null>(
		null,
	);
	const [snapshotError, setSnapshotError] = useState<string | null>(null);
	const [pendingActionError, setPendingActionError] = useState<string | null>(
		null,
	);
	const [pendingActionSending, setPendingActionSending] =
		useState<PendingActionKind | null>(null);
	const [chatLifecycleError, setChatLifecycleError] = useState<string | null>(
		null,
	);
	const [chatLifecycleAction, setChatLifecycleAction] =
		useState<ChatLifecycleAction | null>(null);
	const [questionAnswer, setQuestionAnswer] = useState("");
	const [runState, setRunState] = useState<WorkspaceChatRunState>({
		status: "idle",
	});

	useEffect(() => {
		terminalActionsSheetOpenRef.current = terminalActionsSheetOpen;
	}, [terminalActionsSheetOpen]);

	const openTerminalActionsSheet = useCallback(() => {
		terminalActionsSheetOpenRef.current = true;
		setTerminalActionsSheetMounted(true);
		setTerminalActionsSheetMode("actions");
		setTerminalActionsSheetOpen(true);
	}, []);

	const openTerminalSwitcherSheet = useCallback(() => {
		setSwitcherOpen(false);
		setControlSheet(null);
		terminalActionsSheetOpenRef.current = true;
		setTerminalActionsSheetMounted(true);
		setTerminalActionsSheetMode("switcher");
		setTerminalActionsSheetOpen(true);
	}, []);

	const openTerminalModelConfigurationSheet = useCallback(() => {
		setSwitcherOpen(false);
		setControlSheet(null);
		terminalActionsSheetOpenRef.current = true;
		setTerminalActionsSheetMounted(true);
		setTerminalActionsSheetMode("model");
		setTerminalActionsSheetOpen(true);
	}, []);

	const closeTerminalActionsSheet = useCallback(() => {
		terminalActionsSheetOpenRef.current = false;
		setTerminalActionsSheetOpen(false);
	}, []);

	const handleTerminalActionsPresentedChange = useCallback(
		(isPresented: boolean) => {
			terminalActionsSheetOpenRef.current = isPresented;
			if (isPresented) {
				setTerminalActionsSheetMounted(true);
			}
			setTerminalActionsSheetOpen(isPresented);
		},
		[],
	);

	const handleTerminalActionsDismiss = useCallback(() => {
		if (!terminalActionsSheetOpenRef.current) {
			setTerminalActionsSheetMounted(false);
		}
	}, []);

	const clearRuntimeControlErrors = useCallback(() => {
		const isControlError = (message: string) =>
			isRecoverableWorkspaceRuntimeError(message) ||
			isHostRelayUnavailableMessage(message);
		setSnapshotError((current) =>
			current && isControlError(current) ? null : current,
		);
		setRunState((current) =>
			current.status === "error" && isControlError(current.message)
				? { status: "idle" }
				: current,
		);
	}, []);

	useEffect(() => {
		const handleKeyboardFrame = (event: KeyboardEvent) => {
			const bottomInset = Math.max(0, height - event.endCoordinates.screenY);
			setTerminalKeyboardBottomInset(bottomInset);
			if (bottomInset > 0) {
				setTerminalKeyboardAccessoryVisible(true);
			}
		};
		const handleKeyboardHide = () => {
			setTerminalKeyboardBottomInset(0);
			setTerminalKeyboardAccessoryVisible(false);
		};
		const showSubscription = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
			handleKeyboardFrame,
		);
		const hideSubscription = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
			handleKeyboardHide,
		);

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, [height]);
	const [activeTerminalRun, setActiveTerminalRun] =
		useState<TerminalAgentRun | null>(null);

	const sortedChatSessions = useMemo(
		() =>
			[...chatSessions]
				.filter(
					(session) => !optimisticallyDeletedConversationIds.has(session.id),
				)
				.sort(
					(left, right) =>
						new Date(right.lastActiveAt).getTime() -
						new Date(left.lastActiveAt).getTime(),
				),
		[chatSessions, optimisticallyDeletedConversationIds],
	);
	const worktreeWindowItems = useMemo<WorktreeWindowListItem[]>(() => {
		const persistedIds = new Set(
			sortedChatSessions.map((session) => session.id),
		);
		const localItems = Array.from(localSessionIds)
			.filter((sessionId) => !persistedIds.has(sessionId))
			.filter(
				(sessionId) => !optimisticallyDeletedConversationIds.has(sessionId),
			)
			.map((sessionId, index) => ({
				id: `chat:${sessionId}`,
				kind: "chat" as const,
				resourceId: sessionId,
				title:
					index === 0 ? "New conversation" : `New conversation ${index + 1}`,
				subtitle: "Syncing",
				isLocal: true,
			}));
		const persistedItems = sortedChatSessions.map((session, index) => ({
			id: `chat:${session.id}`,
			kind: "chat" as const,
			resourceId: session.id,
			title: sessionTitle(session, index),
			subtitle: `Chat · ${formatSessionTime(session.lastActiveAt)}`,
			isLocal: false,
		}));
		const terminalItems = [...terminalSessions]
			.sort((left, right) => right.createdAt - left.createdAt)
			.map((session) => ({
				id: `terminal:${session.terminalId}`,
				kind: "terminal" as const,
				resourceId: session.terminalId,
				title:
					session.title?.trim() || `Terminal ${shortId(session.terminalId)}`,
				subtitle: session.exited
					? `Terminal · exited${session.exitCode ? ` ${session.exitCode}` : ""}`
					: session.attached
						? "Terminal · attached"
						: "Terminal · running",
				isLocal: false,
			}));
		const activeTerminalItem = activeTerminalRun
			? [
					{
						id: `terminal:${activeTerminalRun.terminalId}`,
						kind: "terminal" as const,
						resourceId: activeTerminalRun.terminalId,
						title:
							activeTerminalRun.label ||
							`Terminal ${shortId(activeTerminalRun.terminalId)}`,
						subtitle: activeTerminalRun.exited
							? activeTerminalRun.exitCode === null
								? "Terminal · exited"
								: `Terminal · exited ${activeTerminalRun.exitCode}`
							: "Terminal · running",
						isLocal: false,
					},
				]
			: [];
		const chatItems = [...localItems, ...persistedItems].sort((left, right) => {
			if (!selectedSessionId) return 0;
			if (left.resourceId === selectedSessionId) return -1;
			if (right.resourceId === selectedSessionId) return 1;
			return 0;
		});
		const inactiveTerminalItems = activeTerminalRun
			? terminalItems.filter(
					(item) => item.resourceId !== activeTerminalRun.terminalId,
				)
			: terminalItems;
		return [...activeTerminalItem, ...chatItems, ...inactiveTerminalItems];
	}, [
		activeTerminalRun,
		localSessionIds,
		optimisticallyDeletedConversationIds,
		selectedSessionId,
		sortedChatSessions,
		terminalSessions,
	]);
	const selectedConversationCount = selectedConversationIds.size;
	const hasDeletableConversations = worktreeWindowItems.some(
		(item) => item.kind === "chat" || item.kind === "terminal",
	);
	const conversationManagementHint = conversationManagementNotice;
	const selectedConversationDeleteIsBusy = Array.from(
		selectedConversationIds,
	).some((sessionId) => deletingConversationIds.has(sessionId));
	const selectedSession = useMemo(
		() =>
			sortedChatSessions.find((session) => session.id === selectedSessionId) ??
			null,
		[sortedChatSessions, selectedSessionId],
	);
	const selectedSessionIsLocal =
		selectedSessionId !== null && localSessionIds.has(selectedSessionId);
	const selectedSessionIndex = selectedSession
		? sortedChatSessions.findIndex(
				(session) => session.id === selectedSession.id,
			)
		: -1;
	const conversationTitle = selectedSession
		? sessionTitle(selectedSession, selectedSessionIndex)
		: selectedSessionId
			? "New conversation"
			: "Start conversation";
	const hostIsOnline = host?.isOnline ?? null;
	const hostName = host?.name ?? `Host ${shortId(workspace.hostId)}`;
	const hostUpdatedAtKey = hostUpdatedAtMs(host?.updatedAt);
	const cloudCanUseHost = hostIsOnline === true && hasHostAccess === true;
	const agentOptions = agents.length > 0 ? agents : fallbackAgentOptions;
	const chatAgentOptions = agentOptions.filter(
		(agent) => agent.kind === "chat",
	);
	const terminalAgentOptions = agentOptions.filter(
		(agent) => agent.kind === "terminal",
	);
	const terminalPresetOptions =
		terminalPresets.length > 0
			? [...terminalPresets].sort((left, right) => left.order - right.order)
			: fallbackTerminalPresetOptions;
	const fallbackChatAgent =
		fallbackAgentOptions.find((agent) => agent.kind === "chat") ??
		fallbackAgentOptions[0];
	const fallbackTerminalAgent =
		fallbackAgentOptions.find((agent) => agent.kind === "terminal") ??
		fallbackAgentOptions[0];
	const selectedAgent =
		activeSurfaceKind === "chat"
			? (chatAgentOptions.find((agent) => agent.id === selectedAgentId) ??
				chatAgentOptions[0] ??
				fallbackChatAgent)
			: (terminalAgentOptions.find((agent) => agent.id === selectedAgentId) ??
				terminalAgentOptions[0] ??
				fallbackTerminalAgent);
	const selectedAgentLabel = agentDisplayLabel(selectedAgent);
	const selectedTerminalAgent =
		selectedAgent.kind === "terminal"
			? selectedAgent
			: (terminalAgentOptions[0] ?? fallbackTerminalAgent);
	const activeWindowTitle =
		activeSurfaceKind === "terminal"
			? (activeTerminalRun?.label ?? "Terminal")
			: conversationTitle;
	const projectName = project?.name ?? "Workspace";
	const workspaceDisplayTitle = compactWorkspaceTitle(
		workspace.name,
		project?.name ?? null,
	);
	const detailHeaderSubtitle = `${projectName} · ${hostName}`;
	const runErrorMessage = runState.status === "error" ? runState.message : null;
	const relayUnavailableError = firstMatchingRuntimeError(
		isHostRelayUnavailableMessage,
		snapshotError,
		runErrorMessage,
		chatModelError,
		agentError,
		terminalListError,
	);
	const workspaceUnavailableError = firstMatchingRuntimeError(
		isRecoverableWorkspaceRuntimeError,
		snapshotError,
		runErrorMessage,
	);
	const runtimeHostUnavailableMessage = relayUnavailableError
		? "Relay 暂时无法连接这台主机。"
		: null;
	const runtimeWorkspaceUnavailableMessage =
		!runtimeHostUnavailableMessage && workspaceUnavailableError
			? "这个 Worktree 在主机上缺失或无法恢复。"
			: null;
	const runtimeControlMessage =
		runtimeHostUnavailableMessage ?? runtimeWorkspaceUnavailableMessage;
	const canUseHost = cloudCanUseHost && !runtimeControlMessage;
	const visibleSnapshotError =
		snapshotError && !runtimeControlMessage ? snapshotError : null;
	const effectiveHostIsOnline = runtimeHostUnavailableMessage
		? false
		: runtimeWorkspaceUnavailableMessage
			? null
			: hostIsOnline;
	const hostControlLabel = runtimeHostUnavailableMessage
		? "主机断开连接"
		: runtimeWorkspaceUnavailableMessage
			? "Worktree 不可用"
			: hostIsOnline === false
				? "主机离线"
				: hostIsOnline === null
					? "主机状态未知"
					: hasHostAccess === false
						? "无主机权限"
						: hasHostAccess === null
							? "正在检查权限"
							: "可控制";
	const hostControlMessage = runtimeHostUnavailableMessage
		? runtimeHostUnavailableMessage
		: runtimeWorkspaceUnavailableMessage
			? runtimeWorkspaceUnavailableMessage
			: hasHostAccess === false
				? "当前账号可以查看这个 Worktree，但没有控制主机的权限。"
				: hostIsOnline === false
					? "拥有这个 Worktree 的电脑当前离线。"
					: hostIsOnline === null || hasHostAccess === null
						? "正在同步主机状态和访问权限。"
						: "";
	const displayedActiveWindowTitle =
		activeSurfaceKind === "chat" && !canUseHost && !selectedSessionId
			? hostControlLabel
			: activeWindowTitle;
	const hostReachability = hostReachabilityLabel({
		isOnline: effectiveHostIsOnline,
		updatedAt: host?.updatedAt,
	});
	const hostDrawerStatus =
		hostReachability === hostControlLabel
			? hostReachability
			: `${hostReachability} - ${hostControlLabel}`;
	const defaultChatModel = chatModels[0] ?? null;
	const selectedChatModel =
		chatModels.find((model) => model.id === selectedModelId) ??
		defaultChatModel;
	const visibleChatRuntimeError = chatDisplayState?.errorMessage
		? formatChatRuntimeDisplayError(
				chatDisplayState.errorMessage,
				selectedChatModel,
			)
		: null;
	const chatModelControlLabel = loadingChatModels
		? "正在加载模型"
		: chatModelError
			? "模型不可用"
			: !selectedChatModel
				? "无可用模型"
				: "可用";
	const chatModelControlMessage = loadingChatModels
		? "正在启动 Agent 前读取主机对话模型。"
		: chatModelError
			? chatModelError
			: !selectedChatModel
				? "这台主机还没有配置可用的对话模型。"
				: "";
	const canSendChat =
		canUseHost &&
		activeSurfaceKind === "chat" &&
		selectedAgent.kind === "chat" &&
		Boolean(selectedChatModel) &&
		!loadingChatModels &&
		!chatModelError;
	const canWriteTerminalInput =
		canUseHost &&
		activeSurfaceKind === "terminal" &&
		activeTerminalRun !== null &&
		!activeTerminalRun.exited;
	const activeTerminalLiveStatus =
		terminalLiveStatus.terminalId === activeTerminalRun?.terminalId
			? terminalLiveStatus
			: null;
	const terminalLiveTransportIsActive =
		activeTerminalRun !== null &&
		terminalLiveSocketRef.current?.terminalId ===
			activeTerminalRun.terminalId &&
		terminalLiveSocketRef.current.state !== "idle" &&
		terminalLiveSocketRef.current.state !== "error";
	const terminalLiveTransportCanReplacePolling =
		terminalLiveTransportIsActive &&
		(activeTerminalRun.outputTail.length > 0 ||
			terminalLiveSocketRef.current?.receivedBytes === true);
	const canSendPrompt = canSendChat;
	const composerPlaceholder = !canUseHost
		? hostControlLabel
		: canSendChat
			? "向 Claude Code 提问"
			: chatModelControlLabel;
	const trimmedPrompt = prompt.trim();
	const workspacePath = `${projectName} / ${workspace.name}`;
	const workspaceRuntimeKey = `${workspace.id}:${workspace.hostId}`;
	const drawerWidth = Math.min(width * 0.88, 360);
	const terminalAgentIsRunning =
		activeTerminalRun !== null &&
		activeSurfaceKind === "terminal" &&
		!activeTerminalRun.exited;
	const shouldShowTerminalWaitingIndicator =
		terminalAgentIsRunning &&
		cloudCanUseHost &&
		activeTerminalRun.outputTail.length === 0 &&
		!activeTerminalRun.hasLoadedSnapshot &&
		activeTerminalLiveStatus?.state !== "error" &&
		!activeTerminalRun.errorMessage &&
		!snapshotError;
	const pendingApproval = pendingApprovalView(
		chatDisplayState?.pendingApproval,
	);
	const pendingQuestion = pendingQuestionView(
		chatDisplayState?.pendingQuestion,
	);
	const pendingPlanApproval = pendingPlanApprovalView(
		chatDisplayState?.pendingPlanApproval,
	);
	const agentIsRunning =
		runState.status === "sending" ||
		(activeSurfaceKind === "chat" && chatDisplayState?.isRunning === true);
	const canStopActiveChat =
		activeSurfaceKind === "chat" &&
		selectedSessionId !== null &&
		(runState.status === "sending" || chatDisplayState?.isRunning === true);
	const canEndActiveChat =
		activeSurfaceKind === "chat" && selectedSessionId !== null;

	const mergeTerminalSnapshotIntoRun = useCallback(
		(
			current: TerminalAgentRun,
			snapshot: WorkspaceTerminalSnapshot,
			options: { replayInitialSnapshot: boolean } = {
				replayInitialSnapshot: true,
			},
		): TerminalAgentRun => {
			const terminalId = current.terminalId;
			const previousRawTail = terminalRawTailByIdRef.current.get(terminalId);
			const delta = terminalTailDelta(previousRawTail, snapshot.outputTail);
			const restoreRevision = current.restoreRevision;

			if (current.suppressReplayUntilDelta) {
				if (previousRawTail === undefined) {
					const shouldReplayInitialSnapshot =
						options.replayInitialSnapshot &&
						shouldReplayInitialTerminalSnapshot(snapshot.outputTail);
					if (shouldReplayInitialSnapshot) {
						terminalRawTailByIdRef.current.set(terminalId, snapshot.outputTail);
					}
					return {
						...current,
						outputTail: shouldReplayInitialSnapshot
							? snapshot.outputTail
							: current.outputTail,
						restoreRevision,
						hasLoadedSnapshot: true,
						suppressReplayUntilDelta: !shouldReplayInitialSnapshot,
						exited: snapshot.exited,
						exitCode: snapshot.exitCode ?? null,
						errorMessage: null,
					};
				}

				if (delta.length > 0) {
					terminalRawTailByIdRef.current.set(terminalId, snapshot.outputTail);
					return {
						...current,
						outputTail: current.outputTail + delta,
						restoreRevision,
						hasLoadedSnapshot: true,
						suppressReplayUntilDelta: false,
						exited: snapshot.exited,
						exitCode: snapshot.exitCode ?? null,
						errorMessage: null,
					};
				}

				terminalRawTailByIdRef.current.set(terminalId, snapshot.outputTail);
				return {
					...current,
					restoreRevision,
					hasLoadedSnapshot: true,
					exited: snapshot.exited,
					exitCode: snapshot.exitCode ?? null,
					errorMessage: null,
				};
			}

			terminalRawTailByIdRef.current.set(terminalId, snapshot.outputTail);
			return {
				...current,
				outputTail:
					previousRawTail === undefined
						? snapshot.outputTail
						: current.outputTail + delta,
				restoreRevision,
				hasLoadedSnapshot: true,
				exited: snapshot.exited,
				exitCode: snapshot.exitCode ?? null,
				errorMessage: null,
			};
		},
		[],
	);

	useEffect(() => {
		const firstSessionId = sortedChatSessions[0]?.id ?? null;
		if (!selectedSessionId) {
			if (firstSessionId) setSelectedSessionId(firstSessionId);
			return;
		}

		const selectedSessionExists =
			sortedChatSessions.some((session) => session.id === selectedSessionId) ||
			localSessionIds.has(selectedSessionId);
		if (!selectedSessionExists) {
			setSelectedSessionId(firstSessionId);
			setMessages([]);
		}
	}, [localSessionIds, selectedSessionId, sortedChatSessions]);

	useEffect(() => {
		if (localSessionIds.size === 0 || sortedChatSessions.length === 0) return;
		setLocalSessionIds((current) => {
			const next = new Set(current);
			for (const session of sortedChatSessions) {
				next.delete(session.id);
			}
			return next.size === current.size ? current : next;
		});
	}, [localSessionIds.size, sortedChatSessions]);

	useEffect(() => {
		const visibleWindowIds = new Set(
			worktreeWindowItems.map((item) => item.resourceId),
		);
		setSelectedConversationIds((current) => {
			const next = new Set(
				Array.from(current).filter((resourceId) =>
					visibleWindowIds.has(resourceId),
				),
			);
			return next.size === current.size ? current : next;
		});
		if (conversationSelectionMode && visibleWindowIds.size === 0) {
			setConversationSelectionMode(false);
		}
	}, [conversationSelectionMode, worktreeWindowItems]);

	useEffect(() => {
		if (conversationSelectionMode && selectedConversationIds.size === 0) {
			setConversationSelectionMode(false);
		}
	}, [conversationSelectionMode, selectedConversationIds.size]);

	useEffect(() => {
		if (!workspaceRuntimeKey) return;
		setAgentError(null);
		setChatModelError(null);
		setTerminalListError(null);
		setTerminalCreateError(null);
		setSnapshotError(null);
		setConversationError(null);
		setChatLifecycleError(null);
		setPendingActionError(null);
		setTerminalPresetError(null);
		setTerminalPresets(fallbackTerminalPresetOptions);
		setActiveTerminalRun(null);
		setTerminalLiveStatus({
			terminalId: null,
			state: "idle",
			message: null,
		});
		setTerminalSessions([]);
		setSelectedModelId(null);
		terminalRawTailByIdRef.current.clear();
		redrawnTerminalIdsRef.current.clear();
	}, [workspaceRuntimeKey]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hostUpdatedAtKey intentionally retries host-control probes when host heartbeat changes.
	useEffect(() => {
		if (!cloudCanUseHost) {
			setAgents(fallbackAgentOptions);
			setLoadingAgents(false);
			setAgentError(null);
			return;
		}

		let cancelled = false;
		setLoadingAgents(true);
		setAgentError(null);
		apiClient.v2Workspace.listAgents
			.query({ workspaceId: workspace.id })
			.then((result) => {
				if (!cancelled) {
					clearRuntimeControlErrors();
					setAgents(mergeAgentOptions(result));
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setAgents(fallbackAgentOptions);
					setAgentError(
						formatWorkspaceRuntimeError(
							error,
							"Failed to load workspace agents",
						),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingAgents(false);
			});

		return () => {
			cancelled = true;
		};
	}, [
		clearRuntimeControlErrors,
		cloudCanUseHost,
		hostUpdatedAtKey,
		workspace.id,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hostUpdatedAtKey intentionally retries host-control probes when host heartbeat changes.
	useEffect(() => {
		if (!cloudCanUseHost) {
			setTerminalPresets(fallbackTerminalPresetOptions);
			setLoadingTerminalPresets(false);
			setTerminalPresetError(null);
			return;
		}

		let cancelled = false;
		setLoadingTerminalPresets(true);
		setTerminalPresetError(null);
		apiClient.v2Workspace.listTerminalPresets
			.query({ workspaceId: workspace.id })
			.then((result) => {
				if (!cancelled) {
					clearRuntimeControlErrors();
					setTerminalPresets(
						result.length > 0 ? result : fallbackTerminalPresetOptions,
					);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setTerminalPresets(fallbackTerminalPresetOptions);
					setTerminalPresetError(
						formatWorkspaceRuntimeError(
							error,
							"Failed to load terminal presets",
						),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingTerminalPresets(false);
			});

		return () => {
			cancelled = true;
		};
	}, [
		clearRuntimeControlErrors,
		cloudCanUseHost,
		hostUpdatedAtKey,
		workspace.id,
	]);

	useEffect(() => {
		if (
			agentOptions.some(
				(agent) =>
					agent.id === selectedAgentId && agent.kind === activeSurfaceKind,
			)
		) {
			return;
		}
		const nextAgent =
			activeSurfaceKind === "terminal"
				? (agentOptions.find((agent) => agent.kind === "terminal") ??
					fallbackTerminalAgent)
				: (agentOptions.find((agent) => agent.kind === "chat") ??
					fallbackChatAgent);
		setSelectedAgentId(nextAgent.id);
		setActiveSurfaceKind(nextAgent.kind);
	}, [
		activeSurfaceKind,
		agentOptions,
		fallbackChatAgent,
		fallbackTerminalAgent,
		selectedAgentId,
	]);

	useEffect(() => {
		if (chatModels.length === 0) {
			setSelectedModelId(null);
			return;
		}
		if (
			selectedModelId &&
			chatModels.some((model) => model.id === selectedModelId)
		) {
			return;
		}
		setSelectedModelId(chatModels[0]?.id ?? null);
	}, [chatModels, selectedModelId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset transient chat state when the selected workspace or conversation changes.
	useEffect(() => {
		setRunState((current) => {
			const submittedPrompt = runStateSubmittedPrompt(current);
			return submittedPrompt?.sessionId === selectedSessionId
				? current
				: { status: "idle" };
		});
		setSnapshotError(null);
		setConversationError(null);
		setPendingActionError(null);
		setPendingActionSending(null);
		setChatLifecycleError(null);
		setChatLifecycleAction(null);
		setQuestionAnswer("");
	}, [selectedSessionId, workspace.id]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset the draft answer when the active pending question changes.
	useEffect(() => {
		setQuestionAnswer("");
	}, [pendingQuestion?.questionId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hostUpdatedAtKey intentionally retries host-control probes when host heartbeat changes.
	useEffect(() => {
		if (!cloudCanUseHost) {
			setChatModels([]);
			setLoadingChatModels(false);
			setChatModelError(null);
			return;
		}

		let cancelled = false;
		setChatModels([]);
		setLoadingChatModels(true);
		setChatModelError(null);
		apiClient.v2Workspace.listChatModels
			.query({ workspaceId: workspace.id })
			.then((result) => {
				if (!cancelled) {
					clearRuntimeControlErrors();
					setChatModels(result);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setChatModels([]);
					setChatModelError(
						formatWorkspaceRuntimeError(error, "Failed to load chat models"),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingChatModels(false);
			});

		return () => {
			cancelled = true;
		};
	}, [
		clearRuntimeControlErrors,
		cloudCanUseHost,
		hostUpdatedAtKey,
		workspace.id,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hostUpdatedAtKey intentionally retries terminal discovery when host heartbeat changes.
	useEffect(() => {
		if (!cloudCanUseHost) {
			setTerminalSessions([]);
			setLoadingTerminals(false);
			setTerminalListError(null);
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		setLoadingTerminals(true);
		setTerminalListError(null);

		const loadTerminals = async () => {
			let nextDelayMs: number | null = 5000;
			try {
				const result = await apiClient.v2Workspace.listTerminals.query({
					workspaceId: workspace.id,
				});
				if (cancelled) return;
				clearRuntimeControlErrors();
				setTerminalSessions(result.sessions);
				setTerminalListError(null);
			} catch (error) {
				if (!cancelled) {
					const message = formatWorkspaceRuntimeError(
						error,
						"Failed to list terminals",
					);
					const relayUnavailable = isHostRelayUnavailableMessage(message);
					nextDelayMs = relayUnavailable ? 5000 : 10_000;
					if (!relayUnavailable) {
						setTerminalSessions([]);
					}
					setTerminalListError(message);
				}
			} finally {
				if (!cancelled) {
					setLoadingTerminals(false);
					if (nextDelayMs !== null) {
						timer = setTimeout(loadTerminals, nextDelayMs);
					}
				}
			}
		};

		void loadTerminals();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [
		clearRuntimeControlErrors,
		cloudCanUseHost,
		hostUpdatedAtKey,
		workspace.id,
	]);

	useEffect(() => {
		if (!selectedSessionId) {
			if (!selectedSessionId) setMessages([]);
			setChatDisplayState(null);
			setLoadingMessages(false);
			return;
		}

		if (cloudCanUseHost) {
			setLoadingMessages(false);
			return;
		}

		let cancelled = false;
		setLoadingMessages(true);
		apiClient.chat.listMessages
			.query({ sessionId: selectedSessionId })
			.then((result) => {
				if (!cancelled) setMessages(result);
			})
			.catch(() => {
				if (!cancelled) setMessages([]);
			})
			.finally(() => {
				if (!cancelled) setLoadingMessages(false);
			});
		return () => {
			cancelled = true;
		};
	}, [cloudCanUseHost, selectedSessionId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hostUpdatedAtKey intentionally retries host snapshots when host heartbeat changes.
	useEffect(() => {
		if (
			!selectedSessionId ||
			!cloudCanUseHost ||
			activeSurfaceKind !== "chat"
		) {
			setChatDisplayState(null);
			setSnapshotError(null);
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		setLoadingMessages(true);

		const loadSnapshot = async () => {
			let nextDelayMs: number | null = 1000;
			try {
				const snapshot = await apiClient.v2Workspace.getChatSnapshot.query({
					workspaceId: workspace.id,
					sessionId: selectedSessionId,
				});
				if (cancelled) return;
				const snapshotMessages = materializeSnapshotMessages(snapshot);
				clearRuntimeControlErrors();
				setSnapshotError(null);
				setChatDisplayState(snapshot.displayState);
				setMessages((currentMessages) =>
					mergeSnapshotMessagesWithPending({
						snapshotMessages,
						currentMessages,
					}),
				);
				if (hasSnapshotFeedback(snapshot)) {
					setRunState((current) =>
						shouldClearRunStateFromSnapshot({
							runState: current,
							selectedSessionId,
							snapshotMessages,
						})
							? { status: "idle" }
							: current,
					);
				}
			} catch (error) {
				if (!cancelled) {
					const message = formatWorkspaceRuntimeError(
						error,
						"Failed to load workspace chat",
					);
					nextDelayMs = isHostRelayUnavailableMessage(message) ? null : 5000;
					setSnapshotError(message);
					setChatDisplayState(null);
				}
			} finally {
				if (!cancelled) {
					if (nextDelayMs !== null) {
						timer = setTimeout(loadSnapshot, nextDelayMs);
					}
					setLoadingMessages(false);
				}
			}
		};

		void loadSnapshot();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [
		activeSurfaceKind,
		clearRuntimeControlErrors,
		cloudCanUseHost,
		hostUpdatedAtKey,
		selectedSessionId,
		workspace.id,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: live terminal transport is keyed by terminal identity and host-control reachability.
	useEffect(() => {
		if (!activeTerminalRun || !cloudCanUseHost) {
			terminalLiveSocketRef.current?.socket?.close();
			terminalLiveSocketRef.current = null;
			setTerminalLiveStatus({
				terminalId: null,
				state: "idle",
				message: null,
			});
			return;
		}

		let cancelled = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let decodeQueue: Promise<void> = Promise.resolve();
		const terminalId = activeTerminalRun.terminalId;
		const decoder = new TextDecoder("utf-8");
		const liveRef: TerminalLiveSocketRef = {
			terminalId,
			socket: null,
			state: "connecting",
			receivedBytes: activeTerminalRun.outputTail.length > 0,
		};
		terminalLiveSocketRef.current?.socket?.close();
		terminalLiveSocketRef.current = liveRef;
		setTerminalLiveStatus({
			terminalId,
			state: "connecting",
			message: null,
		});

		const setLiveState = (
			state: TerminalLiveConnectionState,
			message: string | null = null,
		) => {
			if (terminalLiveSocketRef.current === liveRef) {
				liveRef.state = state;
			}
			setTerminalLiveStatus((current) =>
				current.terminalId === terminalId
					? { terminalId, state, message }
					: current,
			);
		};

		const closeSocket = () => {
			liveRef.socket?.close();
			liveRef.socket = null;
		};

		const connect = async (attempt: number) => {
			closeSocket();
			setLiveState(attempt === 0 ? "connecting" : "reconnecting");

			try {
				const descriptor =
					await apiClient.v2Workspace.getTerminalAttachDescriptor.query({
						workspaceId: workspace.id,
						terminalId,
						replay: !liveRef.receivedBytes,
					});
				if (cancelled || terminalLiveSocketRef.current !== liveRef) return;

				const socket = new WebSocket(descriptor.webSocketUrl);
				socket.binaryType = "arraybuffer";
				liveRef.socket = socket;

				socket.onmessage = (event) => {
					decodeQueue = decodeQueue
						.then(async () => {
							const frame = await terminalLiveFrameFromData(
								event.data,
								decoder,
							);
							if (
								cancelled ||
								terminalLiveSocketRef.current !== liveRef ||
								!frame
							) {
								return;
							}

							if (frame.type === "output") {
								if (frame.text.length === 0) return;
								liveRef.receivedBytes = true;
								clearRuntimeControlErrors();
								setLiveState("live");
								setActiveTerminalRun((current) => {
									if (current?.terminalId !== terminalId) return current;
									const outputTail = current.outputTail + frame.text;
									terminalRawTailByIdRef.current.set(terminalId, outputTail);
									return {
										...current,
										outputTail,
										hasLoadedSnapshot: true,
										suppressReplayUntilDelta: false,
										errorMessage: null,
									};
								});
								return;
							}

							const message = frame.message;
							switch (message.type) {
								case "attached":
									clearRuntimeControlErrors();
									setLiveState("live");
									break;
								case "title":
									setActiveTerminalRun((current) =>
										current?.terminalId === terminalId && message.title
											? {
													...current,
													label: message.title,
													errorMessage: null,
												}
											: current,
									);
									break;
								case "exit":
									setLiveState("exited");
									setActiveTerminalRun((current) =>
										current?.terminalId === terminalId
											? {
													...current,
													exited: true,
													exitCode: message.exitCode ?? null,
													errorMessage: null,
												}
											: current,
									);
									break;
								case "error":
									setLiveState("error", message.message);
									setActiveTerminalRun((current) =>
										current?.terminalId === terminalId
											? {
													...current,
													errorMessage: message.message,
												}
											: current,
									);
									break;
							}
						})
						.catch(() => undefined);
				};

				socket.onerror = () => {
					if (cancelled || terminalLiveSocketRef.current !== liveRef) return;
					setLiveState("error", "Terminal stream error");
				};

				socket.onclose = () => {
					if (
						cancelled ||
						terminalLiveSocketRef.current !== liveRef ||
						liveRef.state === "exited" ||
						liveRef.state === "error"
					) {
						return;
					}
					setLiveState("reconnecting");
					const delayMs = Math.min(5000, 500 * 2 ** Math.min(attempt, 3));
					reconnectTimer = setTimeout(() => {
						void connect(attempt + 1);
					}, delayMs);
				};
			} catch (error) {
				if (cancelled || terminalLiveSocketRef.current !== liveRef) return;
				setLiveState(
					"error",
					formatWorkspaceRuntimeError(
						error,
						"Failed to attach terminal stream",
					),
				);
			}
		};

		void connect(0);

		return () => {
			cancelled = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			closeSocket();
			if (terminalLiveSocketRef.current === liveRef) {
				terminalLiveSocketRef.current = null;
			}
		};
	}, [
		activeTerminalRun?.terminalId,
		clearRuntimeControlErrors,
		cloudCanUseHost,
		workspace.id,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: terminal polling is keyed by terminal identity and live transport state; output text updates must not restart the loop.
	useEffect(() => {
		if (!activeTerminalRun || !cloudCanUseHost) {
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const terminalRun = activeTerminalRun;

		const loadTerminalSnapshot = async () => {
			let nextDelayMs: number | null = terminalLiveTransportCanReplacePolling
				? terminalLiveSnapshotReconcileIntervalMs
				: terminalSnapshotPollIntervalMs;
			try {
				const snapshot = await apiClient.v2Workspace.getTerminalSnapshot.query({
					workspaceId: workspace.id,
					terminalId: terminalRun.terminalId,
					maxBytes: 32 * 1024,
				});
				if (cancelled) return;

				clearRuntimeControlErrors();
				shouldFollowChatOutputRef.current = true;
				const liveSocket = terminalLiveSocketRef.current;
				const replayInitialSnapshot =
					liveSocket?.terminalId !== terminalRun.terminalId ||
					liveSocket.state === "error";
				setActiveTerminalRun((current) =>
					current?.terminalId === terminalRun.terminalId
						? mergeTerminalSnapshotIntoRun(current, snapshot, {
								replayInitialSnapshot,
							})
						: current,
				);

				if (snapshot.exited) {
					nextDelayMs = null;
					setRunState({ status: "idle" });
				}
			} catch (error) {
				if (cancelled) return;
				const message = formatWorkspaceRuntimeError(
					error,
					"Failed to load terminal output",
				);
				const terminalGone =
					message.includes("Terminal session not found") ||
					message.includes("Terminal session does not belong");
				const runtimeUnavailable =
					isHostRelayUnavailableMessage(message) ||
					isRecoverableWorkspaceRuntimeError(message);
				nextDelayMs = terminalGone ? null : 5000;
				if (runtimeUnavailable) {
					setSnapshotError(message);
				}
				shouldFollowChatOutputRef.current = true;
				setActiveTerminalRun((current) =>
					current?.terminalId === terminalRun.terminalId
						? {
								...current,
								exited: terminalGone ? true : current.exited,
								errorMessage: message,
							}
						: current,
				);
				setRunState({ status: "idle" });
			} finally {
				if (!cancelled && nextDelayMs !== null) {
					timer = setTimeout(loadTerminalSnapshot, nextDelayMs);
				}
			}
		};

		void loadTerminalSnapshot();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [
		activeTerminalRun?.terminalId,
		clearRuntimeControlErrors,
		cloudCanUseHost,
		terminalLiveTransportCanReplacePolling,
		terminalSnapshotRefreshEpoch,
		workspace.id,
	]);

	const selectTerminalSession = useCallback(
		(terminal: WorkspaceTerminalSession) => {
			setTerminalCreateError(null);
			setSelectedAgentId(selectedTerminalAgent.id);
			setActiveSurfaceKind("terminal");
			setActiveTerminalRun({
				terminalId: terminal.terminalId,
				label:
					terminal.title?.trim() || `Terminal ${shortId(terminal.terminalId)}`,
				prompt: terminal.title?.trim() || "Attached terminal",
				createdAt: new Date(terminal.createdAt),
				outputTail: "",
				restoreRevision: 0,
				hasLoadedSnapshot: false,
				suppressReplayUntilDelta: true,
				exited: terminal.exited,
				exitCode: terminal.exitCode ?? null,
				errorMessage: null,
			});
			shouldFollowChatOutputRef.current = true;
		},
		[selectedTerminalAgent.id],
	);

	const handleCreateTerminalSession = useCallback(async () => {
		if (!canUseHost || creatingTerminal) return;

		setCreatingTerminal(true);
		setTerminalCreateError(null);
		setRunState({ status: "idle" });

		try {
			const terminalSize = terminalSizeRef.current;
			const result = await apiClient.v2Workspace.createTerminal.mutate({
				workspaceId: workspace.id,
				...(terminalSize
					? { cols: terminalSize.cols, rows: terminalSize.rows }
					: {}),
			});
			const createdAt = Date.now();
			const label = `Terminal ${shortId(result.terminalId)}`;
			setActiveSurfaceKind("terminal");
			setSelectedAgentId(selectedTerminalAgent.id);
			setActiveTerminalRun({
				terminalId: result.terminalId,
				label,
				prompt: "Host terminal",
				createdAt: new Date(createdAt),
				outputTail: "",
				restoreRevision: 0,
				hasLoadedSnapshot: false,
				suppressReplayUntilDelta: true,
				exited: false,
				exitCode: null,
				errorMessage: null,
			});
			setTerminalSessions((current) =>
				current.some((session) => session.terminalId === result.terminalId)
					? current
					: [
							{
								terminalId: result.terminalId,
								workspaceId: workspace.id,
								createdAt,
								exited: false,
								exitCode: 0,
								attached: false,
								title: label,
							},
							...current,
						],
			);
			shouldFollowChatOutputRef.current = true;
		} catch (error) {
			setTerminalCreateError(
				formatWorkspaceRuntimeError(error, "Failed to create terminal"),
			);
		} finally {
			setCreatingTerminal(false);
		}
	}, [canUseHost, creatingTerminal, selectedTerminalAgent.id, workspace.id]);

	const handleCreateTerminalWindow = () => {
		setSwitcherOpen(false);
		closeTerminalActionsSheet();
		setTerminalCreateError(null);
		setSelectedAgentId(selectedTerminalAgent.id);
		setActiveTerminalRun(null);
		setActiveSurfaceKind("terminal");
		void handleCreateTerminalSession();
	};

	const clearDeletedActiveConversation = useCallback(
		(deletedSessionIds: Set<string>) => {
			if (
				activeSurfaceKind !== "chat" ||
				!selectedSessionId ||
				!deletedSessionIds.has(selectedSessionId)
			) {
				return;
			}
			setSelectedSessionId(null);
			setMessages([]);
			setChatDisplayState(null);
			setRunState({ status: "idle" });
			setActiveSurfaceKind("terminal");
			shouldFollowChatOutputRef.current = true;
		},
		[activeSurfaceKind, selectedSessionId],
	);

	const toggleConversationSelection = useCallback((sessionId: string) => {
		setSelectedConversationIds((current) => {
			const next = new Set(current);
			if (next.has(sessionId)) {
				next.delete(sessionId);
			} else {
				next.add(sessionId);
			}
			return next;
		});
	}, []);

	const enterConversationSelectionMode = useCallback(() => {
		setConversationDeleteError(null);
		setConversationManagementNotice(null);
		setOpenSwipedConversationId(null);
		setConversationSelectionMode(true);
	}, []);

	const handleConversationLongPress = useCallback(
		(item: WorktreeWindowListItem) => {
			if (deletingConversationIds.has(item.resourceId)) {
				return;
			}
			enterConversationSelectionMode();
			toggleConversationSelection(item.resourceId);
		},
		[
			deletingConversationIds,
			enterConversationSelectionMode,
			toggleConversationSelection,
		],
	);

	const handleExitConversationSelection = useCallback(() => {
		setConversationSelectionMode(false);
		setSelectedConversationIds(new Set());
		setOpenSwipedConversationId(null);
		setConversationDeleteError(null);
		setConversationManagementNotice(null);
	}, []);

	const handleDeleteConversations = useCallback(
		async (sessionIds: Iterable<string>) => {
			const targetIds = Array.from(new Set(sessionIds)).filter(Boolean);
			if (targetIds.length === 0) return;
			const targetItems = targetIds
				.map((resourceId) =>
					worktreeWindowItems.find((item) => item.resourceId === resourceId),
				)
				.filter((item): item is WorktreeWindowListItem => Boolean(item));
			if (targetItems.length === 0) return;

			const deletedSet = new Set(targetItems.map((item) => item.resourceId));
			const deletedChatIds = new Set(
				targetItems
					.filter((item) => item.kind === "chat")
					.map((item) => item.resourceId),
			);
			const deletedTerminalIds = new Set(
				targetItems
					.filter((item) => item.kind === "terminal")
					.map((item) => item.resourceId),
			);
			const deletedTerminalSnapshots = new Map(
				terminalSessions
					.filter((terminal) => deletedTerminalIds.has(terminal.terminalId))
					.map((terminal) => [terminal.terminalId, terminal]),
			);
			const activeTerminalWasDeleted =
				activeTerminalRun !== null &&
				deletedTerminalIds.has(activeTerminalRun.terminalId);
			const nextActiveTerminal = activeTerminalWasDeleted
				? ([...terminalSessions]
						.filter(
							(terminal) =>
								!deletedTerminalIds.has(terminal.terminalId) &&
								!terminal.exited,
						)
						.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null)
				: null;
			setConversationDeleteError(null);
			setConversationManagementNotice(null);
			setOpenSwipedConversationId(null);
			setDeletingConversationIds((current) => {
				const next = new Set(current);
				for (const resourceId of deletedSet) next.add(resourceId);
				return next;
			});
			if (deletedChatIds.size > 0) {
				setOptimisticallyDeletedConversationIds((current) => {
					const next = new Set(current);
					for (const sessionId of deletedChatIds) next.add(sessionId);
					return next;
				});
			}
			if (deletedTerminalIds.size > 0) {
				setTerminalSessions((current) =>
					current.filter(
						(terminal) => !deletedTerminalIds.has(terminal.terminalId),
					),
				);
				setTerminalLiveStatus((current) =>
					current.terminalId && deletedTerminalIds.has(current.terminalId)
						? { terminalId: null, state: "idle", message: null }
						: current,
				);
			}
			setSelectedConversationIds((current) => {
				const next = new Set(current);
				for (const resourceId of deletedSet) next.delete(resourceId);
				return next;
			});
			setConversationSelectionMode(false);
			clearDeletedActiveConversation(deletedChatIds);
			if (activeTerminalWasDeleted) {
				if (nextActiveTerminal) {
					selectTerminalSession(nextActiveTerminal);
				} else {
					setActiveTerminalRun(null);
					setTerminalCreateError(null);
					setActiveSurfaceKind("terminal");
				}
			}

			const failedChatIds: string[] = [];
			const failedTerminalIds: string[] = [];
			let failureMessage: string | null = null;

			for (const item of targetItems) {
				if (item.kind === "chat" && localSessionIds.has(item.resourceId)) {
					setLocalSessionIds((current) => {
						const next = new Set(current);
						next.delete(item.resourceId);
						return next;
					});
					continue;
				}

				try {
					if (item.kind === "chat") {
						await apiClient.chat.deleteSession.mutate({
							sessionId: item.resourceId,
						});
					} else {
						await apiClient.v2Workspace.deleteTerminal.mutate({
							workspaceId: workspace.id,
							terminalId: item.resourceId,
						});
						terminalRawTailByIdRef.current.delete(item.resourceId);
						redrawnTerminalIdsRef.current.delete(item.resourceId);
					}
				} catch (error) {
					if (item.kind === "chat") {
						failedChatIds.push(item.resourceId);
					} else {
						failedTerminalIds.push(item.resourceId);
					}
					failureMessage = formatWorkspaceRuntimeError(
						error,
						"Failed to delete session",
					);
				}
			}

			if (failedChatIds.length > 0) {
				setOptimisticallyDeletedConversationIds((current) => {
					const next = new Set(current);
					for (const sessionId of failedChatIds) next.delete(sessionId);
					return next;
				});
			}
			if (failedTerminalIds.length > 0) {
				const failedTerminals = failedTerminalIds
					.map((terminalId) => deletedTerminalSnapshots.get(terminalId))
					.filter((terminal): terminal is WorkspaceTerminalSession =>
						Boolean(terminal),
					);
				if (failedTerminals.length > 0) {
					setTerminalSessions((current) => {
						const existingIds = new Set(
							current.map((terminal) => terminal.terminalId),
						);
						const restoredTerminals = failedTerminals.filter(
							(terminal) => !existingIds.has(terminal.terminalId),
						);
						return restoredTerminals.length > 0
							? [...current, ...restoredTerminals]
							: current;
					});
				}
				if (activeTerminalWasDeleted && !nextActiveTerminal) {
					const restoredActiveTerminal =
						activeTerminalRun &&
						failedTerminalIds.includes(activeTerminalRun.terminalId)
							? deletedTerminalSnapshots.get(activeTerminalRun.terminalId)
							: null;
					if (restoredActiveTerminal) {
						selectTerminalSession(restoredActiveTerminal);
					}
				}
			}
			if (failedChatIds.length > 0 || failedTerminalIds.length > 0) {
				setConversationDeleteError(
					failureMessage ?? "Failed to delete session",
				);
			}

			setDeletingConversationIds((current) => {
				const next = new Set(current);
				for (const resourceId of deletedSet) next.delete(resourceId);
				return next;
			});
		},
		[
			activeTerminalRun,
			clearDeletedActiveConversation,
			localSessionIds,
			selectTerminalSession,
			terminalSessions,
			worktreeWindowItems,
			workspace.id,
		],
	);

	const handleSelectPanel = (item: WorktreeWindowListItem) => {
		if (conversationSelectionMode) {
			toggleConversationSelection(item.resourceId);
			return;
		}

		if (item.kind === "chat") {
			setConversationManagementNotice(null);
			setSelectedAgentId("superset");
			setActiveSurfaceKind("chat");
			setSelectedSessionId(item.resourceId);
			setRunState({ status: "idle" });
			setSwitcherOpen(false);
			closeTerminalActionsSheet();
			return;
		}

		const terminal =
			terminalSessions.find(
				(session) => session.terminalId === item.resourceId,
			) ?? null;
		if (!terminal && activeTerminalRun?.terminalId === item.resourceId) {
			setConversationManagementNotice(null);
			setTerminalCreateError(null);
			setSelectedAgentId(
				agentOptions.find((agent) => agent.kind === "terminal")?.id ?? "claude",
			);
			setActiveSurfaceKind("terminal");
			shouldFollowChatOutputRef.current = true;
			setSwitcherOpen(false);
			closeTerminalActionsSheet();
			return;
		}
		if (!terminal) return;
		setConversationManagementNotice(null);
		selectTerminalSession(terminal);
		setSwitcherOpen(false);
		closeTerminalActionsSheet();
	};

	useEffect(() => {
		if (
			!initialTerminalId ||
			appliedInitialTerminalIdRef.current === initialTerminalId
		) {
			return;
		}

		const terminal = terminalSessions.find(
			(session) => session.terminalId === initialTerminalId,
		);
		if (!terminal) return;

		selectTerminalSession(terminal);
		appliedInitialTerminalIdRef.current = initialTerminalId;
	}, [initialTerminalId, selectTerminalSession, terminalSessions]);

	useEffect(() => {
		if (activeSurfaceKind !== "terminal" || activeTerminalRun) return;
		if (!canUseHost || terminalCreateError || creatingTerminal) return;

		const latestTerminal = [...terminalSessions]
			.filter((terminal) => !terminal.exited)
			.sort((left, right) => right.createdAt - left.createdAt)[0];

		if (latestTerminal) {
			selectTerminalSession(latestTerminal);
			return;
		}

		void handleCreateTerminalSession();
	}, [
		activeSurfaceKind,
		activeTerminalRun,
		canUseHost,
		creatingTerminal,
		handleCreateTerminalSession,
		selectTerminalSession,
		terminalCreateError,
		terminalSessions,
	]);

	useEffect(() => {
		if (activeSurfaceKind !== "terminal") return;
		if (!canUseHost || loadingTerminals || terminalListError) return;
		if (terminalSessions.length === 0) return;

		const activeTerminalId = activeTerminalRun?.terminalId ?? null;
		const activeTerminalIsLive =
			activeTerminalId !== null &&
			terminalSessions.some(
				(terminal) =>
					terminal.terminalId === activeTerminalId && !terminal.exited,
			);
		if (activeTerminalIsLive) return;

		const latestTerminal = [...terminalSessions]
			.filter((terminal) => !terminal.exited)
			.sort((left, right) => right.createdAt - left.createdAt)[0];

		if (latestTerminal) {
			selectTerminalSession(latestTerminal);
		}
	}, [
		activeSurfaceKind,
		activeTerminalRun?.terminalId,
		canUseHost,
		loadingTerminals,
		selectTerminalSession,
		terminalListError,
		terminalSessions,
	]);

	const handleCreateConversation = async () => {
		if (creatingConversation) return;
		if (!canUseHost) {
			setConversationError(
				hostControlMessage || "Workspace host is unavailable",
			);
			return;
		}
		setCreatingConversation(true);
		setConversationError(null);
		setSelectedAgentId("superset");
		setActiveSurfaceKind("chat");
		closeTerminalActionsSheet();
		const sessionId = randomUUID();
		try {
			await apiClient.chat.createSession.mutate({
				sessionId,
				v2WorkspaceId: workspace.id,
			});
			setLocalSessionIds((current) => new Set(current).add(sessionId));
			setSelectedSessionId(sessionId);
			setMessages([]);
			setSwitcherOpen(false);
		} catch (error) {
			setConversationError(
				error instanceof Error ? error.message : "Failed to create chat",
			);
		} finally {
			setCreatingConversation(false);
		}
	};

	const handleSelectAgent = (agent: WorkspaceAgentOption) => {
		setSelectedAgentId(agent.id);
		setControlSheet(null);
		closeTerminalActionsSheet();
		setRunState({ status: "idle" });
		if (agent.kind === "chat") {
			setActiveSurfaceKind("chat");
			setTerminalCreateError(null);
			shouldFollowChatOutputRef.current = true;
		} else {
			setActiveSurfaceKind("terminal");
			setTerminalCreateError(null);
		}
	};

	const showNativeAgentSelector = () => {
		closeTerminalActionsSheet();
		if (Platform.OS !== "ios") {
			setSwitcherOpen(false);
			setControlSheet("agent");
			return;
		}

		const selectableAgents =
			activeSurfaceKind === "terminal"
				? terminalAgentOptions
				: chatAgentOptions;
		const options = [
			"取消",
			...selectableAgents.map((agent) => agentDisplayLabel(agent)),
		];
		const disabledButtonIndices =
			selectableAgents.length === 0 || loadingAgents
				? options.slice(1).map((_, index) => index + 1)
				: [];

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				disabledButtonIndices,
				message: loadingAgents
					? "正在读取主机上的 Agent 配置。"
					: agentError || `${workspace.name} - ${hostName}`,
				options,
				title: activeSurfaceKind === "terminal" ? "终端 Agent" : "Agent",
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				const agent = selectableAgents[buttonIndex - 1];
				if (agent) handleSelectAgent(agent);
			},
		);
	};

	const showNativeModelSelector = () => {
		closeTerminalActionsSheet();
		if (Platform.OS !== "ios") {
			setSwitcherOpen(false);
			setControlSheet("model");
			return;
		}

		if (selectedAgent.kind !== "chat") {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					cancelButtonIndex: 0,
					message: `模型和启动参数由 ${hostName} 上的主机 Agent 配置控制。`,
					options: ["取消", "主机默认"],
					title: "模型",
					userInterfaceStyle: "dark",
				},
				() => {},
			);
			return;
		}

		const modelOptions = chatModels.map((model) => modelDisplayName(model));
		const options = [
			"取消",
			...(modelOptions.length > 0 ? modelOptions : ["没有可用模型"]),
		];
		const disabledButtonIndices =
			loadingChatModels || chatModelError || modelOptions.length === 0
				? [1]
				: [];

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				disabledButtonIndices,
				message: loadingChatModels
					? "正在读取主机上的对话模型。"
					: chatModelError || "选择当前对话使用的模型。",
				options,
				title: "模型",
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				const model = chatModels[buttonIndex - 1];
				if (model) setSelectedModelId(model.id);
			},
		);
	};

	const showNativePermissionSelector = () => {
		if (!pendingApproval) return;
		if (Platform.OS !== "ios") return;

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				destructiveButtonIndex: 1,
				disabledButtonIndices: pendingActionSending ? [1, 2, 3] : [],
				message:
					pendingApproval.description ??
					pendingApproval.blockedPath ??
					pendingApproval.argsText ??
					"Choose how Claude Code may continue.",
				options: ["取消", "拒绝", "允许一次", "始终允许"],
				title: pendingApproval.title,
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				if (buttonIndex === 1) void handleRespondToApproval("decline");
				if (buttonIndex === 2) void handleRespondToApproval("approve");
				if (buttonIndex === 3) {
					void handleRespondToApproval("always_allow_category");
				}
			},
		);
	};

	const showNativeQuestionSelector = () => {
		if (!pendingQuestion) return;
		if (Platform.OS !== "ios") return;

		if (pendingQuestion.options.length === 0) {
			Alert.prompt(
				pendingQuestion.question,
				pendingQuestion.description ?? "Reply to let Claude Code continue.",
				[
					{ text: "取消", style: "cancel" },
					{
						text: "发送",
						onPress: (answer?: string) => {
							void handleRespondToQuestion(answer ?? "");
						},
					},
				],
				"plain-text",
				questionAnswer,
			);
			return;
		}

		const options = [
			"取消",
			...pendingQuestion.options.map((option) => option.label),
		];
		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				disabledButtonIndices:
					pendingActionSending === "question"
						? options.slice(1).map((_, index) => index + 1)
						: [],
				message:
					pendingQuestion.description ??
					"Choose a response for the active agent question.",
				options,
				title: pendingQuestion.question,
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				const answer = pendingQuestion.options[buttonIndex - 1]?.label;
				if (answer) void handleRespondToQuestion(answer);
			},
		);
	};

	const showNativePlanSelector = () => {
		if (!pendingPlanApproval) return;
		if (Platform.OS !== "ios") return;

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				destructiveButtonIndex: 1,
				disabledButtonIndices: pendingActionSending ? [1, 2] : [],
				message:
					pendingPlanApproval.description ??
					"Approve or reject the current Claude Code plan.",
				options: ["取消", "拒绝", "批准"],
				title: pendingPlanApproval.title,
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				if (buttonIndex === 1) void handleRespondToPlan("rejected");
				if (buttonIndex === 2) void handleRespondToPlan("approved");
			},
		);
	};

	const showNativePendingActionSelector = () => {
		if (pendingApproval) {
			showNativePermissionSelector();
			return;
		}
		if (pendingQuestion) {
			showNativeQuestionSelector();
			return;
		}
		if (pendingPlanApproval) {
			showNativePlanSelector();
		}
	};

	const handlePickAttachments = async () => {
		setAttachmentError(null);
		try {
			const result = await ExpoFile.pickFileAsync({
				multipleFiles: true,
				mimeTypes: "*/*",
			});
			if (result.canceled) return;

			const pickedAttachments: ComposerAttachment[] = [];
			for (const file of result.result) {
				if (file.size > maxAttachmentBytes) {
					setAttachmentError(
						`${file.name} is larger than ${formatBytes(maxAttachmentBytes)}.`,
					);
					continue;
				}
				pickedAttachments.push({
					id: randomUUID(),
					filename: file.name,
					mediaType: file.type || "application/octet-stream",
					data: await file.base64(),
					size: file.size,
				});
			}

			if (pickedAttachments.length > 0) {
				setAttachments((current) => [...current, ...pickedAttachments]);
			}
		} catch (error) {
			setAttachmentError(
				error instanceof Error ? error.message : "Could not attach file.",
			);
		}
	};

	const handleRemoveAttachment = (attachmentId: string) => {
		setAttachmentError(null);
		setAttachments((current) =>
			current.filter((attachment) => attachment.id !== attachmentId),
		);
	};

	const handleSendPrompt = async () => {
		if (!trimmedPrompt || agentIsRunning) return;
		const promptText = trimmedPrompt;
		if (!canUseHost) {
			setRunState({
				status: "error",
				message: hostControlMessage || "Workspace host is unavailable",
			});
			return;
		}
		if (!canSendPrompt) {
			setRunState({
				status: "error",
				message: chatModelControlMessage || "Chat model is unavailable",
			});
			return;
		}

		setRunState({ status: "sending" });
		setConversationError(null);
		setSnapshotError(null);
		setPrompt("");
		setComposerInputEpoch((value) => value + 1);
		shouldFollowChatOutputRef.current = true;

		let submittedPrompt: SubmittedChatPrompt | null = null;
		try {
			if (!selectedChatModel) {
				throw new Error("Chat model is unavailable");
			}
			setActiveSurfaceKind("chat");

			const existingSessionId =
				selectedSessionId && (selectedSession || selectedSessionIsLocal)
					? selectedSessionId
					: null;
			const sessionId = existingSessionId ?? randomUUID();
			const now = new Date();
			submittedPrompt = {
				sessionId,
				content: promptText,
				createdAt: now,
			};
			const optimisticMessage: VisibleChatMessage = {
				id: `mobile-${randomUUID()}`,
				role: "user",
				content: [{ type: "text" as const, text: promptText }],
				stopReason: null,
				errorMessage: null,
				createdAt: now,
			};

			setRunState({ status: "sending", ...submittedPrompt });
			if (!existingSessionId) {
				setLocalSessionIds((current) => new Set(current).add(sessionId));
				setSelectedSessionId(sessionId);
			}
			setMessages((current) =>
				existingSessionId
					? [...current, optimisticMessage]
					: [optimisticMessage],
			);
			if (!existingSessionId) {
				await apiClient.chat.createSession.mutate({
					sessionId,
					v2WorkspaceId: workspace.id,
				});
			}
			await apiClient.v2Workspace.sendChatMessage.mutate({
				workspaceId: workspace.id,
				sessionId,
				content: promptText,
				files:
					attachments.length > 0
						? attachments.map((attachment) => ({
								data: attachment.data,
								mediaType: attachment.mediaType,
								filename: attachment.filename,
							}))
						: undefined,
				metadata: chatModelMetadataForSend(selectedChatModel),
			});
			setAttachments([]);
			setRunState({ status: "sent", ...submittedPrompt });
		} catch (error) {
			setRunState({
				status: "error",
				message: formatWorkspaceRuntimeError(error, "Failed to start chat"),
				...(submittedPrompt ?? {}),
			});
		}
	};

	const handleRespondToApproval = async (
		decision: "approve" | "decline" | "always_allow_category",
	) => {
		if (!selectedSessionId || !pendingApproval) return;
		const action: PendingActionKind =
			decision === "approve"
				? "approval-approve"
				: decision === "decline"
					? "approval-decline"
					: "approval-always";
		setPendingActionSending(action);
		setPendingActionError(null);
		try {
			await apiClient.v2Workspace.respondToChatApproval.mutate({
				workspaceId: workspace.id,
				sessionId: selectedSessionId,
				decision,
			});
		} catch (error) {
			setPendingActionError(
				formatWorkspaceRuntimeError(error, "Failed to respond to approval"),
			);
		} finally {
			setPendingActionSending(null);
		}
	};

	const handleRespondToQuestion = async (answer: string) => {
		if (!selectedSessionId || !pendingQuestion) return;
		const trimmedAnswer = answer.trim();
		if (!trimmedAnswer) return;
		setPendingActionSending("question");
		setPendingActionError(null);
		try {
			await apiClient.v2Workspace.respondToChatQuestion.mutate({
				workspaceId: workspace.id,
				sessionId: selectedSessionId,
				questionId: pendingQuestion.questionId,
				answer: trimmedAnswer,
			});
			setQuestionAnswer("");
		} catch (error) {
			setPendingActionError(
				formatWorkspaceRuntimeError(error, "Failed to answer question"),
			);
		} finally {
			setPendingActionSending(null);
		}
	};

	const handleRespondToPlan = async (action: "approved" | "rejected") => {
		if (!selectedSessionId || !pendingPlanApproval) return;
		const pendingAction: PendingActionKind =
			action === "approved" ? "plan-approved" : "plan-rejected";
		setPendingActionSending(pendingAction);
		setPendingActionError(null);
		try {
			await apiClient.v2Workspace.respondToChatPlan.mutate({
				workspaceId: workspace.id,
				sessionId: selectedSessionId,
				planId: pendingPlanApproval.planId,
				action,
			});
		} catch (error) {
			setPendingActionError(
				formatWorkspaceRuntimeError(error, "Failed to respond to plan"),
			);
		} finally {
			setPendingActionSending(null);
		}
	};

	const handleStopChatSession = async () => {
		if (
			!selectedSessionId ||
			activeSurfaceKind !== "chat" ||
			chatLifecycleAction
		) {
			return;
		}
		setChatLifecycleAction("stop");
		setChatLifecycleError(null);
		try {
			await apiClient.v2Workspace.stopChatSession.mutate({
				workspaceId: workspace.id,
				sessionId: selectedSessionId,
			});
			setRunState({ status: "idle" });
			setChatDisplayState((current) =>
				current
					? {
							...current,
							isRunning: false,
						}
					: current,
			);
		} catch (error) {
			setChatLifecycleError(
				formatWorkspaceRuntimeError(error, "Failed to stop chat"),
			);
		} finally {
			setChatLifecycleAction(null);
		}
	};

	const handleEndChatSession = async () => {
		if (
			!selectedSessionId ||
			activeSurfaceKind !== "chat" ||
			chatLifecycleAction
		) {
			return;
		}
		setChatLifecycleAction("end");
		setChatLifecycleError(null);
		try {
			await apiClient.v2Workspace.endChatSession.mutate({
				workspaceId: workspace.id,
				sessionId: selectedSessionId,
			});
			setRunState({ status: "idle" });
			setChatDisplayState((current) =>
				current
					? {
							...current,
							isRunning: false,
							currentMessage: null,
							pendingApproval: null,
							pendingQuestion: null,
							pendingPlanApproval: null,
						}
					: current,
			);
		} catch (error) {
			setChatLifecycleError(
				formatWorkspaceRuntimeError(error, "Failed to end chat session"),
			);
		} finally {
			setChatLifecycleAction(null);
		}
	};

	const showNativeWindowSwitcher = () => {
		if (Platform.OS !== "ios") {
			closeTerminalActionsSheet();
			setSwitcherOpen(true);
			return;
		}

		openTerminalSwitcherSheet();
	};

	const showNativeChatActions = () => {
		if (Platform.OS !== "ios") {
			setSwitcherOpen(true);
			return;
		}

		const options = [
			"取消",
			"新对话",
			"切换会话",
			"Agent",
			"模型",
			"停止回复",
			"结束会话",
		];
		const disabledButtonIndices = [
			!canUseHost || creatingConversation ? 1 : null,
			worktreeWindowItems.length === 0 ? 2 : null,
			loadingAgents || chatAgentOptions.length === 0 ? 3 : null,
			loadingChatModels || Boolean(chatModelError) ? 4 : null,
			!canStopActiveChat || chatLifecycleAction !== null ? 5 : null,
			!canEndActiveChat || chatLifecycleAction !== null ? 6 : null,
		].filter((index): index is number => index !== null);

		ActionSheetIOS.showActionSheetWithOptions(
			{
				cancelButtonIndex: 0,
				destructiveButtonIndex: 6,
				disabledButtonIndices,
				message: `${workspacePath} - ${hostName}`,
				options,
				title: displayedActiveWindowTitle,
				userInterfaceStyle: "dark",
			},
			(buttonIndex) => {
				if (buttonIndex === 1) {
					void handleCreateConversation();
				}
				if (buttonIndex === 2) {
					showNativeWindowSwitcher();
				}
				if (buttonIndex === 3) {
					showNativeAgentSelector();
				}
				if (buttonIndex === 4) {
					showNativeModelSelector();
				}
				if (buttonIndex === 5) {
					void handleStopChatSession();
				}
				if (buttonIndex === 6) {
					void handleEndChatSession();
				}
			},
		);
	};

	const showNativeTerminalActions = () => {
		Keyboard.dismiss();
		setSwitcherOpen(false);
		setControlSheet(null);
		openTerminalActionsSheet();
	};

	const handleEdgeSwipeStart = (event: GestureResponderEvent) => {
		edgeSwipeStartRef.current = {
			pageX: event.nativeEvent.pageX,
			pageY: event.nativeEvent.pageY,
		};
	};

	const handleEdgeSwipeEnd = (event: GestureResponderEvent) => {
		const edgeSwipeStart = edgeSwipeStartRef.current;
		if (!edgeSwipeStart) return;
		const deltaX = event.nativeEvent.pageX - edgeSwipeStart.pageX;
		const deltaY = Math.abs(event.nativeEvent.pageY - edgeSwipeStart.pageY);
		edgeSwipeStartRef.current = null;
		if (deltaX >= edgeSwipeDistance && deltaY <= edgeSwipeVerticalTolerance) {
			router.back();
		}
	};

	const sendTerminalLiveMessage = (
		terminalId: string,
		message: TerminalSocketClientMessage,
	): boolean => {
		const liveSocket = terminalLiveSocketRef.current;
		if (
			liveSocket?.terminalId !== terminalId ||
			!liveSocket.socket ||
			liveSocket.socket.readyState !== WebSocket.OPEN
		) {
			return false;
		}
		liveSocket.socket.send(JSON.stringify(message));
		return true;
	};

	const requestTerminalRedraw = useCallback(
		(terminalId: string): Promise<void> => {
			if (redrawnTerminalIdsRef.current.has(terminalId)) {
				return Promise.resolve();
			}
			redrawnTerminalIdsRef.current.add(terminalId);
			return apiClient.v2Workspace.writeTerminalInput
				.mutate({
					workspaceId: workspace.id,
					terminalId,
					data: "\u000c",
				})
				.then(() => {
					// Redraw is best effort; callers only need completion, not the write result.
					setTerminalSnapshotRefreshEpoch((value) => value + 1);
				});
		},
		[workspace.id],
	);

	const handleSendTerminalData = (data: string) => {
		if (
			data.length === 0 ||
			!canUseHost ||
			!activeTerminalRun ||
			activeTerminalRun.exited
		) {
			return;
		}

		const terminalId = activeTerminalRun.terminalId;
		const workspaceId = workspace.id;

		const writeInput = async () => {
			await apiClient.v2Workspace.writeTerminalInput.mutate({
				workspaceId,
				terminalId,
				data,
			});
			shouldFollowChatOutputRef.current = true;
			setTerminalSnapshotRefreshEpoch((value) => value + 1);
		};
		const queuedWrite = terminalInputQueueRef.current
			.catch(() => undefined)
			.then(writeInput);

		terminalInputQueueRef.current = queuedWrite.then(
			() => undefined,
			() => undefined,
		);

		void queuedWrite.catch((error) => {
			setRunState({
				status: "error",
				message: formatWorkspaceRuntimeError(
					error,
					"Failed to write terminal input",
				),
			});
		});
	};

	const toggleTerminalModifier = (modifier: TerminalModifier) => {
		setTerminalModifiers((current) => ({
			...current,
			[modifier]: !current[modifier],
		}));
	};

	const handleSendTerminalKey = (data: string) => {
		const command = terminalDataWithModifiers(data, terminalModifiers);
		void handleSendTerminalData(command);
		if (data === "\r") {
			terminalInputCommandIdRef.current += 1;
			setTerminalInputCommand({
				id: terminalInputCommandIdRef.current,
				data: command,
			});
		}
		setTerminalModifiers(emptyTerminalModifiers);
	};

	const handleFillTerminalPreset = (preset: WorkspaceTerminalPresetOption) => {
		const command = terminalPresetOptionCommand(preset);
		if (!command) return;
		handleSendTerminalData(command);
		setTerminalKeyboardAccessoryVisible(true);
		closeTerminalActionsSheet();
	};

	const handleTerminalWebViewInteraction = () => {
		setTerminalKeyboardAccessoryVisible(true);
	};

	const handleDismissTerminalKeyboard = () => {
		setTerminalKeyboardAccessoryVisible(false);
		setTerminalKeyboardBottomInset(0);
		setTerminalKeyboardDismissToken((value) => value + 1);
		Keyboard.dismiss();
	};

	const handleTerminalResize = (size: { rows: number; cols: number }) => {
		terminalSizeRef.current = size;
		if (!canUseHost || !activeTerminalRun || activeTerminalRun.exited) return;

		const resizeKey = `${activeTerminalRun.terminalId}:${size.cols}:${size.rows}`;
		const shouldResize = lastTerminalResizeKeyRef.current !== resizeKey;
		const shouldRequestRedraw =
			activeTerminalRun.hasLoadedSnapshot &&
			activeTerminalRun.suppressReplayUntilDelta &&
			!redrawnTerminalIdsRef.current.has(activeTerminalRun.terminalId);
		if (!shouldResize && !shouldRequestRedraw) return;
		if (shouldResize) {
			lastTerminalResizeKeyRef.current = resizeKey;
		}

		const requestRedraw = () => {
			if (!shouldRequestRedraw) return;
			return requestTerminalRedraw(activeTerminalRun.terminalId);
		};

		const resizedViaLiveSocket =
			shouldResize &&
			sendTerminalLiveMessage(activeTerminalRun.terminalId, {
				type: "resize",
				cols: size.cols,
				rows: size.rows,
			});
		const resizePromise =
			shouldResize && !resizedViaLiveSocket
				? apiClient.v2Workspace.resizeTerminal
						.mutate({
							workspaceId: workspace.id,
							terminalId: activeTerminalRun.terminalId,
							cols: size.cols,
							rows: size.rows,
						})
						.catch(() => {
							// Older host-service builds do not expose terminal.resize yet. The
							// terminal remains interactive; the redraw request below still helps
							// TUIs repaint into the mobile xterm.
						})
				: Promise.resolve();

		resizePromise.then(requestRedraw).catch(() => {
			// Best-effort redraw. Input failures are surfaced by explicit user input.
		});
	};

	useEffect(() => {
		if (!canUseHost || !activeTerminalRun || activeTerminalRun.exited) return;
		if (
			!activeTerminalRun.hasLoadedSnapshot ||
			!activeTerminalRun.suppressReplayUntilDelta
		) {
			return;
		}
		void requestTerminalRedraw(activeTerminalRun.terminalId).catch(() => {
			// Best-effort redraw. Input failures are surfaced by explicit user input.
		});
	}, [
		activeTerminalRun?.exited,
		activeTerminalRun?.hasLoadedSnapshot,
		activeTerminalRun?.suppressReplayUntilDelta,
		activeTerminalRun?.terminalId,
		canUseHost,
		requestTerminalRedraw,
		activeTerminalRun,
	]);

	const renderMessage = (message: VisibleChatMessage, index: number) => {
		const isUser = isUserOriginatedMessage(message);
		const content = textFromMessage(message);
		if (!isUser) {
			const displayContent = assistantContentPartsForDisplay(message.content, {
				allowPendingToolCalls: agentIsRunning && index === messages.length - 1,
			});
			return (
				<View
					key={message.id ?? `${message.role}-${index}`}
					className="gap-2 py-1"
				>
					{displayContent.map(renderStructuredAssistantPart)}
					{message.errorMessage ? (
						<View className="rounded-md bg-red-500/10 px-3 py-2">
							<Text className="text-[13px] font-medium text-red-400">
								消息错误
							</Text>
							<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
								{message.errorMessage}
							</Text>
						</View>
					) : null}
					{displayContent.length === 0 ? (
						<Text className="text-[16px] leading-6 text-[#d9d9df]">
							{content}
						</Text>
					) : null}
				</View>
			);
		}
		const attachmentLabels = userAttachmentLabelsFromMessage(message);
		const displayContent = userDisplayTextFromMessage(message);
		return (
			<View
				key={message.id ?? `${message.role}-${index}`}
				className="items-end py-1"
			>
				<View className="max-w-[88%] rounded-[18px] bg-[#f2f2f4] px-3 py-2">
					{displayContent ? (
						<Text className="text-[15px] leading-5 text-[#111116]">
							{displayContent}
						</Text>
					) : null}
					{attachmentLabels.length > 0 ? (
						<View className={cn(displayContent ? "mt-2" : "", "gap-1.5")}>
							{attachmentLabels.map((label) => (
								<View
									key={label}
									className="flex-row items-center gap-1.5 rounded-full bg-[#e3e3e8] px-2.5 py-1"
								>
									<Icon as={FileText} className="size-3.5 text-[#4f4f59]" />
									<Text
										className="max-w-52 text-[12px] text-[#2a2a31]"
										numberOfLines={1}
									>
										{label}
									</Text>
								</View>
							))}
						</View>
					) : null}
				</View>
			</View>
		);
	};

	const renderPendingActionError = () =>
		pendingActionError ? (
			<View className="mt-2 rounded-md bg-red-500/10 px-3 py-2">
				<Text className="text-[13px] text-red-400">{pendingActionError}</Text>
			</View>
		) : null;

	const renderPendingApprovalCard = () => {
		if (!pendingApproval) return null;
		const isSending = pendingActionSending?.startsWith("approval") ?? false;
		if (Platform.OS === "ios") {
			return null;
		}

		return (
			<View className="mt-3 rounded-md bg-amber-500/10 px-3 py-3">
				<Text className="text-[13px] font-medium uppercase text-amber-300">
					Permission request
				</Text>
				<Text className="mt-1 text-[15px] font-medium text-[#d9d9df]">
					{pendingApproval.title}
				</Text>
				{pendingApproval.description ? (
					<Text className="mt-1 text-[13px] leading-5 text-[#9b9ba5]">
						{pendingApproval.description}
					</Text>
				) : null}
				{pendingApproval.blockedPath ? (
					<Text className="mt-1 font-mono text-[12px] text-[#9b9ba5]">
						{pendingApproval.blockedPath}
					</Text>
				) : null}
				{pendingApproval.argsText ? (
					<View className="mt-2 rounded-md bg-[#111116] px-2.5 py-2">
						<Text className="text-[11px] font-medium uppercase text-[#7f7f89]">
							Arguments
						</Text>
						<Text className="mt-1 font-mono text-[12px] leading-4 text-[#a8a8b3]">
							{pendingApproval.argsText}
						</Text>
					</View>
				) : null}
				<View className="mt-3 flex-row flex-wrap gap-2">
					<Button
						size="sm"
						variant="secondary"
						disabled={isSending}
						onPress={() => handleRespondToApproval("decline")}
						className="rounded-md"
					>
						{pendingActionSending === "approval-decline" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text>拒绝</Text>
						)}
					</Button>
					<Button
						size="sm"
						disabled={isSending}
						onPress={() => handleRespondToApproval("approve")}
						className="rounded-md"
					>
						{pendingActionSending === "approval-approve" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text>允许一次</Text>
						)}
					</Button>
					<Button
						size="sm"
						variant="secondary"
						disabled={isSending}
						onPress={() => handleRespondToApproval("always_allow_category")}
						className="rounded-md"
					>
						{pendingActionSending === "approval-always" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text>始终允许</Text>
						)}
					</Button>
				</View>
			</View>
		);
	};

	const renderPendingQuestionCard = () => {
		if (!pendingQuestion) return null;
		const isSending = pendingActionSending === "question";
		if (Platform.OS === "ios") {
			return null;
		}
		return (
			<View className="mt-3 rounded-md border border-[#2d2d36] px-3 py-3">
				<Text className="text-[13px] font-medium uppercase text-[#8b8b96]">
					Question
				</Text>
				<Text className="mt-1 text-[15px] font-medium text-[#d9d9df]">
					{pendingQuestion.question}
				</Text>
				{pendingQuestion.description ? (
					<Text className="mt-1 text-[13px] leading-5 text-[#8b8b96]">
						{pendingQuestion.description}
					</Text>
				) : null}
				{pendingQuestion.options.length > 0 ? (
					<View className="mt-3 flex-row flex-wrap gap-2">
						{pendingQuestion.options.map((option) => (
							<Button
								key={option.label}
								size="sm"
								variant="secondary"
								disabled={isSending}
								onPress={() => handleRespondToQuestion(option.label)}
								className="rounded-md"
							>
								{isSending ? (
									<ActivityIndicator size="small" />
								) : (
									<Text>{option.label}</Text>
								)}
							</Button>
						))}
					</View>
				) : (
					<View className="mt-3 gap-2">
						<TextInput
							value={questionAnswer}
							onChangeText={setQuestionAnswer}
							editable={!isSending}
							multiline
							numberOfLines={2}
							placeholder="Answer"
							placeholderTextColor="#7f7f89"
							textAlignVertical="top"
							className="min-h-16 rounded-md border-[#2d2d36] bg-[#1a1a20] text-[14px] text-[#d9d9df]"
						/>
						<Button
							size="sm"
							disabled={isSending || !questionAnswer.trim()}
							onPress={() => handleRespondToQuestion(questionAnswer)}
							className="self-start rounded-md"
						>
							{isSending ? (
								<ActivityIndicator size="small" />
							) : (
								<Text>Send</Text>
							)}
						</Button>
					</View>
				)}
			</View>
		);
	};

	const renderPendingPlanCard = () => {
		if (!pendingPlanApproval) return null;
		const isSending = pendingActionSending?.startsWith("plan") ?? false;
		if (Platform.OS === "ios") {
			return null;
		}
		return (
			<View className="mt-3 rounded-md border border-[#2d2d36] px-3 py-3">
				<Text className="text-[13px] font-medium uppercase text-[#8b8b96]">
					Plan
				</Text>
				<Text className="mt-1 text-[15px] font-medium text-[#d9d9df]">
					{pendingPlanApproval.title}
				</Text>
				{pendingPlanApproval.description ? (
					<Text className="mt-1 text-[13px] leading-5 text-[#8b8b96]">
						{pendingPlanApproval.description}
					</Text>
				) : null}
				<View className="mt-3 flex-row flex-wrap gap-2">
					<Button
						size="sm"
						variant="secondary"
						disabled={isSending}
						onPress={() => handleRespondToPlan("rejected")}
						className="rounded-md"
					>
						{pendingActionSending === "plan-rejected" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text>拒绝</Text>
						)}
					</Button>
					<Button
						size="sm"
						disabled={isSending}
						onPress={() => handleRespondToPlan("approved")}
						className="rounded-md"
					>
						{pendingActionSending === "plan-approved" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text>批准</Text>
						)}
					</Button>
				</View>
			</View>
		);
	};

	const renderPendingChatActions = () => {
		if (!pendingApproval && !pendingQuestion && !pendingPlanApproval) {
			return null;
		}
		return (
			<View>
				{renderPendingApprovalCard()}
				{renderPendingQuestionCard()}
				{renderPendingPlanCard()}
				{renderPendingActionError()}
			</View>
		);
	};

	const renderHostControlNotice = () => {
		if (canUseHost) return null;
		if (messages.length === 0) return null;
		return (
			<View className="mb-3 flex-row items-start gap-2 rounded-md bg-[#1d1a13] px-3 py-2.5">
				<Icon as={LockKeyhole} className="mt-0.5 size-4 text-amber-400" />
				<View className="min-w-0 flex-1">
					<Text className="text-[13px] font-medium text-amber-300">
						{hostControlLabel}
					</Text>
					<Text className="mt-0.5 text-[13px] leading-5 text-[#9b9ba5]">
						{hostControlMessage}
					</Text>
				</View>
			</View>
		);
	};

	const renderChatModelNotice = () => {
		if (!canUseHost || activeSurfaceKind !== "chat" || selectedChatModel) {
			return null;
		}
		return (
			<View className="mb-3 flex-row items-start gap-2 rounded-md bg-[#1a1a20] px-3 py-2.5">
				<Icon as={Sparkles} className="mt-0.5 size-4 text-[#a8a8b3]" />
				<View className="min-w-0 flex-1">
					<Text className="text-[13px] font-medium text-[#d9d9df]">
						{chatModelControlLabel}
					</Text>
					<Text className="mt-0.5 text-[13px] leading-5 text-[#8b8b96]">
						{chatModelControlMessage}
					</Text>
				</View>
			</View>
		);
	};

	const renderAgentNotice = () => {
		if (!canUseHost || (!loadingAgents && !agentError)) return null;
		return (
			<View className="mb-3 flex-row items-start gap-2 rounded-md bg-[#1a1a20] px-3 py-2.5">
				<Icon as={Bot} className="mt-0.5 size-4 text-[#a8a8b3]" />
				<View className="min-w-0 flex-1">
					<Text className="text-[13px] font-medium text-[#d9d9df]">
						{loadingAgents ? "Loading agents" : "Agent list unavailable"}
					</Text>
					<Text className="mt-0.5 text-[13px] leading-5 text-[#8b8b96]">
						{loadingAgents ? "Reading host agent configurations." : agentError}
					</Text>
				</View>
			</View>
		);
	};

	const renderEmptyConversation = () => (
		<View className="gap-3 py-2">
			<View className="flex-row items-center gap-2.5">
				<View className="size-8 items-center justify-center rounded-full bg-[#1a1a20]">
					<Icon
						as={canUseHost ? Sparkles : LockKeyhole}
						className={cn(
							"size-4",
							canUseHost ? "text-[#d9d9df]" : "text-amber-300",
						)}
					/>
				</View>
				<View className="min-w-0 flex-1">
					<Text className="text-[15px] font-medium text-[#d9d9df]">
						{canUseHost ? `向 ${selectedAgentLabel} 提问` : hostControlLabel}
					</Text>
					<Text className="text-[13px] text-[#8b8b96]" numberOfLines={1}>
						{workspacePath} · {hostName} · {hostReachability}
					</Text>
				</View>
			</View>
			{canUseHost ? null : (
				<Text className="text-[13px] leading-5 text-[#8b8b96]">
					{hostControlMessage}
				</Text>
			)}
		</View>
	);

	const renderChatSurface = () => (
		<>
			<ScrollView
				ref={chatScrollViewRef}
				className="flex-1"
				keyboardShouldPersistTaps="handled"
				onContentSizeChange={() => {
					if (agentIsRunning || shouldFollowChatOutputRef.current) {
						chatScrollViewRef.current?.scrollToEnd({ animated: true });
						if (!agentIsRunning) shouldFollowChatOutputRef.current = false;
					}
				}}
				contentContainerStyle={{
					paddingHorizontal: 24,
					paddingTop: 14,
					paddingBottom: 18,
				}}
			>
				{renderHostControlNotice()}
				{renderAgentNotice()}
				{renderChatModelNotice()}
				{messages.length > 0 ? (
					<View className="gap-3">{messages.map(renderMessage)}</View>
				) : loadingMessages ? (
					<View className="items-center py-8">
						<ActivityIndicator />
					</View>
				) : (
					renderEmptyConversation()
				)}

				{chatDisplayState?.isRunning && !chatDisplayState.currentMessage ? (
					<View className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-emerald-300">
							Agent 正在工作
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							正在等待 Worktree 输出。
						</Text>
					</View>
				) : null}
				{renderPendingChatActions()}
				{visibleChatRuntimeError ? (
					<View className="mt-3 rounded-md bg-red-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-red-400">
							Agent 已停止
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							{visibleChatRuntimeError}
						</Text>
					</View>
				) : null}
				{runState.status === "error" ? (
					<View className="mt-3 rounded-md bg-red-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-red-400">
							发送失败
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							{runState.message}
						</Text>
					</View>
				) : null}
				{conversationError ? (
					<View className="mt-3 rounded-md bg-red-500/10 px-3 py-2">
						<Text className="text-[13px] text-red-400">
							{conversationError}
						</Text>
					</View>
				) : null}
				{visibleSnapshotError ? (
					<View className="mt-3 rounded-md bg-red-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-red-400">
							对话同步失败
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							{visibleSnapshotError}
						</Text>
					</View>
				) : null}
				{chatLifecycleError ? (
					<View className="mt-3 rounded-md bg-red-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-red-400">
							对话控制失败
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							{chatLifecycleError}
						</Text>
					</View>
				) : null}
			</ScrollView>
			{renderComposer()}
		</>
	);

	const renderTerminalKey = (
		button: (typeof terminalKeyButtons)[number],
		className = "flex-1",
	) => (
		<Pressable
			key={button.id}
			onPress={() => handleSendTerminalKey(button.data)}
			disabled={!canWriteTerminalInput}
			accessibilityRole="button"
			accessibilityLabel={`Send ${button.label} to terminal`}
			className={cn(
				"h-8 min-w-0 items-center justify-center rounded-md border border-[#24242b] bg-[#121217] px-1.5 active:bg-[#202028]",
				!canWriteTerminalInput && "opacity-45",
				className,
			)}
		>
			<Text className="font-mono text-[12px] font-medium text-[#cfcfd7]">
				{button.label}
			</Text>
		</Pressable>
	);

	const renderTerminalModifier = (modifier: TerminalModifier) => {
		const active = terminalModifiers[modifier];
		return (
			<Pressable
				key={modifier}
				onPress={() => toggleTerminalModifier(modifier)}
				disabled={!canWriteTerminalInput}
				accessibilityRole="button"
				accessibilityState={{ selected: active }}
				accessibilityLabel={`Toggle terminal ${terminalModifierLabels[modifier]}`}
				className={cn(
					"h-8 min-w-12 items-center justify-center rounded-md border px-1.5 active:bg-[#202028]",
					active
						? "border-[#d9d9df] bg-[#24242b]"
						: "border-[#24242b] bg-[#121217]",
					!canWriteTerminalInput && "opacity-45",
				)}
			>
				<Text
					className={cn(
						"font-mono text-[12px] font-medium",
						active ? "text-[#f2f2f4]" : "text-[#a8a8b3]",
					)}
				>
					{terminalModifierLabels[modifier]}
				</Text>
			</Pressable>
		);
	};

	const renderTerminalVirtualKeyboard = () => {
		if (!activeTerminalRun || activeTerminalRun.exited) {
			return null;
		}
		return (
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				keyboardShouldPersistTaps="always"
			>
				<View className="flex-row gap-1.5 pr-1">
					<Pressable
						onPress={handleDismissTerminalKeyboard}
						accessibilityRole="button"
						accessibilityLabel="Hide terminal keyboard"
						className="h-8 w-10 items-center justify-center rounded-md border border-[#24242b] bg-[#121217] active:bg-[#202028]"
					>
						<Icon as={ChevronDown} className="size-4 text-[#a8a8b3]" />
					</Pressable>
					{renderTerminalModifier("ctrl")}
					{terminalKeyButtons.map((button) =>
						renderTerminalKey(button, "min-w-12"),
					)}
					{renderTerminalModifier("alt")}
					{renderTerminalModifier("shift")}
				</View>
			</ScrollView>
		);
	};

	const renderTerminalControls = () => {
		const virtualKeyboard = renderTerminalVirtualKeyboard();
		if (!virtualKeyboard || !terminalKeyboardAccessoryVisible) return null;
		const controlsPaddingBottom =
			terminalKeyboardBottomInset > 0 ? 8 : Math.max(insets.bottom, 8);
		return (
			<View
				style={{
					flexShrink: 0,
					marginBottom: terminalKeyboardBottomInset,
					zIndex: 60,
					elevation: 60,
				}}
				testID="workspace-terminal-keyboard-accessory"
			>
				<View
					className="bg-transparent px-4 pt-2"
					style={{ paddingBottom: controlsPaddingBottom }}
				>
					<AdaptiveGlassSurface style={shellStyles.terminalAccessorySurface}>
						{virtualKeyboard}
					</AdaptiveGlassSurface>
				</View>
			</View>
		);
	};

	const renderTerminalUnavailableState = () => {
		const isHostBlocked = !canUseHost;
		const hasCreateError = Boolean(terminalCreateError);
		const TerminalStateIcon = isHostBlocked
			? LockKeyhole
			: hasCreateError
				? ShieldAlert
				: Terminal;
		const title = creatingTerminal
			? "正在连接终端"
			: isHostBlocked
				? hostControlLabel
				: hasCreateError
					? "终端无法连接"
					: "等待终端会话";
		const description = creatingTerminal
			? `${workspaceDisplayTitle} · ${hostName}`
			: isHostBlocked
				? hostControlMessage
				: hasCreateError
					? terminalCreateError
					: "Superset 正在等待主机创建或同步这个 Worktree 的终端会话。";

		return (
			<View className="min-h-0 flex-1 items-center justify-center px-8">
				<View className="items-center gap-3">
					<View className="size-11 items-center justify-center rounded-full bg-white/10">
						{creatingTerminal ? (
							<ActivityIndicator />
						) : (
							<Icon
								as={TerminalStateIcon}
								className={cn(
									"size-5",
									isHostBlocked
										? "text-amber-300"
										: hasCreateError
											? "text-red-300"
											: "text-[#d9d9df]",
								)}
							/>
						)}
					</View>
					<View className="items-center gap-1">
						<Text className="text-center text-[16px] font-medium text-[#d9d9df]">
							{title}
						</Text>
						<Text className="text-center text-[13px] leading-5 text-[#8b8b96]">
							{description}
						</Text>
					</View>
					{hasCreateError && canUseHost ? (
						<Pressable
							onPress={() => {
								void handleCreateTerminalSession();
							}}
							accessibilityRole="button"
							accessibilityLabel="Retry terminal connection"
							className="mt-1 flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 active:bg-white/15"
						>
							<Icon as={Terminal} className="size-3.5 text-[#d9d9df]" />
							<Text className="text-[13px] font-medium text-[#d9d9df]">
								重试连接
							</Text>
						</Pressable>
					) : null}
				</View>
			</View>
		);
	};

	const renderTerminalSurface = () => (
		<View className="flex-1 bg-[#050507]">
			{activeTerminalRun ? (
				<View className="min-h-0 flex-1">
					<TerminalEmulator
						streamKey={`${workspace.id}:${activeTerminalRun.terminalId}`}
						output={activeTerminalRun.outputTail}
						restoreRevision={activeTerminalRun.restoreRevision}
						inputCommand={terminalInputCommand}
						pendingModifiers={terminalModifiers}
						keyboardDismissSignal={terminalKeyboardDismissToken}
						onInput={(data) => {
							void handleSendTerminalData(data);
						}}
						onInteraction={handleTerminalWebViewInteraction}
						onPendingModifiersConsumed={() => {
							setTerminalModifiers(emptyTerminalModifiers);
						}}
						onResize={handleTerminalResize}
					/>
					{shouldShowTerminalWaitingIndicator ? (
						<View
							pointerEvents="none"
							className="absolute left-3 top-3 rounded-md bg-black/45 px-2.5 py-1.5"
						>
							<Text className="font-mono text-[12px] text-[#8b8b96]">
								等待终端输出...
							</Text>
						</View>
					) : null}
					{activeTerminalLiveStatus?.state === "connecting" ||
					activeTerminalLiveStatus?.state === "reconnecting" ? (
						<View
							pointerEvents="none"
							className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5"
						>
							<ActivityIndicator color="#8b8b96" size="small" />
							<Text className="font-mono text-[12px] text-[#8b8b96]">
								{activeTerminalLiveStatus.state === "reconnecting"
									? "重连终端流"
									: "连接终端流"}
							</Text>
						</View>
					) : null}
					{!canUseHost ? (
						<View className="absolute left-3 right-3 top-3 rounded-md bg-[#1d1a13]/95 px-3 py-2">
							<Text className="font-mono text-[12px] font-medium text-amber-300">
								{hostControlLabel}
							</Text>
							<Text className="mt-0.5 font-mono text-[12px] leading-4 text-[#c8a96d]">
								{hostControlMessage}
							</Text>
						</View>
					) : null}
					{activeTerminalRun.errorMessage ? (
						<View className="absolute bottom-3 left-3 right-3 rounded-md bg-red-500/10 px-3 py-2">
							<Text className="font-mono text-[12px] font-medium text-red-300">
								终端输出不可用
							</Text>
							<Text className="mt-0.5 font-mono text-[12px] leading-4 text-red-200/80">
								{activeTerminalRun.errorMessage}
							</Text>
						</View>
					) : null}
					{runState.status === "error" && activeSurfaceKind === "terminal" ? (
						<View className="absolute bottom-3 left-3 right-3 rounded-md bg-red-500/10 px-3 py-2">
							<Text className="font-mono text-[12px] font-medium text-red-300">
								error
							</Text>
							<Text className="mt-0.5 font-mono text-[12px] leading-4 text-red-200/80">
								{runState.message}
							</Text>
						</View>
					) : null}
				</View>
			) : (
				renderTerminalUnavailableState()
			)}
			{renderTerminalControls()}
		</View>
	);

	const renderComposer = () => {
		const PendingActionIcon = pendingApproval
			? ShieldAlert
			: pendingQuestion
				? MessageSquare
				: pendingPlanApproval
					? Check
					: null;
		const pendingActionLabel = pendingApproval
			? "Review permission request"
			: pendingQuestion
				? "Answer agent question"
				: pendingPlanApproval
					? "Review plan"
					: null;
		const pendingActionIsSending = pendingActionSending !== null;

		return (
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				keyboardVerticalOffset={0}
			>
				<View
					className="bg-transparent px-4 pt-2"
					style={{ paddingBottom: Math.max(insets.bottom, 14) }}
				>
					<AdaptiveGlassSurface style={shellStyles.composerSurface}>
						{attachments.length > 0 ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								className="mb-2"
								keyboardShouldPersistTaps="handled"
							>
								<View className="flex-row gap-2">
									{attachments.map((attachment) => (
										<View
											key={attachment.id}
											className="flex-row items-center gap-1.5 rounded-full bg-[#24242b] px-2.5 py-1.5"
										>
											<Icon as={FileText} className="size-3.5 text-[#a8a8b3]" />
											<Text
												className="max-w-44 text-[12px] text-[#d9d9df]"
												numberOfLines={1}
											>
												{attachment.filename}
											</Text>
											{attachment.size > 0 ? (
												<Text className="text-[11px] text-[#7f7f89]">
													{formatBytes(attachment.size)}
												</Text>
											) : null}
											<Pressable
												onPress={() => handleRemoveAttachment(attachment.id)}
												accessibilityRole="button"
												accessibilityLabel={`Remove ${attachment.filename}`}
												className="size-5 items-center justify-center rounded-full active:bg-[#303039]"
											>
												<Icon as={X} className="size-3 text-[#a8a8b3]" />
											</Pressable>
										</View>
									))}
								</View>
							</ScrollView>
						) : null}
						{attachmentError ? (
							<Text className="mb-2 text-[12px] text-amber-300">
								{attachmentError}
							</Text>
						) : null}
						<View className="min-h-12 flex-row items-end gap-2">
							<Pressable
								onPress={handlePickAttachments}
								disabled={!canUseHost || agentIsRunning}
								accessibilityRole="button"
								accessibilityLabel="Attach files"
								className={cn(
									"size-10 items-center justify-center rounded-full active:bg-[#24242b]",
									(!canUseHost || agentIsRunning) && "opacity-45",
								)}
							>
								<Icon as={Plus} className="size-6 text-[#d9d9df]" />
							</Pressable>
							{PendingActionIcon &&
							pendingActionLabel &&
							Platform.OS === "ios" ? (
								<Pressable
									onPress={showNativePendingActionSelector}
									disabled={pendingActionIsSending}
									accessibilityRole="button"
									accessibilityLabel={pendingActionLabel}
									className={cn(
										"size-10 items-center justify-center rounded-full bg-amber-500/12 active:bg-amber-500/20",
										pendingActionIsSending && "opacity-60",
									)}
								>
									{pendingActionIsSending ? (
										<ActivityIndicator size="small" />
									) : (
										<Icon
											as={PendingActionIcon}
											className="size-6 text-amber-300"
										/>
									)}
								</Pressable>
							) : null}
							<TextInput
								key={`composer-input-${composerInputEpoch}`}
								value={prompt}
								onChangeText={setPrompt}
								editable={canSendPrompt && !agentIsRunning}
								multiline
								numberOfLines={3}
								autoCapitalize="none"
								autoComplete="off"
								autoCorrect={false}
								placeholder={composerPlaceholder}
								placeholderTextColor="#7f7f89"
								spellCheck={false}
								textAlignVertical="top"
								className="min-h-10 flex-1 border-0 bg-transparent px-0 py-2 text-[17px] text-[#d9d9df] shadow-none"
								style={{ maxHeight: 96 }}
							/>
							<Button
								onPress={handleSendPrompt}
								disabled={!canSendPrompt || !trimmedPrompt || agentIsRunning}
								size="icon"
								className={cn(
									"size-10 rounded-full",
									trimmedPrompt && canSendPrompt && !agentIsRunning
										? "bg-[#f2f2f4]"
										: "bg-[#3a3a42]",
								)}
							>
								{runState.status === "sending" ? (
									<ActivityIndicator size="small" />
								) : (
									<Icon
										as={Send}
										className={cn(
											"size-4",
											trimmedPrompt && canSendPrompt && !agentIsRunning
												? "text-[#111116]"
												: "text-[#8b8b96]",
										)}
									/>
								)}
							</Button>
						</View>
					</AdaptiveGlassSurface>
				</View>
			</KeyboardAvoidingView>
		);
	};

	const renderAgentSheet = () => (
		<AdaptiveGlassSurface
			style={[
				shellStyles.sheetSurface,
				{
					maxHeight: Math.min(height * 0.72, 520),
					paddingBottom: Math.max(insets.bottom, 14),
				},
			]}
		>
			<View className="mb-4 h-1 w-16 self-center rounded-full bg-white/30" />
			<View className="mb-2 flex-row items-center justify-between">
				<View className="min-w-0 flex-1">
					<Text className="text-[17px] font-medium text-[#d9d9df]">
						{activeSurfaceKind === "terminal" ? "终端 Agent" : "Agent"}
					</Text>
					<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
						{activeSurfaceKind === "terminal"
							? "选择这个终端窗口使用的主机 Agent"
							: "选择当前对话使用的 Agent"}
					</Text>
				</View>
				<Pressable
					onPress={() => setControlSheet(null)}
					accessibilityRole="button"
					accessibilityLabel="Close agent selector"
					className="size-9 items-center justify-center rounded-full bg-[#1a1a20]"
				>
					<Icon as={X} className="size-4 text-[#d9d9df]" />
				</Pressable>
			</View>

			<ScrollView className="min-h-0" keyboardShouldPersistTaps="handled">
				{(activeSurfaceKind === "terminal"
					? terminalAgentOptions
					: chatAgentOptions
				).map((agent) => {
					const selected = agent.id === selectedAgent.id;
					return (
						<Pressable
							key={agent.id}
							onPress={() => handleSelectAgent(agent)}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							className={cn(
								"mb-1 flex-row items-center gap-3 rounded-md px-2.5 py-2.5",
								selected ? "bg-[#1d1d24]" : "active:bg-[#1d1d24]",
							)}
						>
							<View className="size-8 items-center justify-center rounded-md bg-[#24242b]">
								<Icon
									as={agent.kind === "terminal" ? Terminal : Bot}
									className="size-4 text-[#d9d9df]"
								/>
							</View>
							<View className="min-w-0 flex-1">
								<Text
									className="text-[15px] font-medium text-[#d9d9df]"
									numberOfLines={1}
								>
									{agentDisplayLabel(agent)}
								</Text>
								<Text
									className="mt-0.5 text-[13px] text-[#8b8b96]"
									numberOfLines={2}
								>
									{agentSubtitle(agent)}
								</Text>
							</View>
							{selected ? (
								<Icon as={Check} className="size-4 text-emerald-400" />
							) : null}
						</Pressable>
					);
				})}
				{loadingAgents ? (
					<View className="mt-2 flex-row items-center gap-2 px-2.5 py-2">
						<ActivityIndicator size="small" />
						<Text className="text-[13px] text-[#8b8b96]">
							正在读取主机 Agent
						</Text>
					</View>
				) : null}
				{agentError ? (
					<View className="mt-2 rounded-md bg-amber-500/10 px-3 py-2">
						<Text className="text-[13px] font-medium text-amber-300">
							使用内置选项
						</Text>
						<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
							{agentError}
						</Text>
					</View>
				) : null}
			</ScrollView>
		</AdaptiveGlassSurface>
	);

	const renderModelSheet = () => (
		<AdaptiveGlassSurface
			style={[
				shellStyles.sheetSurface,
				{
					maxHeight: Math.min(height * 0.72, 520),
					paddingBottom: Math.max(insets.bottom, 14),
				},
			]}
		>
			<View className="mb-4 h-1 w-16 self-center rounded-full bg-white/30" />
			<View className="mb-2 flex-row items-center justify-between">
				<View className="min-w-0 flex-1">
					<Text className="text-[17px] font-medium text-[#d9d9df]">模型</Text>
					<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
						{selectedAgent.kind === "chat"
							? "当前对话模型"
							: `${selectedAgentLabel} 使用主机 Agent 配置`}
					</Text>
				</View>
				<Pressable
					onPress={() => setControlSheet(null)}
					accessibilityRole="button"
					accessibilityLabel="Close model selector"
					className="size-9 items-center justify-center rounded-full bg-[#1a1a20]"
				>
					<Icon as={X} className="size-4 text-[#d9d9df]" />
				</Pressable>
			</View>

			{selectedAgent.kind !== "chat" ? (
				<View className="rounded-md bg-[#1a1a20] px-3 py-3">
					<View className="flex-row items-center gap-2">
						<Icon as={Terminal} className="size-4 text-[#d9d9df]" />
						<Text className="text-[15px] font-medium text-[#d9d9df]">
							主机默认
						</Text>
					</View>
					<Text className="mt-2 text-[13px] leading-5 text-[#8b8b96]">
						这个终端 Agent 的模型与启动参数由 {hostName} 上的主机配置控制。
					</Text>
				</View>
			) : (
				<ScrollView className="min-h-0" keyboardShouldPersistTaps="handled">
					{loadingChatModels ? (
						<View className="flex-row items-center gap-2 px-2.5 py-3">
							<ActivityIndicator size="small" />
							<Text className="text-[13px] text-[#8b8b96]">
								正在读取对话模型
							</Text>
						</View>
					) : null}
					{chatModelError ? (
						<View className="mb-2 rounded-md bg-red-500/10 px-3 py-2">
							<Text className="text-[13px] font-medium text-red-400">
								Models unavailable
							</Text>
							<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
								{chatModelError}
							</Text>
						</View>
					) : null}
					{!loadingChatModels && !chatModelError && chatModels.length === 0 ? (
						<View className="rounded-md bg-[#1a1a20] px-3 py-3">
							<Text className="text-[15px] font-medium text-[#d9d9df]">
								没有可用模型
							</Text>
							<Text className="mt-1 text-[13px] leading-5 text-[#8b8b96]">
								需要先在这台主机上启用模型提供方，才能使用 Chat。
							</Text>
						</View>
					) : null}
					{chatModels.map((model) => {
						const selected = model.id === selectedChatModel?.id;
						return (
							<Pressable
								key={model.id}
								onPress={() => {
									setSelectedModelId(model.id);
									setControlSheet(null);
								}}
								accessibilityRole="button"
								accessibilityState={{ selected }}
								className={cn(
									"mb-1 flex-row items-center gap-3 rounded-md px-2.5 py-2.5",
									selected ? "bg-[#1d1d24]" : "active:bg-[#1d1d24]",
								)}
							>
								<View className="size-8 items-center justify-center rounded-md bg-[#24242b]">
									<Icon as={Sparkles} className="size-4 text-[#d9d9df]" />
								</View>
								<View className="min-w-0 flex-1">
									<Text
										className="text-[15px] font-medium text-[#d9d9df]"
										numberOfLines={1}
									>
										{modelDisplayName(model)}
									</Text>
									<Text
										className="mt-0.5 text-[13px] text-[#8b8b96]"
										numberOfLines={1}
									>
										{modelSubtitle(model)}
									</Text>
								</View>
								{selected ? (
									<Icon as={Check} className="size-4 text-emerald-400" />
								) : null}
							</Pressable>
						);
					})}
				</ScrollView>
			)}
		</AdaptiveGlassSurface>
	);

	const handleConversationSwipeTouchStart = (
		item: WorktreeWindowListItem,
		event: GestureResponderEvent,
	) => {
		if (
			conversationSelectionMode ||
			deletingConversationIds.has(item.resourceId)
		) {
			conversationSwipeStartRef.current = null;
			return;
		}
		const touch = event.nativeEvent.touches[0];
		if (!touch) return;
		conversationSwipeStartRef.current = {
			resourceId: item.resourceId,
			pageX: touch.pageX,
			pageY: touch.pageY,
		};
	};

	const handleConversationSwipeTouchMove = (
		item: WorktreeWindowListItem,
		event: GestureResponderEvent,
	) => {
		const start = conversationSwipeStartRef.current;
		if (!start || start.resourceId !== item.resourceId) return;
		const touch = event.nativeEvent.touches[0];
		if (!touch) return;

		const dx = touch.pageX - start.pageX;
		const dy = touch.pageY - start.pageY;
		if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) {
			conversationSwipeStartRef.current = null;
			return;
		}
		if (dx < -28 && Math.abs(dx) > Math.abs(dy) * 1.2) {
			suppressedConversationPressRef.current = {
				resourceId: item.resourceId,
				until: Date.now() + 900,
			};
			setConversationManagementNotice(null);
			setOpenSwipedConversationId(item.resourceId);
			conversationSwipeStartRef.current = null;
		}
	};

	const handleConversationSwipeTouchEnd = (item: WorktreeWindowListItem) => {
		if (conversationSwipeStartRef.current?.resourceId === item.resourceId) {
			conversationSwipeStartRef.current = null;
		}
	};

	const shouldSuppressConversationPress = (resourceId: string) => {
		const suppressed = suppressedConversationPressRef.current;
		if (!suppressed || suppressed.resourceId !== resourceId) return false;
		if (suppressed.until < Date.now()) {
			suppressedConversationPressRef.current = null;
			return false;
		}
		return true;
	};

	const renderConversationDeleteAction = (
		item: WorktreeWindowListItem,
		variant: "sheet" | "drawer",
	) => (
		<Pressable
			onPress={() => {
				void handleDeleteConversations([item.resourceId]);
			}}
			disabled={deletingConversationIds.has(item.resourceId)}
			accessibilityRole="button"
			accessibilityLabel={`Delete ${item.title}`}
			testID={`workspace-window-delete-${item.resourceId}`}
			className={cn(
				"ml-2 items-center justify-center bg-red-500 active:bg-red-400",
				variant === "sheet" ? "rounded-xl" : "rounded-md",
				deletingConversationIds.has(item.resourceId) && "opacity-60",
			)}
			style={{
				width: 78,
				marginBottom: variant === "sheet" ? 8 : 6,
			}}
		>
			{deletingConversationIds.has(item.resourceId) ? (
				<ActivityIndicator size="small" />
			) : (
				<Icon as={Trash2} className="size-4 text-white" />
			)}
			<Text className="mt-0.5 text-[12px] font-medium text-white">删除</Text>
		</Pressable>
	);

	const renderWorktreeWindowRow = (
		item: WorktreeWindowListItem,
		options: { selected: boolean; variant: "sheet" | "drawer" },
	) => {
		const canDelete = item.kind === "chat" || item.kind === "terminal";
		const isSelectedForDelete = selectedConversationIds.has(item.resourceId);
		const isDeleting = deletingConversationIds.has(item.resourceId);
		const selectionDisabled = conversationSelectionMode && !canDelete;
		const WindowIcon = item.kind === "terminal" ? Terminal : MessageSquare;
		const rowIsSwipeOpen = openSwipedConversationId === item.resourceId;
		const conversationSelectionTapZoneWidth = 56;
		const row = (
			<Pressable
				key={`${item.id}:row`}
				onPress={(event) => {
					if (shouldSuppressConversationPress(item.resourceId)) {
						return;
					}
					if (rowIsSwipeOpen) {
						setOpenSwipedConversationId(null);
						return;
					}
					if (
						!conversationSelectionMode &&
						canDelete &&
						event.nativeEvent.locationX <= conversationSelectionTapZoneWidth
					) {
						enterConversationSelectionMode();
						toggleConversationSelection(item.resourceId);
						return;
					}
					handleSelectPanel(item);
				}}
				onLongPress={() => handleConversationLongPress(item)}
				onTouchEnd={() => handleConversationSwipeTouchEnd(item)}
				onTouchMove={(event) => handleConversationSwipeTouchMove(item, event)}
				onTouchStart={(event) => handleConversationSwipeTouchStart(item, event)}
				delayLongPress={280}
				disabled={isDeleting || selectionDisabled}
				accessibilityRole="button"
				accessibilityLabel={`${item.title}, ${item.subtitle}`}
				accessibilityHint={
					canDelete ? "Long press to select, swipe left to delete" : undefined
				}
				accessibilityState={{
					disabled: isDeleting || selectionDisabled,
					selected: options.selected || isSelectedForDelete,
				}}
				hitSlop={4}
				testID={`workspace-window-row-${item.kind}-${item.resourceId}`}
				className={cn(
					options.selected && !conversationSelectionMode
						? options.variant === "sheet"
							? "bg-[#202027]"
							: "bg-[#1d1d24]"
						: "active:bg-[#202027]",
					selectionDisabled && "opacity-45",
				)}
				style={[
					options.variant === "sheet"
						? shellStyles.worktreeWindowRowSheet
						: shellStyles.worktreeWindowRowDrawer,
					options.selected && !conversationSelectionMode
						? options.variant === "sheet"
							? shellStyles.worktreeWindowRowSelectedSheet
							: shellStyles.worktreeWindowRowSelectedDrawer
						: null,
					selectionDisabled ? shellStyles.disabledRow : null,
				]}
			>
				<View className="flex-row items-center gap-3">
					{conversationSelectionMode && canDelete ? (
						<Pressable
							onPress={(event) => {
								event.stopPropagation();
								toggleConversationSelection(item.resourceId);
							}}
							disabled={isDeleting || selectionDisabled}
							accessibilityRole="checkbox"
							accessibilityLabel={`Select ${item.title}`}
							accessibilityState={{
								checked: isSelectedForDelete,
								disabled: isDeleting || selectionDisabled,
							}}
							hitSlop={10}
							testID={`workspace-window-selection-${item.resourceId}`}
							className={cn(
								"size-7 items-center justify-center rounded-full border",
								isSelectedForDelete
									? "border-emerald-400 bg-emerald-400"
									: "border-[#4a4a54]",
								(isDeleting || selectionDisabled) && "opacity-45",
							)}
						>
							{isSelectedForDelete ? (
								<Icon as={Check} className="size-4 text-[#050507]" />
							) : null}
						</Pressable>
					) : null}
					<View
						className={cn(
							"size-8 items-center justify-center bg-[#2d2d36]",
							options.variant === "sheet" ? "rounded-full" : "rounded-md",
						)}
					>
						<Icon as={WindowIcon} className="size-4 text-[#d9d9df]" />
					</View>
					<View className="min-w-0 flex-1">
						<Text
							className={cn(
								"font-medium text-[#d9d9df]",
								options.variant === "sheet" ? "text-[15px]" : "text-[15px]",
							)}
							numberOfLines={1}
						>
							{item.title}
						</Text>
						<Text className="mt-1 text-[12px] text-[#8b8b96]" numberOfLines={1}>
							{item.subtitle}
						</Text>
					</View>
					{item.isLocal || isDeleting ? (
						<ActivityIndicator size="small" />
					) : null}
					{options.selected && !conversationSelectionMode ? (
						<View
							className={cn(
								options.variant === "sheet"
									? "size-2 rounded-full bg-emerald-400"
									: "size-1.5 rounded-full bg-[#d9d9df]",
							)}
						/>
					) : null}
				</View>
			</Pressable>
		);

		if (!canDelete || conversationSelectionMode) {
			return row;
		}

		return (
			<View
				key={item.id}
				style={rowIsSwipeOpen ? shellStyles.swipedConversationRow : null}
				testID={`workspace-window-swipe-${item.resourceId}`}
			>
				<View
					style={rowIsSwipeOpen ? shellStyles.swipedConversationBody : null}
				>
					{row}
				</View>
				{rowIsSwipeOpen
					? renderConversationDeleteAction(item, options.variant)
					: null}
			</View>
		);
	};

	const renderConversationListHeader = () => (
		<View className="mb-2 flex-row items-center justify-between px-0.5">
			<View className="min-w-0 flex-1">
				<Text className="text-[14px] font-medium text-[#d9d9df]">
					{conversationSelectionMode ? "选择会话" : "会话"}
				</Text>
				{conversationSelectionMode ? (
					<Text className="mt-0.5 text-[12px] text-[#8b8b96]">
						已选择 {selectedConversationCount}
					</Text>
				) : null}
			</View>
			<View className="flex-row items-center gap-2">
				{loadingTerminals ? <ActivityIndicator size="small" /> : null}
			</View>
		</View>
	);

	const renderConversationManagementActions = (variant: "sheet" | "drawer") => {
		if (!hasDeletableConversations || !conversationSelectionMode) return null;

		const actionWidth =
			variant === "sheet" ? Math.max(112, Math.floor((width - 72) / 3)) : 112;

		return (
			<ScrollView
				horizontal
				keyboardShouldPersistTaps="handled"
				showsHorizontalScrollIndicator={false}
				className="mb-2"
			>
				<View className="flex-row gap-2">
					<Pressable
						onPress={handleExitConversationSelection}
						accessibilityRole="button"
						accessibilityLabel="Cancel conversation selection"
						className="items-center justify-center gap-1.5 rounded-2xl bg-[#202027] px-2 active:bg-[#2a2a33]"
						style={[
							shellStyles.conversationManagementAction,
							{ width: actionWidth },
						]}
					>
						<Icon as={X} className="size-4 text-[#d9d9df]" />
						<Text className="text-center text-[12px] font-medium text-[#d9d9df]">
							取消
						</Text>
					</Pressable>
					<Pressable
						onPress={() => {
							void handleDeleteConversations(selectedConversationIds);
						}}
						disabled={
							selectedConversationCount === 0 ||
							selectedConversationDeleteIsBusy
						}
						accessibilityRole="button"
						accessibilityLabel="Delete selected sessions"
						className={cn(
							"items-center justify-center gap-1.5 rounded-2xl bg-red-500 px-2 active:bg-red-400",
							(selectedConversationCount === 0 ||
								selectedConversationDeleteIsBusy) &&
								"opacity-45",
						)}
						style={[
							shellStyles.conversationManagementAction,
							{ width: actionWidth },
						]}
					>
						<Icon as={Trash2} className="size-4 text-white" />
						<Text className="text-center text-[12px] font-medium text-white">
							删除
						</Text>
					</Pressable>
				</View>
			</ScrollView>
		);
	};

	const renderConversationManagementHint = (variant: "sheet" | "drawer") => {
		if (conversationSelectionMode || !conversationManagementHint) return null;

		return (
			<View
				testID="workspace-window-management-hint"
				className={cn(
					"mb-2 bg-[#202027] px-3 py-2",
					variant === "sheet" ? "rounded-xl" : "rounded-md",
				)}
			>
				<Text className="text-[12px] leading-4 text-[#a2a2ad]">
					{conversationManagementHint}
				</Text>
			</View>
		);
	};

	const renderTerminalSwitcherSheetContent = () => {
		const compactActionWidth = Math.max(112, Math.floor((width - 72) / 3));
		const switcherSheetMaxHeight = Math.max(
			360,
			Math.floor(height - insets.top - Math.max(insets.bottom, 0) - 120),
		);
		const switcherSheetBottomPadding = Math.max(insets.bottom + 88, 116);
		return (
			<GestureScrollView
				testID="workspace-terminal-switcher-sheet"
				className="min-h-0"
				alwaysBounceVertical={false}
				contentContainerStyle={{
					backgroundColor: terminalActionsSheetBackground,
					gap: 12,
					paddingBottom: switcherSheetBottomPadding,
				}}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
				style={{
					backgroundColor: terminalActionsSheetBackground,
					maxHeight: switcherSheetMaxHeight,
				}}
			>
				<View className="gap-2">
					<Text className="px-1 text-[11px] font-medium uppercase text-[#7f7f89]">
						创建
					</Text>
					<ScrollView
						horizontal
						keyboardShouldPersistTaps="handled"
						showsHorizontalScrollIndicator={false}
					>
						<View className="flex-row gap-2">
							<Pressable
								onPress={handleCreateTerminalWindow}
								disabled={!canUseHost || creatingTerminal}
								accessibilityRole="button"
								accessibilityLabel="New terminal"
								className={cn(
									"min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-[#15151b] px-2 active:bg-[#202027]",
									(!canUseHost || creatingTerminal) && "opacity-45",
								)}
								style={{ width: compactActionWidth }}
							>
								{creatingTerminal ? (
									<ActivityIndicator size="small" />
								) : (
									<Icon as={SquarePen} className="size-5 text-[#d9d9df]" />
								)}
								<Text className="text-center text-[13px] font-medium text-[#d9d9df]">
									新终端
								</Text>
							</Pressable>
							<Pressable
								onPress={() => {
									void handleCreateConversation();
								}}
								disabled={!canUseHost || creatingConversation}
								accessibilityRole="button"
								accessibilityLabel="New conversation"
								className={cn(
									"min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-[#15151b] px-2 active:bg-[#202027]",
									(!canUseHost || creatingConversation) && "opacity-45",
								)}
								style={{ width: compactActionWidth }}
							>
								{creatingConversation ? (
									<ActivityIndicator size="small" />
								) : (
									<Icon as={MessageSquare} className="size-5 text-[#d9d9df]" />
								)}
								<Text className="text-center text-[13px] font-medium text-[#d9d9df]">
									新对话
								</Text>
							</Pressable>
						</View>
					</ScrollView>
				</View>

				<View className="rounded-2xl bg-[#15151b] p-2.5">
					{renderConversationListHeader()}
					{renderConversationManagementActions("sheet")}
					{renderConversationManagementHint("sheet")}
					{worktreeWindowItems.length > 0 ? (
						worktreeWindowItems.map((item) => {
							const selected =
								item.kind === "chat"
									? activeSurfaceKind === "chat" &&
										item.resourceId === selectedSessionId
									: activeSurfaceKind === "terminal" &&
										activeTerminalRun?.terminalId === item.resourceId;
							return renderWorktreeWindowRow(item, {
								selected,
								variant: "sheet",
							});
						})
					) : (
						<View className="rounded-xl bg-[#202027] px-3 py-3">
							<Text className="text-[14px] font-medium text-[#d9d9df]">
								暂无会话
							</Text>
							<Text className="mt-1 text-[12px] leading-4 text-[#8b8b96]">
								创建一个终端或对话后会出现在这里。
							</Text>
						</View>
					)}
					{conversationDeleteError ? (
						<View className="mt-2 rounded-xl bg-red-500/10 px-3 py-2.5">
							<Text className="text-[13px] font-medium text-red-300">
								会话删除失败
							</Text>
							<Text className="mt-0.5 text-[12px] leading-4 text-[#8b8b96]">
								{conversationDeleteError}
							</Text>
						</View>
					) : null}
					{terminalListError ? (
						<View className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2.5">
							<Text className="text-[13px] font-medium text-amber-300">
								终端会话不可用
							</Text>
							<Text className="mt-0.5 text-[12px] leading-4 text-[#8b8b96]">
								{terminalListError}
							</Text>
						</View>
					) : null}
				</View>

				<View className="rounded-2xl bg-[#15151b] px-3 py-3">
					<View className="flex-row items-center gap-2">
						<Icon as={Laptop} className="size-4 text-[#8b8b96]" />
						<View className="min-w-0 flex-1">
							<Text className="text-[13px] text-[#d9d9df]" numberOfLines={1}>
								{hostName}
							</Text>
							<Text className="text-[12px] text-[#8b8b96]" numberOfLines={1}>
								{hostDrawerStatus}
							</Text>
						</View>
						<View
							className={cn(
								"size-2 rounded-full",
								hostDotClassName(effectiveHostIsOnline),
							)}
						/>
					</View>
				</View>
			</GestureScrollView>
		);
	};

	const renderTerminalActionsSheet = () => {
		if (!terminalActionsSheetMounted) return null;
		const activeTerminalStatus = !activeTerminalRun
			? "未连接"
			: activeTerminalRun.exited
				? activeTerminalRun.exitCode === null
					? "已结束"
					: `已结束 ${activeTerminalRun.exitCode}`
				: "运行中";
		const compactActionWidth = Math.max(112, Math.floor((width - 72) / 3));
		const presetTileWidth = "48%" as const;
		const canFillTerminalPreset =
			canUseHost && Boolean(activeTerminalRun) && !activeTerminalRun?.exited;
		const sheetTitle =
			terminalActionsSheetMode === "switcher"
				? "切换会话"
				: terminalActionsSheetMode === "model"
					? "终端模型配置"
					: "终端操作";
		const sheetSubtitle =
			terminalActionsSheetMode === "switcher"
				? `${hostName} · ${hostDrawerStatus}`
				: terminalActionsSheetMode === "model"
					? `${selectedAgentLabel} · ${hostName}`
					: workspacePath;
		const selectedTerminalActionsSheetDetent =
			terminalActionsSheetMode === "switcher"
				? terminalActionsSheetExpandedDetent
				: terminalActionsSheetMode === "model"
					? terminalActionsSheetCompactDetent
					: terminalActionsSheetCompactDetent;

		return (
			<SwiftUIHost style={{ position: "absolute", width }}>
				<SwiftUIBottomSheet
					fitToContents={false}
					isPresented={terminalActionsSheetOpen}
					onDismiss={handleTerminalActionsDismiss}
					onIsPresentedChange={handleTerminalActionsPresentedChange}
				>
					<SwiftUIGroup
						modifiers={[
							environment("colorScheme", "dark"),
							presentationDetents(terminalActionsSheetDetents, {
								selection: selectedTerminalActionsSheetDetent,
							}),
							presentationDragIndicator("hidden"),
							interactiveDismissDisabled(false),
							background(terminalActionsSheetBackground),
						]}
					>
						<RNHostView>
							<View
								testID="workspace-terminal-actions-sheet"
								className="flex-1 px-5 pt-2"
								style={{ backgroundColor: terminalActionsSheetBackground }}
							>
								<View className="mb-3 h-1 w-12 self-center rounded-full bg-[#73737c]" />
								<View className="mb-3 flex-row items-center justify-between">
									<View className="min-w-0 flex-1">
										<Text className="text-[17px] font-medium text-[#f2f2f4]">
											{sheetTitle}
										</Text>
										<Text
											className="mt-0.5 text-[13px] text-[#8b8b96]"
											numberOfLines={1}
										>
											{sheetSubtitle}
										</Text>
									</View>
									<Pressable
										onPress={closeTerminalActionsSheet}
										accessibilityRole="button"
										accessibilityLabel="Close terminal operations"
										className="size-9 items-center justify-center rounded-full bg-[#1a1a20]"
									>
										<Icon as={X} className="size-4 text-[#d9d9df]" />
									</Pressable>
								</View>

								{terminalActionsSheetMode === "switcher" ? (
									renderTerminalSwitcherSheetContent()
								) : terminalActionsSheetMode === "model" ? (
									<ScrollView
										className="min-h-0 flex-1"
										contentContainerStyle={{
											backgroundColor: terminalActionsSheetBackground,
											gap: 12,
											paddingBottom: Math.max(insets.bottom + 22, 34),
										}}
										keyboardShouldPersistTaps="handled"
										showsVerticalScrollIndicator={false}
										style={{ backgroundColor: terminalActionsSheetBackground }}
									>
										<View className="rounded-2xl bg-[#15151b] px-3 py-3">
											<View className="flex-row items-center gap-3">
												<View className="size-10 items-center justify-center rounded-full bg-[#24242b]">
													<Icon as={Wrench} className="size-5 text-[#f2f2f4]" />
												</View>
												<View className="min-w-0 flex-1">
													<Text
														className="text-[15px] font-medium text-[#f2f2f4]"
														numberOfLines={1}
													>
														主机默认
													</Text>
													<Text className="mt-0.5 text-[13px] text-[#8b8b96]">
														终端模型由主机 Agent 配置控制
													</Text>
												</View>
											</View>
											<Text className="mt-3 text-[13px] leading-5 text-[#8b8b96]">
												移动端不会把终端会话改造成 Chat 模型选择器。Claude
												Code、Codex 等终端 Agent
												的模型、权限和启动参数以这台主机上的配置为准。
											</Text>
										</View>

										<View className="rounded-2xl bg-[#15151b] px-3 py-3">
											<View className="mb-2 flex-row items-center justify-between">
												<Text className="text-[14px] font-medium text-[#d9d9df]">
													当前终端 Agent
												</Text>
												<Text className="text-[12px] text-[#8b8b96]">
													Host default
												</Text>
											</View>
											<View className="flex-row items-center gap-3">
												<View className="size-9 items-center justify-center rounded-full bg-[#24242b]">
													<Icon
														as={Terminal}
														className="size-4 text-[#d9d9df]"
													/>
												</View>
												<View className="min-w-0 flex-1">
													<Text
														className="text-[15px] font-medium text-[#d9d9df]"
														numberOfLines={1}
													>
														{selectedAgentLabel}
													</Text>
													<Text
														className="mt-0.5 font-mono text-[12px] text-[#8b8b96]"
														numberOfLines={1}
													>
														{terminalPresetCommand(selectedTerminalAgent) ??
															"主机配置未同步命令"}
													</Text>
												</View>
											</View>
										</View>

										<View className="rounded-2xl bg-[#15151b] px-3 py-3">
											<Text className="text-[14px] font-medium text-[#d9d9df]">
												可用终端预设
											</Text>
											<Text className="mt-1 text-[12px] leading-4 text-[#8b8b96]">
												返回终端操作后选择预设，会把对应启动命令填入当前终端，不会自动回车执行。
											</Text>
											<View className="mt-3 flex-row flex-wrap gap-2">
												{terminalPresetOptions.map((preset) => (
													<View
														key={preset.id}
														className="rounded-full bg-[#202027] px-2.5 py-1.5"
													>
														<Text className="text-[12px] font-medium text-[#d9d9df]">
															{preset.label}
														</Text>
													</View>
												))}
											</View>
											{terminalPresetError ? (
												<Text className="mt-2 text-[12px] leading-4 text-amber-300">
													{terminalPresetError}
												</Text>
											) : null}
										</View>

										<Pressable
											onPress={() => setTerminalActionsSheetMode("actions")}
											accessibilityRole="button"
											accessibilityLabel="Back to terminal operations"
											className="min-h-12 items-center justify-center rounded-2xl bg-[#202027] active:bg-[#2a2a33]"
										>
											<Text className="text-[14px] font-medium text-[#d9d9df]">
												返回终端操作
											</Text>
										</Pressable>
									</ScrollView>
								) : (
									<ScrollView
										className="min-h-0 flex-1"
										contentContainerStyle={{
											backgroundColor: terminalActionsSheetBackground,
											gap: 12,
											paddingBottom: Math.max(insets.bottom + 22, 34),
										}}
										keyboardShouldPersistTaps="handled"
										showsVerticalScrollIndicator={false}
										style={{ backgroundColor: terminalActionsSheetBackground }}
									>
										<View className="rounded-2xl bg-[#15151b] px-3 py-3">
											<View className="flex-row items-center gap-3">
												<View className="size-10 items-center justify-center rounded-full bg-[#24242b]">
													<Icon
														as={Terminal}
														className="size-5 text-[#f2f2f4]"
													/>
												</View>
												<View className="min-w-0 flex-1">
													<Text
														className="text-[15px] font-medium text-[#f2f2f4]"
														numberOfLines={1}
													>
														{activeWindowTitle}
													</Text>
													<Text
														className="mt-0.5 text-[13px] text-[#8b8b96]"
														numberOfLines={1}
													>
														{hostDrawerStatus}
													</Text>
												</View>
												<View className="items-end">
													<Text className="text-[12px] text-[#8b8b96]">
														{activeTerminalStatus}
													</Text>
													<View
														className={cn(
															"mt-1 size-2 rounded-full",
															hostDotClassName(effectiveHostIsOnline),
														)}
													/>
												</View>
											</View>
										</View>

										<View className="gap-2">
											<View className="flex-row items-center justify-between px-1">
												<Text className="text-[11px] font-medium uppercase text-[#7f7f89]">
													运行时
												</Text>
												<Pressable
													onPress={openTerminalModelConfigurationSheet}
													accessibilityRole="button"
													accessibilityLabel="Terminal model configuration"
													className="rounded-full bg-[#202027] px-2.5 py-1 active:bg-[#2a2a33]"
												>
													<Text className="text-[12px] font-medium text-[#d9d9df]">
														主机默认
													</Text>
												</Pressable>
											</View>
											<View className="rounded-2xl bg-[#15151b] p-2.5">
												<View className="mb-2 flex-row items-center justify-between px-0.5">
													<Text className="text-[14px] font-medium text-[#d9d9df]">
														Terminal presets
													</Text>
													{loadingTerminalPresets ? (
														<ActivityIndicator size="small" />
													) : null}
												</View>
												<View className="flex-row flex-wrap gap-2">
													{terminalPresetOptions.map((preset) => {
														const command = terminalPresetOptionCommand(preset);
														const disabled =
															loadingTerminalPresets ||
															!canFillTerminalPreset ||
															!command;
														return (
															<Pressable
																key={preset.id}
																onPress={() => handleFillTerminalPreset(preset)}
																disabled={disabled}
																accessibilityRole="button"
																accessibilityLabel={`Fill ${preset.label} terminal preset`}
																className={cn(
																	"min-h-[58px] flex-row items-center gap-2 rounded-xl bg-[#202027] px-2.5 py-2 active:bg-[#2a2a33]",
																	disabled && "opacity-45",
																)}
																style={{
																	flexBasis: presetTileWidth,
																	maxWidth: presetTileWidth,
																}}
															>
																<View className="size-7 items-center justify-center rounded-full bg-[#2d2d36]">
																	<Icon
																		as={Terminal}
																		className="size-3.5 text-[#d9d9df]"
																	/>
																</View>
																<View className="min-w-0 flex-1">
																	<Text
																		className="text-[14px] font-medium text-[#d9d9df]"
																		numberOfLines={1}
																	>
																		{preset.label}
																	</Text>
																	<Text
																		className="mt-0.5 font-mono text-[11px] text-[#8b8b96]"
																		numberOfLines={1}
																	>
																		{command ?? "命令未同步"}
																	</Text>
																</View>
															</Pressable>
														);
													})}
												</View>
												{terminalPresetError ? (
													<Text className="mt-2 px-1 text-[12px] leading-4 text-amber-300">
														{terminalPresetError}
													</Text>
												) : null}
											</View>
										</View>

										<View className="gap-2">
											<Text className="px-1 text-[11px] font-medium uppercase text-[#7f7f89]">
												会话
											</Text>
											<ScrollView
												horizontal
												keyboardShouldPersistTaps="handled"
												showsHorizontalScrollIndicator={false}
											>
												<View className="flex-row gap-2">
													<Pressable
														onPress={handleCreateTerminalWindow}
														disabled={!canUseHost || creatingTerminal}
														accessibilityRole="button"
														accessibilityLabel="New terminal"
														className={cn(
															"min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-[#15151b] px-2 active:bg-[#202027]",
															(!canUseHost || creatingTerminal) && "opacity-45",
														)}
														style={{ width: compactActionWidth }}
													>
														{creatingTerminal ? (
															<ActivityIndicator size="small" />
														) : (
															<Icon
																as={SquarePen}
																className="size-5 text-[#d9d9df]"
															/>
														)}
														<Text className="text-center text-[13px] font-medium text-[#d9d9df]">
															新终端
														</Text>
													</Pressable>
													<Pressable
														onPress={() => {
															void handleCreateConversation();
														}}
														disabled={!canUseHost || creatingConversation}
														accessibilityRole="button"
														accessibilityLabel="New conversation"
														className={cn(
															"min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-[#15151b] px-2 active:bg-[#202027]",
															(!canUseHost || creatingConversation) &&
																"opacity-45",
														)}
														style={{ width: compactActionWidth }}
													>
														{creatingConversation ? (
															<ActivityIndicator size="small" />
														) : (
															<Icon
																as={MessageSquare}
																className="size-5 text-[#d9d9df]"
															/>
														)}
														<Text className="text-center text-[13px] font-medium text-[#d9d9df]">
															新对话
														</Text>
													</Pressable>
													<Pressable
														onPress={openTerminalSwitcherSheet}
														disabled={worktreeWindowItems.length === 0}
														accessibilityRole="button"
														accessibilityLabel="Switch worktree session"
														className={cn(
															"min-h-16 items-center justify-center gap-1.5 rounded-2xl bg-[#15151b] px-2 active:bg-[#202027]",
															worktreeWindowItems.length === 0 && "opacity-45",
														)}
														style={{ width: compactActionWidth }}
													>
														<Icon
															as={ChevronDown}
															className="size-5 text-[#d9d9df]"
														/>
														<Text className="text-center text-[13px] font-medium text-[#d9d9df]">
															切换
														</Text>
													</Pressable>
												</View>
											</ScrollView>
										</View>
									</ScrollView>
								)}
							</View>
						</RNHostView>
					</SwiftUIGroup>
				</SwiftUIBottomSheet>
			</SwiftUIHost>
		);
	};

	const renderControlSheet = () => {
		if (!controlSheet) return null;
		return (
			<Modal
				animationType="slide"
				onRequestClose={() => setControlSheet(null)}
				presentationStyle="overFullScreen"
				transparent
				visible
			>
				<View className="flex-1 justify-end bg-black/60">
					<Pressable
						onPress={() => setControlSheet(null)}
						className="min-h-0 flex-1"
					/>
					{controlSheet === "agent" ? renderAgentSheet() : renderModelSheet()}
				</View>
			</Modal>
		);
	};

	const renderChatHeader = () => (
		<View
			className="bg-[#050507] px-5 pb-2"
			style={{ paddingTop: insets.top + 12 }}
		>
			<View className="h-14 flex-row items-center gap-3">
				<Pressable
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Back to workspaces"
					className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15"
				>
					<Icon as={ChevronLeft} className="size-8 text-[#f2f2f4]" />
				</Pressable>
				<Pressable
					onPress={showNativeWindowSwitcher}
					className="min-w-0 flex-1 active:opacity-80"
				>
					<View className="min-w-0 flex-row items-center gap-1.5">
						<Text
							className="min-w-0 text-[19px] font-semibold text-[#f2f2f4]"
							numberOfLines={1}
						>
							{workspaceDisplayTitle}
						</Text>
						<Icon as={ChevronDown} className="size-3.5 text-[#8b8b96]" />
					</View>
					<Text className="mt-0.5 text-[15px] text-[#8b8b96]" numberOfLines={1}>
						{detailHeaderSubtitle}
					</Text>
				</Pressable>
				<View className="h-12 flex-row items-center rounded-full border border-white/10 bg-white/10 px-1">
					<Pressable
						onPress={handleCreateConversation}
						disabled={!canUseHost || creatingConversation}
						accessibilityRole="button"
						accessibilityLabel="New conversation"
						className={cn(
							"size-10 items-center justify-center rounded-full active:bg-white/12",
							(!canUseHost || creatingConversation) && "opacity-45",
						)}
					>
						{creatingConversation ? (
							<ActivityIndicator size="small" />
						) : (
							<Icon as={SquarePen} className="size-6 text-[#f2f2f4]" />
						)}
					</Pressable>
					<View className="h-5 w-px bg-white/10" />
					<Pressable
						onPress={showNativeChatActions}
						accessibilityRole="button"
						accessibilityLabel="Conversation actions"
						className="size-10 items-center justify-center rounded-full active:bg-white/12"
					>
						<Icon as={Ellipsis} className="size-6 text-[#f2f2f4]" />
					</Pressable>
				</View>
			</View>
		</View>
	);

	const renderTerminalHeader = () => (
		<View
			className="bg-[#050507] px-5 pb-2"
			style={{ paddingTop: insets.top + 12 }}
		>
			<View className="h-14 flex-row items-center gap-3">
				<Pressable
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Back to workspaces"
					className="size-12 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/15"
				>
					<Icon as={ChevronLeft} className="size-8 text-[#f2f2f4]" />
				</Pressable>
				<Pressable
					onPress={showNativeWindowSwitcher}
					className="min-w-0 flex-1 active:opacity-80"
				>
					<View className="min-w-0 flex-row items-center gap-1.5">
						<Text
							className="min-w-0 text-[19px] font-semibold text-[#f2f2f4]"
							numberOfLines={1}
						>
							{workspaceDisplayTitle}
						</Text>
						<Icon as={ChevronDown} className="size-3.5 text-[#8b8b96]" />
					</View>
					<Text className="mt-0.5 text-[15px] text-[#8b8b96]" numberOfLines={1}>
						{detailHeaderSubtitle}
					</Text>
				</Pressable>
				<View className="h-12 flex-row items-center rounded-full border border-white/10 bg-white/10 px-1">
					<Pressable
						onPress={handleCreateTerminalWindow}
						disabled={!canUseHost || creatingTerminal}
						accessibilityRole="button"
						accessibilityLabel="New terminal"
						className={cn(
							"size-10 items-center justify-center rounded-full active:bg-white/12",
							(!canUseHost || creatingTerminal) && "opacity-45",
						)}
					>
						{creatingTerminal ? (
							<ActivityIndicator size="small" />
						) : (
							<Icon as={SquarePen} className="size-6 text-[#f2f2f4]" />
						)}
					</Pressable>
					<View className="h-5 w-px bg-white/10" />
					<Pressable
						onPress={showNativeTerminalActions}
						accessibilityRole="button"
						accessibilityLabel="Terminal actions"
						className="size-10 items-center justify-center rounded-full active:bg-white/12"
					>
						<Icon as={Ellipsis} className="size-6 text-[#f2f2f4]" />
					</Pressable>
				</View>
			</View>
		</View>
	);

	const renderSwitcher = () => {
		if (!switcherOpen || Platform.OS === "ios") return null;
		return (
			<Modal
				animationType="fade"
				onRequestClose={() => setSwitcherOpen(false)}
				presentationStyle="overFullScreen"
				transparent
				visible
			>
				<View className="flex-1 flex-row bg-black/60">
					<View
						className="border-[#27272f] border-r bg-[#111116]"
						style={{
							width: drawerWidth,
							paddingTop: insets.top + 10,
							paddingBottom: Math.max(insets.bottom, 10),
						}}
					>
						<View className="flex-row items-center justify-between px-3 pb-3">
							<View className="min-w-0 flex-1">
								<Text
									className="text-[17px] font-normal text-[#d9d9df]"
									numberOfLines={1}
								>
									会话
								</Text>
								<Text
									className="mt-0.5 text-[13px] text-[#8b8b96]"
									numberOfLines={1}
								>
									{workspacePath}
								</Text>
							</View>
							<Pressable
								onPress={() => setSwitcherOpen(false)}
								className="size-9 items-center justify-center rounded-full bg-[#1a1a20]"
							>
								<Icon as={X} className="size-4 text-[#d9d9df]" />
							</Pressable>
						</View>

						<View className="px-2">
							<Pressable
								onPress={handleCreateTerminalWindow}
								disabled={!canUseHost || creatingTerminal}
								accessibilityRole="button"
								accessibilityLabel="New terminal"
								className={cn(
									"flex-row items-center gap-3 rounded-md px-2.5 py-2 active:bg-[#1d1d24]",
									(!canUseHost || creatingTerminal) && "opacity-45",
								)}
							>
								<Icon as={Terminal} className="size-4 text-[#8b8b96]" />
								<Text className="text-[15px] text-[#d9d9df]">新终端</Text>
							</Pressable>
							<Pressable
								onPress={() => {
									void handleCreateConversation();
								}}
								disabled={!canUseHost || creatingConversation}
								accessibilityRole="button"
								accessibilityLabel="New conversation"
								className={cn(
									"flex-row items-center gap-3 rounded-md px-2.5 py-2 active:bg-[#1d1d24]",
									(!canUseHost || creatingConversation) && "opacity-45",
								)}
							>
								<Icon as={MessageSquare} className="size-4 text-[#8b8b96]" />
								<Text className="text-[15px] text-[#d9d9df]">新对话</Text>
							</Pressable>
						</View>

						<GestureScrollView
							className="min-h-0 flex-1 px-2"
							contentContainerStyle={{ paddingBottom: 72 }}
							keyboardShouldPersistTaps="handled"
						>
							<View className="pt-4">{renderConversationListHeader()}</View>
							{renderConversationManagementActions("drawer")}
							{renderConversationManagementHint("drawer")}
							{worktreeWindowItems.length > 0 ? (
								worktreeWindowItems.map((item) => {
									const selected =
										item.kind === "chat"
											? activeSurfaceKind === "chat" &&
												item.resourceId === selectedSessionId
											: activeSurfaceKind === "terminal" &&
												activeTerminalRun?.terminalId === item.resourceId;
									return renderWorktreeWindowRow(item, {
										selected,
										variant: "drawer",
									});
								})
							) : (
								<View className="px-2.5 py-2">
									<Text className="text-[15px] text-[#8b8b96]">暂无会话</Text>
								</View>
							)}
							{conversationDeleteError ? (
								<View className="mx-2.5 mt-1 rounded-md bg-red-500/10 px-2.5 py-2">
									<Text className="text-[13px] font-medium text-red-300">
										会话删除失败
									</Text>
									<Text className="mt-0.5 text-[12px] leading-4 text-[#8b8b96]">
										{conversationDeleteError}
									</Text>
								</View>
							) : null}
							{terminalListError ? (
								<View className="mx-2.5 mt-1 rounded-md bg-amber-500/10 px-2.5 py-2">
									<Text className="text-[13px] font-medium text-amber-300">
										终端会话不可用
									</Text>
									<Text className="mt-0.5 text-[12px] leading-4 text-[#8b8b96]">
										{terminalListError}
									</Text>
								</View>
							) : null}
						</GestureScrollView>

						<View className="border-[#27272f] border-t px-2 pt-2">
							<View className="flex-row items-center gap-2 px-2.5 py-2">
								<Icon as={Laptop} className="size-3.5 text-[#8b8b96]" />
								<View className="min-w-0 flex-1">
									<Text
										className="text-[13px] text-[#8b8b96]"
										numberOfLines={1}
									>
										{hostName}
									</Text>
									<Text
										className="text-[11px] text-[#8b8b96]"
										numberOfLines={1}
									>
										{hostDrawerStatus}
									</Text>
								</View>
								<View
									className={cn(
										"size-1.5 rounded-full",
										hostDotClassName(effectiveHostIsOnline),
									)}
								/>
							</View>
						</View>
					</View>
					<Pressable
						onPress={() => setSwitcherOpen(false)}
						className="flex-1"
					/>
				</View>
			</Modal>
		);
	};

	return (
		<View className="flex-1 bg-[#050507]">
			{activeSurfaceKind === "terminal"
				? renderTerminalHeader()
				: renderChatHeader()}
			{activeSurfaceKind === "chat"
				? renderChatSurface()
				: renderTerminalSurface()}
			{switcherOpen ? null : (
				<View
					className="absolute bottom-0 left-0 top-0 z-40"
					onResponderGrant={handleEdgeSwipeStart}
					onResponderRelease={handleEdgeSwipeEnd}
					onResponderTerminate={() => {
						edgeSwipeStartRef.current = null;
					}}
					onStartShouldSetResponder={() => true}
					pointerEvents="box-only"
					style={{ width: edgeSwipeWidth }}
				/>
			)}
			{renderSwitcher()}
			{renderTerminalActionsSheet()}
			{renderControlSheet()}
		</View>
	);
}

const shellStyles = StyleSheet.create({
	glassSurface: {
		overflow: "hidden",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(255, 255, 255, 0.12)",
	},
	glassDark: {
		backgroundColor: "rgba(24, 24, 28, 0.92)",
	},
	glassLight: {
		backgroundColor: "rgba(242, 242, 244, 0.94)",
	},
	composerSurface: {
		borderRadius: 28,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	terminalAccessorySurface: {
		borderRadius: 18,
		paddingHorizontal: 8,
		paddingVertical: 7,
	},
	conversationManagementAction: {
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
	},
	worktreeWindowRowSheet: {
		minHeight: 58,
		marginBottom: 8,
		borderRadius: 14,
		backgroundColor: "#19191f",
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	worktreeWindowRowDrawer: {
		minHeight: 54,
		marginBottom: 6,
		borderRadius: 8,
		backgroundColor: "#17171d",
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	worktreeWindowRowSelectedSheet: {
		backgroundColor: "#202027",
	},
	worktreeWindowRowSelectedDrawer: {
		backgroundColor: "#1d1d24",
	},
	swipedConversationRow: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	swipedConversationBody: {
		flex: 1,
	},
	disabledRow: {
		opacity: 0.45,
	},
	sheetSurface: {
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		paddingHorizontal: 16,
		paddingTop: 10,
	},
});
