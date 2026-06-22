import { describe, expect, test } from "bun:test";

const routerSource = await Bun.file(
	new URL("./project.ts", import.meta.url),
).text();
const handlersSource = await Bun.file(
	new URL("./handlers.ts", import.meta.url),
).text();

describe("project create cancellation wiring", () => {
	test("exposes cancelCreate by project create progress request id", () => {
		expect(routerSource).toContain("cancelCreate: protectedProcedure");
		expect(routerSource).toContain("progressRequestId: z.string().min(1)");
		expect(routerSource).toContain("cancelProjectCreate(ctx, input)");
	});

	test("keeps clone cancellation scoped to the clone phase", () => {
		expect(handlersSource).toContain("registerCancelableClone");
		expect(handlersSource).toContain("cancelableClone.dispose()");
		expect(handlersSource).toContain('"canceling"');
		expect(handlersSource).toContain('"canceled"');
	});
});

describe("project.setup import", () => {
	test("allows cloud projects whose repoCloneUrl is a local path", () => {
		const importBranch = routerSource.slice(
			routerSource.indexOf('case "import":'),
			routerSource.indexOf(
				"if (!cloudProject.repoCloneUrl && resolved.parsed)",
			),
		);

		expect(importBranch).toContain(
			"parseGitHubRemote(cloudProject.repoCloneUrl)",
		);
		expect(importBranch).toContain("await resolveMatchingSlug");
		expect(importBranch).toContain(
			"await resolveLocalRepo(input.mode.repoPath)",
		);
		expect(importBranch).not.toContain("Could not parse GitHub remote");
	});
});
