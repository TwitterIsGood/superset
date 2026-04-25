import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ModelProviderProtocol } from "shared/model-proxy";
import type { SettingItemId } from "../../../utils/settings-search";
import {
	addModelId,
	formatProxyUrlForDisplay,
	normalizeModelIds,
	removeModelId,
} from "./utils";

interface ModelsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type ProviderForm = {
	id?: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	proxyUrl: string;
	secret: string;
	enabled: boolean;
	models: string[];
};

const EMPTY_FORM: ProviderForm = {
	name: "",
	protocol: "anthropic",
	baseUrl: "",
	proxyUrl: "",
	secret: "",
	enabled: true,
	models: [],
};

export function ModelsSettings(_props: ModelsSettingsProps) {
	const trpcUtils = electronTrpc.useUtils();
	const { data: providers = [] } = electronTrpc.modelProviders.list.useQuery();
	const { data: proxyStatus } = electronTrpc.modelProxy.status.useQuery(undefined, {
		refetchInterval: 5000,
	});
	const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
	const [newModelId, setNewModelId] = useState("");
	const saveMutation = electronTrpc.modelProviders.create.useMutation();
	const updateMutation = electronTrpc.modelProviders.update.useMutation();
	const deleteMutation = electronTrpc.modelProviders.delete.useMutation();
	const testMutation = electronTrpc.modelProviders.test.useMutation();
	const fetchModelsMutation = electronTrpc.modelProviders.fetchModels.useMutation();
	const restartProxyMutation = electronTrpc.modelProxy.restart.useMutation();
	const isEditingProvider = Boolean(form.id);
	const editingProvider = form.id ? providers.find((provider) => provider.id === form.id) : undefined;
	const hasRequiredProviderFields = form.name.trim().length > 0 && form.baseUrl.trim().length > 0;
	const isProviderMutationPending = saveMutation.isPending || updateMutation.isPending;
	const formModelIds = normalizeModelIds(form.models);
	const savedModelIds = editingProvider
		? normalizeModelIds(editingProvider.models.map((model) => model.id))
		: [];
	const hasModelDraftChanges =
		formModelIds.length !== savedModelIds.length || formModelIds.some((modelId, index) => modelId !== savedModelIds[index]);
	const hasProviderDraftChanges = Boolean(
		editingProvider &&
			(form.name !== editingProvider.name ||
				form.protocol !== editingProvider.protocol ||
				form.baseUrl !== editingProvider.baseUrl ||
				form.proxyUrl !== (editingProvider.proxyUrl ?? "") ||
				form.enabled !== editingProvider.enabled ||
				hasModelDraftChanges ||
				form.secret.trim().length > 0),
	);
	const canSubmitProvider =
		hasRequiredProviderFields &&
		!isProviderMutationPending &&
		(!isEditingProvider || (Boolean(editingProvider) && hasProviderDraftChanges));

	useEffect(() => {
		if (!form.id) return;
		const provider = providers.find((item) => item.id === form.id);
		if (!provider) setForm(EMPTY_FORM);
	}, [form.id, providers]);

	const refresh = async () => {
		await Promise.all([
			trpcUtils.modelProviders.list.invalidate(),
			trpcUtils.modelProviders.listAggregatedModels.invalidate(),
			trpcUtils.modelProxy.status.invalidate(),
		]);
	};

	const clearForm = () => {
		setForm(EMPTY_FORM);
		setNewModelId("");
	};

	const editProvider = (id: string) => {
		const provider = providers.find((item) => item.id === id);
		if (!provider) return;
		setForm({
			id: provider.id,
			name: provider.name,
			protocol: provider.protocol,
			baseUrl: provider.baseUrl,
			proxyUrl: provider.proxyUrl ?? "",
			secret: "",
			enabled: provider.enabled,
			models: provider.models.map((model) => model.id),
		});
		setNewModelId("");
	};

	const addModelToForm = () => {
		setForm((current) => ({
			...current,
			models: addModelId(current.models, newModelId),
		}));
		setNewModelId("");
	};

	const saveProvider = async () => {
		try {
			const input = {
				id: form.id,
				name: form.name,
				protocol: form.protocol,
				baseUrl: form.baseUrl,
				proxyUrl: form.proxyUrl || undefined,
				enabled: form.enabled,
				secret: form.secret || undefined,
				models: normalizeModelIds(form.models),
			};
			if (form.id) await updateMutation.mutateAsync({ ...input, id: form.id });
			else await saveMutation.mutateAsync(input);
			clearForm();
			await refresh();
			toast.success("Provider saved");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save provider");
		}
	};

	return (
		<div className="w-full max-w-5xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Models</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage local model providers and the Anthropic-compatible workspace proxy.
				</p>
			</div>

			<div className="space-y-6">
				<section className="rounded-xl border bg-card p-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="flex items-center gap-2">
								<h3 className="font-semibold">Local proxy</h3>
								<Badge variant={proxyStatus?.running ? "default" : "secondary"}>
									{proxyStatus?.running ? "Running" : "Stopped"}
								</Badge>
							</div>
							<p className="mt-1 font-mono text-xs text-muted-foreground">
								{proxyStatus?.baseUrl ?? "Proxy URL unavailable"}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{proxyStatus?.enabledProviderCount ?? 0} enabled providers, {proxyStatus?.aggregatedModelCount ?? 0} models
							</p>
						</div>
						<Button
							onClick={async () => {
								await restartProxyMutation.mutateAsync();
								await refresh();
								toast.success("Model proxy restarted");
							}}
							disabled={restartProxyMutation.isPending}
						>
							Restart proxy
						</Button>
					</div>
					{proxyStatus?.lastError ? (
						<p className="mt-2 text-xs text-destructive">{proxyStatus.lastError}</p>
					) : null}
				</section>

				<section className="grid gap-4 lg:grid-cols-[1fr_360px]">
					<div className="space-y-3">
						{providers.length === 0 ? (
							<div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
								No providers yet. Add only the providers you use.
							</div>
						) : (
							providers.map((provider) => (
								<div key={provider.id} className="rounded-xl border bg-card p-4">
									<div className="flex items-start justify-between gap-3">
										<div>
											<div className="flex items-center gap-2">
												<h3 className="font-semibold">{provider.name}</h3>
												<Badge variant="outline">{provider.protocol}</Badge>
												<Badge variant={provider.enabled ? "default" : "secondary"}>
													{provider.enabled ? "Enabled" : "Disabled"}
												</Badge>
											</div>
											<p className="mt-1 font-mono text-xs text-muted-foreground">{provider.baseUrl}</p>
										{provider.proxyUrl ? (
											<p className="mt-1 font-mono text-xs text-muted-foreground">
												Proxy: {formatProxyUrlForDisplay(provider.proxyUrl)}
											</p>
										) : null}
										<p className="mt-1 text-xs text-muted-foreground">
												{provider.hasSecret ? "API key saved" : "No API key saved"} · {provider.models.length} models
											</p>
										</div>
										<div className="flex gap-2">
											<Button variant="outline" size="sm" onClick={() => editProvider(provider.id)}>Edit</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													try {
														const result = await testMutation.mutateAsync({ id: provider.id });
														toast.success(result.message);
													} catch (error) {
														toast.error(error instanceof Error ? error.message : "Provider test failed");
													}
												}}
											>
												Test
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													try {
														await fetchModelsMutation.mutateAsync({ id: provider.id });
														await refresh();
														toast.success("Models fetched");
													} catch (error) {
														toast.error(error instanceof Error ? error.message : "Fetch failed");
													}
												}}
											>
												Fetch models
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={async () => {
													await deleteMutation.mutateAsync({ id: provider.id });
													await refresh();
												}}
											>
												Delete
											</Button>
										</div>
									</div>
								</div>
							))
						)}
					</div>

					<form
						className="space-y-3 rounded-xl border bg-card p-4"
						onSubmit={(event) => {
							event.preventDefault();
							void saveProvider();
						}}
					>
						<div className="flex items-center justify-between gap-2">
							<h3 className="font-semibold">{isEditingProvider ? "Edit provider" : "Add provider"}</h3>
							{isEditingProvider ? (
								<Button type="button" variant="outline" size="sm" onClick={clearForm}>Cancel edit</Button>
							) : null}
						</div>
						<Input placeholder="Provider name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
						<select
							className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							value={form.protocol}
							onChange={(event) => setForm({ ...form, protocol: event.target.value as ModelProviderProtocol })}
						>
							<option value="anthropic">Anthropic</option>
							<option value="openai">OpenAI-compatible</option>
						</select>
						<Input placeholder="Base URL, e.g. https://api.example.com" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
						<div className="space-y-1">
							<Input
								placeholder="Proxy URL (optional), e.g. http://127.0.0.1:7890"
								value={form.proxyUrl}
								onChange={(event) => setForm({ ...form, proxyUrl: event.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								One HTTP proxy URL is used for this provider's upstream requests, including HTTPS providers.
							</p>
						</div>
						<Input type="password" placeholder={form.id ? "API key saved; enter a new value to replace" : "API key"} value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} />
						<div className="flex items-center justify-between gap-3 rounded-md border p-3">
							<div className="space-y-0.5">
								<label htmlFor="provider-enabled-switch" className="text-sm font-medium">Enabled</label>
								<p className="text-xs text-muted-foreground">Use this provider in the local model proxy.</p>
							</div>
							<Switch
								id="provider-enabled-switch"
								checked={form.enabled}
								onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
							/>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Models</p>
							{form.models.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{form.models.map((model) => (
										<Badge key={model} variant="secondary" className="gap-1 font-mono">
											<span>{model}</span>
											<button
												type="button"
												className="rounded-full opacity-70 hover:opacity-100"
												onClick={() => setForm({ ...form, models: removeModelId(form.models, model) })}
												aria-label={`Remove ${model}`}
											>
												<LuX className="size-3" />
											</button>
										</Badge>
									))}
								</div>
							) : (
								<p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
									No model IDs added yet. Add model IDs manually or fetch them from the provider.
								</p>
							)}
							<div className="flex gap-2">
								<Input
									placeholder="Add model ID..."
									value={newModelId}
									onChange={(event) => setNewModelId(event.target.value)}
									onKeyDown={(event) => {
										if (event.key !== "Enter") return;
										event.preventDefault();
										addModelToForm();
									}}
								/>
								<Button type="button" variant="outline" onClick={addModelToForm}>Add</Button>
							</div>
						</div>
						<div className="flex gap-2">
							<Button type="submit" disabled={!canSubmitProvider}>
								{isEditingProvider ? "Update provider" : "Add provider"}
							</Button>
							{isEditingProvider ? null : (
								<Button type="button" variant="outline" onClick={clearForm}>Clear draft</Button>
							)}
						</div>
						{isEditingProvider && editingProvider && !hasProviderDraftChanges ? (
							<p className="text-xs text-muted-foreground">Make a change to update this provider.</p>
						) : null}
					</form>
				</section>
			</div>
		</div>
	);
}
