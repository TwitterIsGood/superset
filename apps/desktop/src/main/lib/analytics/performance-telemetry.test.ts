import { describe, expect, mock, test } from "bun:test";

mock.module("electron", () => ({
	app: {
		getVersion: () => "1.2.3",
	},
}));

mock.module("posthog-node", () => ({
	PostHog: class {
		capture() {}
	},
}));

const { buildDesktopPerformanceTelemetryPayload, getStartupTotalMs } =
	await import("./performance-telemetry");

describe("desktop performance telemetry payload", () => {
	test("keeps canary performance telemetry aggregate-only", () => {
		const payload = buildDesktopPerformanceTelemetryPayload({
			source: "startup",
			startupTotalMs: 1234.4,
			peakMemoryBytes: 3_145_728.2,
			idleMemoryBytes: 2_621_440,
			childProcessCount: 9,
			// @ts-expect-error Guard against accidental content-shaped fields.
			workspaceId: "workspace-1",
			projectName: "Secret Project",
			path: "/Users/person/code/private",
		});

		expect(payload).toEqual({
			source: "startup",
			startup_total_ms: 1234,
			peak_memory_bytes: 3_145_728,
			idle_memory_bytes: 2_621_440,
			child_process_count: 9,
		});
		expect(Object.keys(payload)).not.toContain("workspaceId");
		expect(Object.keys(payload)).not.toContain("projectName");
		expect(Object.keys(payload)).not.toContain("path");
	});

	test("drops invalid numeric values", () => {
		const payload = buildDesktopPerformanceTelemetryPayload({
			source: "idle",
			startupTotalMs: Number.NaN,
			peakMemoryBytes: -1,
			idleMemoryBytes: Number.POSITIVE_INFINITY,
			childProcessCount: 0,
		});

		expect(payload).toEqual({
			source: "idle",
			child_process_count: 0,
		});
	});

	test("uses first-window setup mark as startup total", () => {
		expect(
			getStartupTotalMs({
				processStartedAt: "2026-06-26T00:00:00.000Z",
				uptimeMs: 2000,
				marks: [
					{
						name: "main:process-start",
						elapsedMs: 0,
						timestamp: "2026-06-26T00:00:00.000Z",
					},
					{
						name: "main:app-ready-complete",
						elapsedMs: 1800,
						timestamp: "2026-06-26T00:00:01.800Z",
					},
					{
						name: "main:window-setup-end",
						elapsedMs: 1400,
						timestamp: "2026-06-26T00:00:01.400Z",
					},
				],
				durations: [],
			}),
		).toBe(1400);
	});
});
