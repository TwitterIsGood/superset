import { lazy, Suspense, useEffect, useState } from "react";
import {
	clearPendingTeardownLogsRequest,
	getPendingTeardownLogsRequest,
	subscribeToTeardownLogs,
	type TeardownLogsRequest,
} from "./teardownLogsStore";

const LazyTeardownLogsDialogContent = lazy(() =>
	import("./TeardownLogsDialogContent").then((module) => ({
		default: module.TeardownLogsDialogContent,
	})),
);

export function TeardownLogsDialog() {
	const [request, setRequest] = useState<TeardownLogsRequest | null>(
		getPendingTeardownLogsRequest(),
	);

	useEffect(() => {
		return subscribeToTeardownLogs(setRequest);
	}, []);

	if (!request) return null;

	return (
		<Suspense fallback={null}>
			<LazyTeardownLogsDialogContent
				logs={request.logs}
				onDeleteAnyway={request.options?.onDeleteAnyway}
				onClose={() => {
					clearPendingTeardownLogsRequest();
					setRequest(null);
				}}
			/>
		</Suspense>
	);
}
