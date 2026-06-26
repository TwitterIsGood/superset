import { toast } from "@superset/ui/sonner";
import {
	SUPERSET_CLI_RUNTIME_PACK_ID,
	TRELLIS_RUNTIME_PACK_ID,
} from "lib/pack-system/pack-ids";
import { useCallback } from "react";
import { usePackStatus } from "./usePackStatus";

export interface TrellisSetupPayload {
	initialize: true;
	runtimePackPath?: string;
	supersetCliRuntimePackPath?: string;
}

interface PrepareTrellisSetupArgs {
	initialize: boolean;
	useLocalPack: boolean;
}

export function useTrellisRuntimePack() {
	const trellisPack = usePackStatus(TRELLIS_RUNTIME_PACK_ID);
	const cliPack = usePackStatus(SUPERSET_CLI_RUNTIME_PACK_ID);
	const canUseLocalRuntimeFallback = process.env.NODE_ENV === "development";

	const prepareTrellisSetup = useCallback(
		async (
			args: PrepareTrellisSetupArgs,
		): Promise<TrellisSetupPayload | undefined> => {
			if (!args.initialize) return undefined;
			if (!args.useLocalPack) return { initialize: true };

			const currentTrellis = trellisPack.status;
			if (currentTrellis?.status === "not_configured") {
				if (canUseLocalRuntimeFallback) return { initialize: true };
				toast.warning("Guided workflow runtime is unavailable", {
					description:
						"The workspace will be created without guided workflow setup.",
				});
				return undefined;
			}
			const payload: TrellisSetupPayload = { initialize: true };
			if (
				currentTrellis?.status === "installed" &&
				currentTrellis.installedPath
			) {
				payload.runtimePackPath = currentTrellis.installedPath;
			} else {
				const resolution = await trellisPack.resolve();
				if (resolution.ok) {
					payload.runtimePackPath = resolution.path;
				} else if (resolution.status.status === "not_configured") {
					if (canUseLocalRuntimeFallback) return { initialize: true };
					toast.warning("Guided workflow runtime is unavailable", {
						description:
							"The workspace will be created without guided workflow setup.",
					});
					return undefined;
				} else {
					toast.warning("Could not prepare guided workflow runtime", {
						description: canUseLocalRuntimeFallback
							? "Using the local development runtime for this workspace."
							: "The workspace will be created without guided workflow setup.",
					});
					if (canUseLocalRuntimeFallback) return { initialize: true };
					return undefined;
				}
			}

			const currentCli = cliPack.status;
			if (currentCli?.status === "installed" && currentCli.installedPath) {
				payload.supersetCliRuntimePackPath = currentCli.installedPath;
				return payload;
			}
			if (currentCli?.status === "not_configured") return payload;

			const cliResolution = await cliPack.resolve();
			if (cliResolution.ok) {
				payload.supersetCliRuntimePackPath = cliResolution.path;
			} else if (cliResolution.status.status !== "not_configured") {
				toast.warning("Could not prepare task sync runtime", {
					description:
						"The workspace will still be created; task status sync may use the local fallback.",
				});
			}
			return payload;
		},
		[
			canUseLocalRuntimeFallback,
			cliPack.resolve,
			cliPack.status,
			trellisPack.resolve,
			trellisPack.status,
		],
	);

	return {
		...trellisPack,
		isResolving: trellisPack.isResolving || cliPack.isResolving,
		prepareTrellisSetup,
	};
}
