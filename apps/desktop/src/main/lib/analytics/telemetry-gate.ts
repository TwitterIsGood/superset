export function shouldTrackAnalytics(
	userId: string | null,
	telemetryEnabled: boolean,
): userId is string {
	return Boolean(userId && telemetryEnabled);
}
