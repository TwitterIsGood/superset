import type { PackResolution, PackStatus } from "main/lib/pack-system/types";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UsePackStatusOptions {
	enabled?: boolean;
}

interface UsePackStatusResult {
	status: PackStatus | null;
	isLoading: boolean;
	isResolving: boolean;
	error: Error | null;
	resolve: () => Promise<PackResolution>;
}

function normalizeError(error: unknown): Error | null {
	if (!error) return null;
	if (error instanceof Error) return error;
	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return new Error(error.message);
	}
	return new Error(String(error));
}

export function usePackStatus(
	packId: string,
	options: UsePackStatusOptions = {},
): UsePackStatusResult {
	const enabled = options.enabled ?? true;
	const [liveStatus, setLiveStatus] = useState<PackStatus | null>(null);

	const statusQuery = electronTrpc.packSystem.getStatus.useQuery(
		{ packId },
		{
			enabled,
			refetchOnWindowFocus: false,
		},
	);
	const resolveMutation = electronTrpc.packSystem.resolve.useMutation({
		onSuccess: (resolution) => {
			setLiveStatus(resolution.status);
		},
	});

	electronTrpc.packSystem.subscribe.useSubscription(
		{ packId },
		{
			enabled,
			onData: (status) => {
				setLiveStatus(status);
			},
			onError: (error) => {
				console.warn("[pack-system] Pack status subscription failed", {
					packId,
					error,
				});
			},
		},
	);

	const resolve = useCallback(async () => {
		const resolution = await resolveMutation.mutateAsync({ packId });
		setLiveStatus(resolution.status);
		return resolution;
	}, [packId, resolveMutation.mutateAsync]);

	return {
		status: liveStatus ?? statusQuery.data ?? null,
		isLoading: statusQuery.isLoading,
		isResolving: resolveMutation.isPending,
		error: normalizeError(statusQuery.error ?? resolveMutation.error),
		resolve,
	};
}
