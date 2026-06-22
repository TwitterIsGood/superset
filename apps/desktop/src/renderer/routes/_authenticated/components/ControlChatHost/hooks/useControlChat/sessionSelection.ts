export function shouldAutoSelectControlChatSession(args: {
	activeSessionId: string | null;
	isCreatingNewSession: boolean;
	sessionCount: number;
}) {
	return (
		!args.activeSessionId && !args.isCreatingNewSession && args.sessionCount > 0
	);
}
