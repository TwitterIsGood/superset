import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "");
}

interface TeardownLogsDialogContentProps {
	logs: string;
	onClose: () => void;
	onDeleteAnyway?: (() => void) | null;
}

export function TeardownLogsDialogContent({
	logs,
	onClose,
	onDeleteAnyway,
}: TeardownLogsDialogContentProps) {
	const strippedLogs = stripAnsi(logs);

	const handleDeleteAnyway = () => {
		onClose();
		onDeleteAnyway?.();
	};

	return (
		<Dialog
			modal={true}
			open={true}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className="flex !max-w-[60vw] flex-col gap-0 p-0">
				<DialogHeader className="px-4 pt-4 pb-2">
					<DialogTitle className="font-medium">Teardown Logs</DialogTitle>
				</DialogHeader>
				<div className="px-4 pb-4">
					<CodeBlock
						code={strippedLogs}
						language="log"
						className="max-h-[60vh] overflow-y-auto text-xs"
					>
						<CodeBlockCopyButton />
					</CodeBlock>
				</div>
				{onDeleteAnyway && (
					<DialogFooter className="px-4 pb-4 pt-0">
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleDeleteAnyway}
						>
							Delete Anyway
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
