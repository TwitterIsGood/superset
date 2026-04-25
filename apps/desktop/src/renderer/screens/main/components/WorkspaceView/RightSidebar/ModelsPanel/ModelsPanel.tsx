import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GroupedModelPicker } from "./components/GroupedModelPicker";

export function ModelsPanel({ workspaceId }: { workspaceId?: string }) {
	const navigate = useNavigate();
	const trpcUtils = electronTrpc.useUtils();
	const { data: proxyStatus } = electronTrpc.modelProxy.status.useQuery();
	const { data: models = [] } = electronTrpc.modelProviders.listAggregatedModels.useQuery();
	const { data: settings } = electronTrpc.workspaceModelSettings.read.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const saveMutation = electronTrpc.workspaceModelSettings.save.useMutation();
	const defaultModel = models[0]?.id ?? "";
	const [haikuModel, setHaikuModel] = useState("");
	const [sonnetModel, setSonnetModel] = useState("");
	const [opusModel, setOpusModel] = useState("");

	useEffect(() => {
		setHaikuModel(settings?.haikuModel || defaultModel);
		setSonnetModel(settings?.sonnetModel || defaultModel);
		setOpusModel(settings?.opusModel || defaultModel);
	}, [settings?.haikuModel, settings?.sonnetModel, settings?.opusModel, defaultModel]);

	const modelOptions = useMemo(() => models.map((model) => model.id), [models]);
	const savedHaikuModel = settings?.haikuModel || defaultModel;
	const savedSonnetModel = settings?.sonnetModel || defaultModel;
	const savedOpusModel = settings?.opusModel || defaultModel;
	const hasModelSettingsChanges =
		haikuModel !== savedHaikuModel ||
		sonnetModel !== savedSonnetModel ||
		opusModel !== savedOpusModel;
	const canSave =
		!!workspaceId &&
		!!haikuModel &&
		!!sonnetModel &&
		!!opusModel &&
		hasModelSettingsChanges;
	const proxyReady = proxyStatus?.running && proxyStatus.tokenConfigured && proxyStatus.baseUrl;

	const openModelsSettings = () => {
		void navigate({ to: "/settings/models" });
	};

	return (
		<div className="flex-1 overflow-auto p-3">
			<div className="space-y-4">
				<div>
					<h3 className="text-sm font-semibold">Settings</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						Configure this workspace's Claude Code model mapping.
					</p>
				</div>

				{modelOptions.length === 0 ? (
					<div className="space-y-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
						<div>
							<p className="font-medium text-foreground">No model providers configured</p>
							<p className="mt-1">
								Add a provider in Settings &gt; Models, then fetch or manually add model IDs.
							</p>
						</div>
						<Button type="button" size="sm" onClick={openModelsSettings}>
							Open Settings &gt; Models
						</Button>
					</div>
				) : (
					<div className="space-y-4 rounded-lg border p-3">
						<div>
							<p className="text-sm font-semibold">Model Configuration</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Choose the models Claude Code should use for this workspace.
							</p>
						</div>
						{!proxyReady ? (
							<div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
								<p className="font-medium">Local model service is not initialized.</p>
								<p>Open Settings &gt; Models to check providers and restart the service.</p>
								<Button type="button" size="sm" variant="outline" onClick={openModelsSettings}>
									Open Settings &gt; Models
								</Button>
							</div>
						) : null}
						<div className="space-y-3">
							<GroupedModelPicker
								label="Haiku"
								value={haikuModel}
								models={modelOptions}
								onChange={setHaikuModel}
							/>
							<GroupedModelPicker
								label="Sonnet"
								value={sonnetModel}
								models={modelOptions}
								onChange={setSonnetModel}
							/>
							<GroupedModelPicker
								label="Opus"
								value={opusModel}
								models={modelOptions}
								onChange={setOpusModel}
							/>
						</div>
						<Button
							className="w-full"
							disabled={!canSave || saveMutation.isPending}
							onClick={async () => {
								if (!workspaceId) return;
								try {
									await saveMutation.mutateAsync({
										workspaceId,
										haikuModel,
										sonnetModel,
										opusModel,
									});
									await trpcUtils.workspaceModelSettings.read.invalidate({ workspaceId });
									toast.success("Model settings saved");
								} catch (error) {
									toast.error(error instanceof Error ? error.message : "Failed to save workspace models");
								}
							}}
						>
							Save settings
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
