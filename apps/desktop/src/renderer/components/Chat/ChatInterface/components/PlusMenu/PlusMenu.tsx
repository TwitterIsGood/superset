import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Paperclip } from "lucide-react";
import { PILL_BUTTON_CLASS } from "../../styles";

export function PlusMenu() {
	const attachments = usePromptInputAttachments();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<PromptInputButton
					aria-label="Add attachment"
					className={`${PILL_BUTTON_CLASS} w-[23px]`}
					onClick={() => attachments.openFileDialog()}
				>
					<Paperclip className="size-3.5" />
				</PromptInputButton>
			</TooltipTrigger>
			<TooltipContent side="top">Add attachment</TooltipContent>
		</Tooltip>
	);
}
