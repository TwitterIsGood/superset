import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

const CREATE_TASK_DIALOG_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(CREATE_TASK_DIALOG_DIR, relativePath), "utf-8");
}

describe("CreateTaskDialog status fallback wiring", () => {
	test("branches default status seeding between cloud API and local tRPC", () => {
		const source = readComponent("CreateTaskDialog.tsx");

		expect(source).toContain('collections.tasksMode === "cloud"');
		expect(source).toContain(
			"apiTrpcClient.task.ensureDefaultStatuses.mutate()",
		);
		expect(source).toContain(
			"electronTrpcClient.tasksLocal.ensureDefaultStatuses.mutate",
		);
		expect(source).toContain("ensureStatusesRequestRef");
	});

	test("branches create mutation between cloud API and local tRPC", () => {
		const source = readComponent("CreateTaskDialog.tsx");

		expect(source).toContain("apiTrpcClient.task.createFromUi.mutate");
		expect(source).toContain(
			"electronTrpcClient.tasksLocal.createFromUi.mutate",
		);
		expect(source).toContain('collections.tasksMode === "cloud"');
	});

	test("uses seeded statuses until collection status rows are available", () => {
		const source = readComponent("CreateTaskDialog.tsx");

		expect(source).toContain("const [seededStatuses, setSeededStatuses]");
		expect(source).toContain(
			"() => (statusData?.length ? statusData : seededStatuses)",
		);
		expect(source).toContain("setSeededStatuses(defaultStatuses)");
	});

	test("status picker remains clickable and renders an explicit empty state", () => {
		const source = readComponent(
			"components/CreateTaskStatusPicker/CreateTaskStatusPicker.tsx",
		);

		expect(source).not.toContain("disabled={sortedStatuses.length === 0}");
		expect(source).toContain("No statuses available");
	});
});
