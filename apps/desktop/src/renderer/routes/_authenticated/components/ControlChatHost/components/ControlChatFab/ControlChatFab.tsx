import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Bot, MessageCircle } from "lucide-react";

interface ControlChatFabProps {
	isOpen: boolean;
	onClick: () => void;
}

export function ControlChatFab({ isOpen, onClick }: ControlChatFabProps) {
	return (
		<Button
			type="button"
			size="icon"
			className={cn(
				"fixed right-5 bottom-5 z-50 size-12 rounded-full shadow-lg",
				"border border-border/70 bg-background text-foreground hover:bg-muted",
				isOpen && "bg-muted",
			)}
			aria-label={isOpen ? "Hide Control Chat" : "Open Control Chat"}
			onClick={onClick}
		>
			{isOpen ? (
				<MessageCircle className="size-5" />
			) : (
				<Bot className="size-5" />
			)}
		</Button>
	);
}
