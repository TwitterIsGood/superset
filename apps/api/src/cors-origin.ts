const localhostOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function isAllowedCorsOrigin({
	allowedOrigins,
	nodeEnv = process.env.NODE_ENV,
	origin,
}: {
	allowedOrigins: string[];
	nodeEnv?: string;
	origin: string | null;
}): boolean {
	if (!origin) return false;
	if (allowedOrigins.includes(origin)) return true;
	return nodeEnv === "development" && localhostOriginPattern.test(origin);
}
