import type { ModelProviderModel, ModelProviderSummary } from "shared/model-proxy";

type ProviderWithModels = Pick<ModelProviderSummary, "id" | "enabled" | "models">;

export function aggregateModels(
	providers: ProviderWithModels[],
): ModelProviderModel[] {
	const byId = new Map<string, ModelProviderModel>();
	for (const provider of providers) {
		if (!provider.enabled) continue;
		for (const model of provider.models) {
			if (!byId.has(model.id)) {
				byId.set(model.id, { ...model, providerId: provider.id });
			}
		}
	}
	return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export class ModelRoundRobinRouter {
	private counters = new Map<string, number>();

	routeForModel(
		providers: ProviderWithModels[],
		modelId: string,
	): string | null {
		const candidates = providers
			.filter(
				(provider) =>
					provider.enabled && provider.models.some((model) => model.id === modelId),
			)
			.map((provider) => provider.id);
		if (candidates.length === 0) return null;
		const current = this.counters.get(modelId) ?? 0;
		const providerId = candidates[current % candidates.length];
		this.counters.set(modelId, current + 1);
		return providerId;
	}
}
