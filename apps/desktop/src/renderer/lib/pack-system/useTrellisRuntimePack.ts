import { toast } from "@superset/ui/sonner";
import { TRELLIS_RUNTIME_PACK_ID } from "lib/pack-system/pack-ids";
import { useCallback } from "react";
import { usePackStatus } from "./usePackStatus";

export interface TrellisSetupPayload {
	initialize: true;
	runtimePackPath?: string;
}

interface PrepareTrellisSetupArgs {
	initialize: boolean;
	useLocalPack: boolean;
}

export function useTrellisRuntimePack() {
	const pack = usePackStatus(TRELLIS_RUNTIME_PACK_ID);
	const canUseLocalRuntimeFallback = process.env.NODE_ENV === "development";

	const prepareTrellisSetup = useCallback(
		async (
			args: PrepareTrellisSetupArgs,
		): Promise<TrellisSetupPayload | undefined> => {
			if (!args.initialize) return undefined;
			if (!args.useLocalPack) return { initialize: true };

			const current = pack.status;
			if (current?.status === "not_configured") {
				if (canUseLocalRuntimeFallback) return { initialize: true };
				toast.warning("Guided workflow runtime is unavailable", {
					description:
						"The workspace will be created without guided workflow setup.",
				});
				return undefined;
			}
			if (current?.status === "installed" && current.installedPath) {
				return { initialize: true, runtimePackPath: current.installedPath };
			}

			const resolution = await pack.resolve();
			if (resolution.ok) {
				return { initialize: true, runtimePackPath: resolution.path };
			}
			if (resolution.status.status === "not_configured") {
				if (canUseLocalRuntimeFallback) return { initialize: true };
				toast.warning("Guided workflow runtime is unavailable", {
					description:
						"The workspace will be created without guided workflow setup.",
				});
				return undefined;
			}

			toast.warning("Could not prepare guided workflow runtime", {
				description: canUseLocalRuntimeFallback
					? "Using the local development runtime for this workspace."
					: "The workspace will be created without guided workflow setup.",
			});
			if (canUseLocalRuntimeFallback) return { initialize: true };
			return undefined;
		},
		[canUseLocalRuntimeFallback, pack.resolve, pack.status],
	);

	return {
		...pack,
		prepareTrellisSetup,
	};
}
