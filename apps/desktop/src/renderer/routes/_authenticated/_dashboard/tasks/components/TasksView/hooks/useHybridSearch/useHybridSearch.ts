import { useCallback } from "react";

interface SearchableTask {
	id: string;
	title: string;
	slug: string;
	description: string | null;
	labels: string[] | null;
}

interface SearchResult<T extends SearchableTask> {
	item: T;
	score: number;
	matchType: "exact" | "fuzzy";
}

function normalizeSearchText(value: string | null | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

function includesSubsequence(value: string, query: string): boolean {
	if (!query) return true;
	let queryIndex = 0;
	for (const char of value) {
		if (char === query[queryIndex]) {
			queryIndex += 1;
			if (queryIndex === query.length) return true;
		}
	}
	return false;
}

function textScore(value: string, query: string): number {
	if (!value || !query) return 0;
	if (value === query) return 1;
	if (value.startsWith(query)) return 0.95;
	if (value.includes(query)) return 0.85;

	const tokens = query.split(/\s+/).filter(Boolean);
	if (tokens.length > 1 && tokens.every((token) => value.includes(token))) {
		return 0.75;
	}

	return includesSubsequence(value, query) ? 0.5 : 0;
}

function scoreExactFields(task: SearchableTask, query: string): number {
	const slugScore = textScore(normalizeSearchText(task.slug), query);
	const labelScore = Math.max(
		0,
		...(task.labels ?? []).map((label) =>
			textScore(normalizeSearchText(label), query),
		),
	);
	return Math.max(slugScore, labelScore);
}

function scoreFuzzyFields(task: SearchableTask, query: string): number {
	const titleScore = textScore(normalizeSearchText(task.title), query);
	const descriptionScore = textScore(
		normalizeSearchText(task.description),
		query,
	);
	return Math.max(titleScore, descriptionScore * 0.8);
}

export function useHybridSearch<T extends SearchableTask>(tasks: T[]) {
	const search = useCallback(
		(query: string): SearchResult<T>[] => {
			const normalizedQuery = normalizeSearchText(query);
			if (!normalizedQuery) {
				return tasks.map((item) => ({
					item,
					score: 1,
					matchType: "exact" as const,
				}));
			}

			const results: SearchResult<T>[] = [];
			for (const item of tasks) {
				const exactScore = scoreExactFields(item, normalizedQuery);
				if (exactScore > 0) {
					results.push({
						item,
						score: exactScore,
						matchType: "exact",
					});
					continue;
				}

				const fuzzyScore = scoreFuzzyFields(item, normalizedQuery);
				if (fuzzyScore > 0) {
					results.push({
						item,
						score: fuzzyScore,
						matchType: "fuzzy",
					});
				}
			}

			return results.sort((a, b) => b.score - a.score);
		},
		[tasks],
	);

	return { search };
}
