import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import {
	ChevronsDownUp,
	ChevronsUpDown,
	Minus,
	Plus,
	ShieldOff,
} from "lucide-react";
import { useRef } from "react";
import { useControlChatStore } from "renderer/stores/control-chat";
import { useControlChat } from "../../hooks/useControlChat";
import { ControlChatComposer } from "../ControlChatComposer";
import { ControlChatMessageList } from "../ControlChatMessageList";

export function ControlChatWindow() {
	const panelRef = useRef<HTMLDivElement | null>(null);
	const close = useControlChatStore((state) => state.close);
	const isExpanded = useControlChatStore((state) => state.isExpanded);
	const toggleExpanded = useControlChatStore((state) => state.toggleExpanded);
	const width = useControlChatStore((state) => state.width);
	const height = useControlChatStore((state) => state.height);
	const setSize = useControlChatStore((state) => state.setSize);
	const {
		activeSessionId,
		setActiveSessionId,
		startNewSession,
		sessions,
		session,
		sessionQuery,
		sendMessage,
		sendStatus,
		sendError,
		stop,
		stopStatus,
	} = useControlChat();
	const activeRunId = session?.session.activeRunId ?? null;
	const isBusy =
		sendStatus === "pending" ||
		stopStatus === "pending" ||
		Boolean(activeRunId);

	return (
		<div
			ref={panelRef}
			className={cn(
				"fixed right-5 bottom-20 z-50 flex overflow-hidden rounded-lg border bg-background shadow-2xl",
				"max-h-[calc(100vh-7rem)] max-w-[calc(100vw-2.5rem)]",
			)}
			style={{ width, height }}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b px-3">
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<h2 className="truncate font-medium text-sm">Control Chat</h2>
							<Badge
								variant="secondary"
								className="h-5 shrink-0 gap-1 rounded-sm px-1.5 text-[11px]"
							>
								<ShieldOff className="size-3" />
								Bypass
							</Badge>
						</div>
					</div>
					<select
						className="h-7 min-w-0 max-w-36 shrink rounded-md border bg-background px-2 text-xs"
						value={activeSessionId ?? ""}
						onChange={(event) => {
							if (event.target.value) {
								setActiveSessionId(event.target.value);
							} else {
								startNewSession();
							}
						}}
						aria-label="Control Chat session"
					>
						<option value="">New chat</option>
						{sessions.map((session) => (
							<option key={session.id} value={session.id}>
								{session.title}
							</option>
						))}
					</select>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						aria-label="New Control Chat"
						onClick={startNewSession}
					>
						<Plus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						aria-label={
							isExpanded ? "Compact Control Chat" : "Expand Control Chat"
						}
						onClick={toggleExpanded}
					>
						{isExpanded ? (
							<ChevronsDownUp className="size-4" />
						) : (
							<ChevronsUpDown className="size-4" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						aria-label="Minimize Control Chat"
						onClick={close}
					>
						<Minus className="size-4" />
					</Button>
				</div>
				<ControlChatMessageList
					data={session}
					isLoading={sessionQuery.isLoading}
					error={sessionQuery.error ?? sendError}
				/>
				<ControlChatComposer
					disabled={sendStatus === "pending"}
					canStop={Boolean(activeRunId)}
					onSend={async (message) => {
						await sendMessage(message);
					}}
					onStop={async () => {
						await stop();
					}}
				/>
			</div>
			<div
				className={cn(
					"absolute right-0 bottom-0 size-4 cursor-nwse-resize",
					isBusy && "pointer-events-none opacity-50",
				)}
				aria-hidden
				onPointerDown={(event) => {
					const panel = panelRef.current;
					if (!panel) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					const startX = event.clientX;
					const startY = event.clientY;
					const startWidth = panel.offsetWidth;
					const startHeight = panel.offsetHeight;
					const handlePointerMove = (moveEvent: PointerEvent) => {
						setSize({
							width: startWidth + moveEvent.clientX - startX,
							height: startHeight + moveEvent.clientY - startY,
						});
					};
					const handlePointerUp = () => {
						window.removeEventListener("pointermove", handlePointerMove);
						window.removeEventListener("pointerup", handlePointerUp);
					};
					window.addEventListener("pointermove", handlePointerMove);
					window.addEventListener("pointerup", handlePointerUp);
				}}
			/>
		</div>
	);
}
