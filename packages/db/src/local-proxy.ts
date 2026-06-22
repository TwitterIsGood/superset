import { neonConfig } from "@neondatabase/serverless";

const LOOPBACK_HOST = "127.0.0.1";
const LOCAL_DATABASE_HOSTS = new Set([
	"db.localtest.me",
	"localhost",
	"127.0.0.1",
]);

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (_host, port) =>
		`http://${LOOPBACK_HOST}:${port}/sql`;
	neonConfig.wsProxy = (_host, port) => `${LOOPBACK_HOST}:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
