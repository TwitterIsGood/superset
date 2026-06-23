import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import {
	AlertTriangle,
	CheckCircle2,
	Circle,
	Info,
	Wrench,
} from "lucide-react";

type ControlChatData = RouterOutputs["controlChat"]["getSession"];
type ControlChatMessage = ControlChatData["messages"][number];
type ControlChatToolCall = ControlChatData["toolCalls"][number];

interface ControlChatMessageListProps {
	data: ControlChatData | null;
	isLoading: boolean;
	error: unknown;
}

function formatTime(value: Date | string) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Control Chat failed to load.";
}

const safeTextClassName =
	"min-w-0 max-w-full break-words [overflow-wrap:anywhere]";
const safeMultilineTextClassName = `${safeTextClassName} whitespace-pre-wrap`;
const boundedPartClassName = "min-w-0 max-w-full overflow-hidden";

function ToolStatusIcon({ status }: { status: ControlChatToolCall["status"] }) {
	if (status === "completed") {
		return <CheckCircle2 className="size-3.5 text-emerald-600" />;
	}
	if (status === "failed") {
		return <AlertTriangle className="size-3.5 text-destructive" />;
	}
	if (status === "running") {
		return <Circle className="size-3.5 animate-pulse text-primary" />;
	}
	return <Circle className="size-3.5 text-muted-foreground" />;
}

function MessagePart({
	part,
	toolCallsById,
}: {
	part: ControlChatMessage["content"][number];
	toolCallsById: Map<string, ControlChatToolCall>;
}) {
	if (part.type === "text") {
		return <p className={safeMultilineTextClassName}>{part.text}</p>;
	}
	if (part.type === "error") {
		return (
			<div
				className={cn(
					boundedPartClassName,
					"flex gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive",
				)}
			>
				<AlertTriangle className="mt-0.5 size-4 shrink-0" />
				<p
					className={cn(
						safeMultilineTextClassName,
						"flex-1 select-text cursor-text",
					)}
				>
					{part.text}
				</p>
			</div>
		);
	}
	if (part.type === "context_summary") {
		return (
			<div
				className={cn(
					boundedPartClassName,
					"rounded-md border bg-muted/40 px-3 py-2 text-xs",
				)}
			>
				<div className="mb-1 flex min-w-0 items-center gap-1.5 font-medium">
					<Info className="size-3.5 shrink-0" />
					<span className={safeTextClassName}>{part.title}</span>
				</div>
				<ul className="min-w-0 space-y-1 text-muted-foreground">
					{part.items.map((item) => (
						<li className={safeTextClassName} key={item}>
							{item}
						</li>
					))}
				</ul>
			</div>
		);
	}

	const toolCall = toolCallsById.get(part.toolCallId);
	return (
		<div
			className={cn(
				boundedPartClassName,
				"rounded-md border bg-background px-3 py-2 text-xs",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				{toolCall ? (
					<ToolStatusIcon status={toolCall.status} />
				) : (
					<Wrench className="size-3.5 shrink-0 text-muted-foreground" />
				)}
				<span className={cn(safeTextClassName, "font-medium")}>
					{part.toolName}
				</span>
				<Badge
					variant="secondary"
					className="ml-auto h-5 shrink-0 rounded-sm px-1.5"
				>
					{toolCall?.status ?? part.status}
				</Badge>
			</div>
			<p className={cn(safeTextClassName, "mt-1 text-muted-foreground")}>
				{part.summary}
			</p>
			{toolCall?.error && (
				<p
					className={cn(
						safeMultilineTextClassName,
						"mt-1 select-text cursor-text text-destructive",
					)}
				>
					{toolCall.error}
				</p>
			)}
		</div>
	);
}

function MessageRow({
	message,
	toolCallsById,
}: {
	message: ControlChatMessage;
	toolCallsById: Map<string, ControlChatToolCall>;
}) {
	const isUser = message.role === "user";
	return (
		<div
			className={cn(
				"flex min-w-0 max-w-full flex-col gap-1",
				isUser ? "items-end" : "items-start",
			)}
		>
			<div
				className={cn(
					"min-w-0 max-w-[88%] space-y-2 overflow-hidden rounded-lg px-3 py-2 text-sm shadow-sm",
					isUser
						? "bg-primary text-primary-foreground"
						: "border bg-card text-card-foreground",
				)}
			>
				{message.content.map((part, index) => (
					<MessagePart
						key={`${message.id}-${part.type}-${index}`}
						part={part}
						toolCallsById={toolCallsById}
					/>
				))}
			</div>
			<span className="px-1 text-[11px] text-muted-foreground">
				{formatTime(message.createdAt)}
			</span>
		</div>
	);
}

export function ControlChatMessageList({
	data,
	isLoading,
	error,
}: ControlChatMessageListProps) {
	const toolCallsById = new Map(data?.toolCalls.map((call) => [call.id, call]));

	return (
		<ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
			<div className="min-w-0 max-w-full space-y-4 p-4">
				{error ? (
					<div
						className={cn(
							safeMultilineTextClassName,
							"select-text cursor-text rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive",
						)}
					>
						{getErrorMessage(error)}
					</div>
				) : null}
				{isLoading && !data ? (
					<div className="text-sm text-muted-foreground">Loading...</div>
				) : null}
				{data && data.messages.length === 0 ? (
					<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						Ask Control Chat to manage Automations or Tools & Skills.
					</div>
				) : null}
				{data?.messages.map((message) => (
					<MessageRow
						key={message.id}
						message={message}
						toolCallsById={toolCallsById}
					/>
				))}
			</div>
		</ScrollArea>
	);
}
