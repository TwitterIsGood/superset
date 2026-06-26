import { app } from "electron";
import { env } from "main/env.main";
import { PostHog } from "posthog-node";
import { shouldTrackAnalytics } from "./telemetry-gate";
import { isTelemetryEnabled } from "./telemetry-settings";

export let posthog: PostHog | null = null;
let userId: string | null = null;

function getClient(): PostHog | null {
	if (posthog) return posthog;

	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		return null;
	}

	posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
		host: env.NEXT_PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
	return posthog;
}

export function getPosthogClient(): PostHog | null {
	return getClient();
}

export function getUserId(): string | null {
	return userId;
}

export function setUserId(id: string | null): void {
	userId = id;
}

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!shouldTrackAnalytics(userId, isTelemetryEnabled())) {
		return;
	}

	const client = getClient();
	if (client) {
		client.capture({
			distinctId: userId,
			event,
			properties: {
				...properties,
				app_name: "desktop",
				platform: process.platform,
				desktop_version: app.getVersion(),
			},
		});
	}
}
