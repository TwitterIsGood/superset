import { describe, expect, test } from "bun:test";
import { evaluateRuntimeBudget } from "./check-runtime-budget";

const budget = {
	startup: {
		required: true,
		maxRegressionPercent: 15,
		marks: {
			"main-window:first-show": { maxMs: 5000, targetMs: 2000 },
		},
	},
	runtime: {
		processTree: {
			desktopMemory: {
				maxBytes: 8 * 1024 * 1024 * 1024,
				targetBytes: 4 * 1024 * 1024 * 1024,
			},
			desktopProcessCount: { max: 40, target: 24 },
		},
		renderer: {
			consoleErrors: { max: 0 },
			domNodes: { max: 30_000, target: 15_000 },
		},
		routes: {
			openDuration: { maxMs: 5000, targetMs: 2000 },
		},
	},
};

describe("evaluateRuntimeBudget", () => {
	test("passes hard limits and reports target warnings", () => {
		const result = evaluateRuntimeBudget({
			baseline: {
				startup: {
					measured: true,
					marks: {
						"main-window:first-show": { elapsedMs: 3000 },
					},
				},
			},
			budget,
			reportPath: "runtime-performance.json",
			report: {
				startup: {
					report: {
						marks: [{ name: "main-window:first-show", elapsedMs: 2500 }],
					},
				},
				automation: {
					consoleErrors: [],
					renderer: {
						nodeCount: 20_000,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 30,
						maxMemoryBytes: 5 * 1024 * 1024 * 1024,
					},
				},
				routeMeasurements: [{ path: "/tasks", durationMs: 2500 }],
			},
		});

		expect(result.failures).toEqual([]);
		expect(result.warnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining("Startup mark main-window:first-show"),
			expect.stringContaining("Desktop process-tree max memory"),
			expect.stringContaining("Desktop process-tree max process count"),
			expect.stringContaining("Renderer DOM node count"),
			expect.stringContaining("Route /tasks open duration"),
		]);
	});

	test("fails missing startup when startup is required", () => {
		const result = evaluateRuntimeBudget({
			budget,
			reportPath: "runtime-performance.json",
			report: {
				startup: { error: "CDP unavailable" },
				automation: { consoleErrors: [] },
				processSummary: {
					desktop: { maxCount: 1, maxMemoryBytes: 1 },
				},
			},
		});

		expect(result.failures.map((failure) => failure.message)).toContain(
			"Startup capture unavailable: CDP unavailable",
		);
	});

	test("fails hard limits and startup baseline regressions", () => {
		const result = evaluateRuntimeBudget({
			baseline: {
				startup: {
					measured: true,
					marks: {
						"main-window:first-show": { elapsedMs: 3000 },
					},
				},
			},
			budget,
			reportPath: "runtime-performance.json",
			report: {
				startup: {
					report: {
						marks: [{ name: "main-window:first-show", elapsedMs: 5200 }],
					},
				},
				automation: {
					consoleErrors: [{}],
					renderer: {
						nodeCount: 40_000,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 45,
						maxMemoryBytes: 9 * 1024 * 1024 * 1024,
					},
				},
				routeMeasurements: [{ path: "/workspace/example", durationMs: 5200 }],
			},
		});

		expect(result.failures.map((failure) => failure.message)).toEqual([
			expect.stringContaining("Startup mark main-window:first-show"),
			expect.stringContaining("regressed more than 15%"),
			expect.stringContaining("Desktop process-tree max memory"),
			expect.stringContaining("Desktop process-tree max process count"),
			expect.stringContaining("Renderer DOM node count"),
			expect.stringContaining("Renderer console error count"),
			expect.stringContaining("Route /workspace/example open duration"),
		]);
	});

	test("warns instead of failing startup regression for unmeasured baselines", () => {
		const result = evaluateRuntimeBudget({
			baseline: {
				startup: {
					measured: false,
					marks: {
						"main-window:first-show": { elapsedMs: 3000 },
					},
				},
			},
			budget,
			reportPath: "runtime-performance.json",
			report: {
				startup: {
					report: {
						marks: [{ name: "main-window:first-show", elapsedMs: 4100 }],
					},
				},
				automation: {
					consoleErrors: [],
					renderer: {
						nodeCount: 1000,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 10,
						maxMemoryBytes: 2 * 1024 * 1024 * 1024,
					},
				},
				routeMeasurements: [{ path: "/tasks", durationMs: 1000 }],
			},
		});

		expect(result.failures).toEqual([]);
		expect(result.warnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining("Startup mark main-window:first-show"),
			expect.stringContaining("unmeasured baseline"),
		]);
	});
});
