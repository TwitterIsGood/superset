import { toast } from "renderer/lib/toast";
import { showTeardownLogs } from "./teardownLogsStore";

function showTeardownFailedToast({
	toastId,
	output,
	onForceDelete,
}: {
	toastId: string | number;
	output: string;
	onForceDelete: () => void;
}) {
	toast.error("Teardown failed", {
		id: toastId,
		action: {
			label: "Delete Anyway",
			onClick: onForceDelete,
		},
		cancel: {
			label: "View Logs",
			onClick: () =>
				showTeardownLogs(output, { onDeleteAnyway: onForceDelete }),
		},
	});
}

async function forceDeleteWithToast({
	name,
	deleteFn,
}: {
	name: string;
	deleteFn: () => Promise<{ success: boolean; error?: string }>;
}) {
	const toastId = toast.loading(`Deleting "${name}" (skipping teardown)...`);

	try {
		const result = await deleteFn();
		if (result.success) {
			toast.success(`Deleted "${name}"`, { id: toastId });
		} else {
			toast.error(result.error ?? "Failed to delete", { id: toastId });
		}
	} catch (error) {
		toast.error(error instanceof Error ? error.message : "Failed to delete", {
			id: toastId,
		});
	}
}

export async function deleteWithToast({
	name,
	deleteFn,
	forceDeleteFn,
}: {
	name: string;
	deleteFn: () => Promise<{
		success: boolean;
		error?: string;
		output?: string;
		terminalWarning?: string;
	}>;
	forceDeleteFn: () => Promise<{ success: boolean; error?: string }>;
}) {
	const toastId = toast.loading(`Deleting "${name}"...`);

	try {
		const result = await deleteFn();

		if (!result.success) {
			const { output } = result;
			if (output) {
				showTeardownFailedToast({
					toastId,
					output,
					onForceDelete: () =>
						forceDeleteWithToast({ name, deleteFn: forceDeleteFn }),
				});
			} else {
				toast.error(result.error ?? "Failed to delete", { id: toastId });
			}
			return;
		}

		toast.success(`Deleted "${name}"`, { id: toastId });

		if (result.terminalWarning) {
			setTimeout(() => {
				toast.warning("Terminal warning", {
					description: result.terminalWarning,
				});
			}, 100);
		}
	} catch (error) {
		toast.error(error instanceof Error ? error.message : "Failed to delete", {
			id: toastId,
		});
	}
}
