/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
	join(import.meta.dir, "WorkspaceDetailScreen.tsx"),
	"utf8",
);

describe("WorkspaceDetailScreen host-control fallback scoping", () => {
	test("does not reuse fallback workspace or host rows across worktree routes", () => {
		expect(SOURCE).toContain("const scopedFallbackWorkspace =");
		expect(SOURCE).toContain("fallbackWorkspace?.id === workspaceId");
		expect(SOURCE).toContain(
			"const workspace = electricWorkspace ?? scopedFallbackWorkspace",
		);
		expect(SOURCE).toContain("const scopedFallbackHost =");
		expect(SOURCE).toContain("fallbackHost?.machineId === workspace?.hostId");
		expect(SOURCE).toContain("fallbackHostBelongsToAnotherWorkspace");
		expect(SOURCE).toContain("hostSnapshotIsSettled");
	});

	test("does not grant host control while relay-aware host snapshot is stale or loading", () => {
		expect(SOURCE).toContain("const hasElectricHostAccess =");
		expect(SOURCE).toContain("const hasHostAccess = scopedFallbackHost");
		expect(SOURCE).toContain('fallbackHostStatus === "idle"');
		expect(SOURCE).toContain('fallbackHostStatus === "loading"');
		expect(SOURCE).toContain('fallbackHostStatus === "loaded"');
		expect(SOURCE).toContain("? false");
		expect(SOURCE).toContain(": hasElectricHostAccess");
	});

	test("uses a real workspace-control route to recover from stale offline host rows", () => {
		expect(SOURCE).toContain("markHostReachableFromControlPlane");
		expect(SOURCE).toContain("apiClient.host.list.query");
		expect(SOURCE).toContain("apiClient.v2Workspace.listTerminals.query");
		expect(SOURCE).toContain("workspaceId: workspace.id");
		expect(SOURCE).toContain("isOnline: true");
		expect(SOURCE).toContain('setFallbackHostStatus("loaded")');

		const hostEffectStart = SOURCE.indexOf(
			"const loadRelayAwareHost = async () =>",
		);
		const hostEffectEnd = SOURCE.indexOf(
			"void loadRelayAwareHost();",
			hostEffectStart,
		);
		expect(hostEffectStart).toBeGreaterThan(0);
		expect(hostEffectEnd).toBeGreaterThan(hostEffectStart);

		const hostEffect = SOURCE.slice(hostEffectStart, hostEffectEnd);
		expect(hostEffect).toContain("if (found?.online)");
		expect(hostEffect).toContain("toHostFallback(found)");
		expect(hostEffect).toContain("markHostReachableFromControlPlane();");
		expect(hostEffect).toContain(
			"setFallbackHost(found ? toHostFallback(found) : null)",
		);
		expect(hostEffect).toContain(
			'setFallbackHostStatus(found ? "loaded" : "error")',
		);
	});
});
