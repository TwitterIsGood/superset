import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";
import { GATED_FEATURES, PRO_FEATURES } from "./constants";

const DESKTOP_RENDERER_DIR = join(__dirname, "../..");

function readRendererSource(relativePath: string): string {
	return readFileSync(join(DESKTOP_RENDERER_DIR, relativePath), "utf-8");
}

describe("Tasks paywall gate removal", () => {
	test("Paywall constants no longer register Tasks as a Pro feature", () => {
		expect(GATED_FEATURES).not.toHaveProperty("TASKS");
		expect(PRO_FEATURES.map((feature) => feature.id)).not.toContain("tasks");
	});

	test("Tasks sidebar entries navigate directly without a gated feature wrapper", () => {
		const sidebarHeaders = [
			"routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx",
			"screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx",
		];

		for (const sidebarHeader of sidebarHeaders) {
			const source = readRendererSource(sidebarHeader);

			expect(source).not.toContain("GATED_FEATURES.TASKS");
			expect(source).not.toContain("gateFeature(");
			expect(source).toContain('navigate({ to: "/tasks", search })');
		}
	});
});
