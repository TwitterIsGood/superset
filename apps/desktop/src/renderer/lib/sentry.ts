import { env } from "../env.renderer";

let sentryInitialized = false;
let sentryClientPromise: Promise<typeof import("./sentry-client")> | undefined;

function loadSentryClient() {
	sentryClientPromise ??= import("./sentry-client");
	return sentryClientPromise;
}

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		const sentryClient = await loadSentryClient();

		sentryClient.initRendererSentry({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0.1,
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in renderer process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in renderer:", error);
	}
}

export async function captureRendererException(
	error: unknown,
	context?: Parameters<
		typeof import("./sentry-client").captureRendererSentryException
	>[1],
): Promise<void> {
	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		const sentryClient = await loadSentryClient();
		sentryClient.captureRendererSentryException(error, context);
	} catch {
		// Error reporting must not make the error page fail.
	}
}
