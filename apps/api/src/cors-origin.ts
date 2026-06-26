const localhostOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function isAllowedCorsOrigin({
	allowLocalhost = process.env.SUPERSET_ALLOW_LOCALHOST_CORS === "1" ||
		process.env.SUPERSET_ONLINE_SERVICE === "1",
	allowedOrigins,
	nodeEnv = process.env.NODE_ENV,
	origin,
}: {
	allowLocalhost?: boolean;
	allowedOrigins: string[];
	nodeEnv?: string;
	origin: string | null;
}): boolean {
	if (!origin) return false;
	if (allowedOrigins.includes(origin)) return true;
	return (
		(nodeEnv === "development" || allowLocalhost) &&
		localhostOriginPattern.test(origin)
	);
}
