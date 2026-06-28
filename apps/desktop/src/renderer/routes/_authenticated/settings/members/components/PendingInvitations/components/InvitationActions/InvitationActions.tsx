import type { SelectInvitation } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { EllipsisVertical, X } from "lucide-react";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { toast } from "renderer/lib/toast";

interface InvitationActionsProps {
	invitation: SelectInvitation;
}

export function InvitationActions({ invitation }: InvitationActionsProps) {
	const [isCanceling, setIsCanceling] = useState(false);

	const handleCancel = async () => {
		setIsCanceling(true);
		try {
			await authClient.organization.cancelInvitation({
				invitationId: invitation.id,
			});
			toast.success("Invitation canceled");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to cancel invitation",
			);
		} finally {
			setIsCanceling(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<EllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onSelect={handleCancel}
					disabled={isCanceling}
					className="text-destructive gap-2"
				>
					<X className="h-4 w-4" />
					Cancel
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
