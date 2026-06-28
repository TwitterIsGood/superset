import {
	type BrowserOptions,
	captureException,
	init,
} from "@sentry/electron/renderer";

export function initRendererSentry(options: BrowserOptions): void {
	init(options);
}

export function captureRendererSentryException(
	error: unknown,
	context?: Parameters<typeof captureException>[1],
): void {
	captureException(error, context);
}
