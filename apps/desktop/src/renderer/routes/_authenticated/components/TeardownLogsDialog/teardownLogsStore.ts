export type TeardownLogsOptions = { onDeleteAnyway?: () => void };
export type TeardownLogsRequest = {
	logs: string;
	options?: TeardownLogsOptions;
};

const teardownLogsListeners = new Set<(request: TeardownLogsRequest) => void>();
let pendingTeardownLogsRequest: TeardownLogsRequest | null = null;

export function showTeardownLogs(logs: string, options?: TeardownLogsOptions) {
	const request = { logs, options };
	pendingTeardownLogsRequest = request;
	for (const listener of teardownLogsListeners) {
		listener(request);
	}
}

export function getPendingTeardownLogsRequest() {
	return pendingTeardownLogsRequest;
}

export function clearPendingTeardownLogsRequest() {
	pendingTeardownLogsRequest = null;
}

export function subscribeToTeardownLogs(
	listener: (request: TeardownLogsRequest) => void,
) {
	teardownLogsListeners.add(listener);
	if (pendingTeardownLogsRequest) {
		listener(pendingTeardownLogsRequest);
	}
	return () => {
		teardownLogsListeners.delete(listener);
	};
}
