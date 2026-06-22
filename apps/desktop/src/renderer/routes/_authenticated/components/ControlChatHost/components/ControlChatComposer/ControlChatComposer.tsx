import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { Send, Square } from "lucide-react";
import { type FormEvent, useState } from "react";

interface ControlChatComposerProps {
	disabled?: boolean;
	canStop?: boolean;
	onSend: (message: string) => Promise<void>;
	onStop: () => Promise<void>;
}

export function ControlChatComposer({
	disabled,
	canStop,
	onSend,
	onStop,
}: ControlChatComposerProps) {
	const [value, setValue] = useState("");
	const trimmed = value.trim();

	const submitMessage = async () => {
		if (!trimmed || disabled) return;
		const message = trimmed;
		setValue("");
		try {
			await onSend(message);
		} catch {
			setValue(message);
		}
	};
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		void submitMessage();
	};

	return (
		<form className="border-t bg-background p-3" onSubmit={handleSubmit}>
			<div className="flex gap-2">
				<Textarea
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void submitMessage();
						}
					}}
					placeholder="Manage automations, Tools & Skills, hosts..."
					className="min-h-20 resize-none text-sm"
					disabled={disabled}
				/>
				<div className="flex flex-col gap-2">
					<Button
						type="submit"
						size="icon"
						disabled={!trimmed || disabled}
						aria-label="Send"
					>
						<Send className="size-4" />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="outline"
						disabled={!canStop}
						aria-label="Stop"
						onClick={() => {
							void onStop();
						}}
					>
						<Square className="size-4" />
					</Button>
				</div>
			</div>
		</form>
	);
}
