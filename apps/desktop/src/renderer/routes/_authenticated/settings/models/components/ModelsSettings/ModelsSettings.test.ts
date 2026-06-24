import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent component source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent component source
import { join } from "node:path";

describe("ModelsSettings provider cache invalidation", () => {
	const source = readFileSync(
		join(import.meta.dir, "ModelsSettings.tsx"),
		"utf8",
	);

	test("refreshes chat and workspace model queries after provider writes", () => {
		expect(source).toContain("chatModelsQueryKey(activeHostUrl)");
		expect(source).toContain("workspaceModelProvidersQueryKey(activeHostUrl)");
		expect(source).toContain("invalidateProviderCaches");
		expect(source.match(/await invalidateProviderCaches\(\)/g)?.length).toBe(2);
	});

	test("keeps New provider mode from being auto-selected back to the first provider", () => {
		expect(source).toContain(
			"const [isCreatingProvider, setIsCreatingProvider] = useState(false)",
		);
		expect(source).toContain(
			"if (isCreatingProvider || form.id !== null) return;",
		);
		expect(source).toContain("setIsCreatingProvider(true)");
		expect(source).toContain("setIsCreatingProvider(false)");
	});

	test("shows real loading affordances for provider list and saves", () => {
		expect(source).toContain(
			"providers.length === 0 && providersQuery.isLoading",
		);
		expect(source).toContain("<output");
		expect(source).toContain("upsertMutation.isPending");
		expect(source).toContain("Saving...");
		expect(source.match(/<Loader2Icon/g)?.length).toBeGreaterThanOrEqual(2);
	});
});
