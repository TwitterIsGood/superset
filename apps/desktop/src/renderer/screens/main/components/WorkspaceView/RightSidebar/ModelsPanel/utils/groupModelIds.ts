export interface ModelGroup {
	prefix: string;
	models: string[];
}

function getModelPrefix(modelId: string): string {
	const trimmed = modelId.trim();
	const [prefix] = trimmed.split("-");
	return prefix || trimmed;
}

export function groupModelIds(modelIds: string[]): ModelGroup[] {
	const dedupedModels = Array.from(
		new Set(modelIds.map((modelId) => modelId.trim()).filter(Boolean)),
	);
	const groups = new Map<string, string[]>();

	for (const modelId of dedupedModels) {
		const prefix = getModelPrefix(modelId);
		groups.set(prefix, [...(groups.get(prefix) ?? []), modelId]);
	}

	return Array.from(groups.entries())
		.map(([prefix, models]) => ({
			prefix,
			models: models.sort((a, b) =>
			b.localeCompare(a, undefined, { numeric: true }),
			),
		}))
		.sort((a, b) => a.prefix.localeCompare(b.prefix));
}
