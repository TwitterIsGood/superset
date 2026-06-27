import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
				maxBytes: 4 * 1024 * 1024 * 1024,
				targetBytes: 2 * 1024 * 1024 * 1024,
			},
			allMemory: {
				maxBytes: 6 * 1024 * 1024 * 1024,
				targetBytes: 4 * 1024 * 1024 * 1024,
			},
			desktopProcessCount: { max: 24, target: 16 },
			allProcessCount: { max: 36, target: 28 },
		},
		renderer: {
			consoleErrors: { max: 0 },
			domNodes: { max: 10_000, target: 5000 },
			usedJsHeap: {
				maxBytes: 1024 * 1024 * 1024,
				targetBytes: 512 * 1024 * 1024,
			},
		},
		routes: {
			openDuration: { maxMs: 5000, targetMs: 2000 },
			requiredRoutes: ["/tasks"],
		},
	},
};

describe("evaluateRuntimeBudget", () => {
	test("repository startup baseline is measured so CI enforces regressions", () => {
		const baseline = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "..", "perf-baseline.json"),
				"utf8",
			),
		) as {
			startup?: {
				measured?: boolean;
				marks?: Record<string, { elapsedMs?: number }>;
			};
		};

		expect(baseline.startup?.measured).toBe(true);
		expect(
			baseline.startup?.marks?.["main-window:first-show"]?.elapsedMs,
		).toBeGreaterThan(0);
		expect(
			baseline.startup?.marks?.["main-window:renderer-did-finish-load"]
				?.elapsedMs,
		).toBeGreaterThan(0);
	});

	test("repository runtime memory budgets reject 7GB class regressions", () => {
		const repoBudget = JSON.parse(
			readFileSync(join(import.meta.dirname, "..", "perf-budget.json"), "utf8"),
		) as {
			build?: {
				canary?: {
					quick?: { maxSeconds?: number; targetSeconds?: number };
					publishedQuick?: { maxSeconds?: number; targetSeconds?: number };
					full?: { maxSeconds?: number; targetSeconds?: number };
				};
			};
			runtime?: {
				processTree?: {
					desktopMemory?: { maxBytes?: number; targetBytes?: number };
					allMemory?: { maxBytes?: number; targetBytes?: number };
				};
				renderer?: {
					domNodes?: { max?: number; target?: number };
					usedJsHeap?: { maxBytes?: number; targetBytes?: number };
				};
			};
		};

		expect(
			repoBudget.runtime?.processTree?.desktopMemory?.maxBytes,
		).toBeLessThanOrEqual(4 * 1024 * 1024 * 1024);
		expect(
			repoBudget.runtime?.processTree?.desktopMemory?.targetBytes,
		).toBeLessThanOrEqual(2 * 1024 * 1024 * 1024);
		expect(
			repoBudget.runtime?.processTree?.allMemory?.maxBytes,
		).toBeLessThanOrEqual(6 * 1024 * 1024 * 1024);
		expect(
			repoBudget.runtime?.processTree?.allMemory?.targetBytes,
		).toBeLessThanOrEqual(4 * 1024 * 1024 * 1024);
		expect(repoBudget.runtime?.renderer?.domNodes?.max).toBeLessThanOrEqual(
			10_000,
		);
		expect(
			repoBudget.runtime?.renderer?.usedJsHeap?.maxBytes,
		).toBeLessThanOrEqual(1024 * 1024 * 1024);
		expect(repoBudget.build?.canary?.quick?.maxSeconds).toBeLessThanOrEqual(
			5 * 60,
		);
		expect(repoBudget.build?.canary?.quick?.targetSeconds).toBeLessThanOrEqual(
			3 * 60,
		);
		expect(
			repoBudget.build?.canary?.publishedQuick?.maxSeconds,
		).toBeLessThanOrEqual(8 * 60);
		expect(repoBudget.build?.canary?.full?.maxSeconds).toBeLessThanOrEqual(
			15 * 60,
		);
	});

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
						nodeCount: 7000,
						usedJsHeapSize: 100 * 1024 * 1024,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 20,
						maxMemoryBytes: 3 * 1024 * 1024 * 1024,
					},
					all: {
						maxCount: 32,
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
			expect.stringContaining("All tracked process max memory"),
			expect.stringContaining("Desktop process-tree max process count"),
			expect.stringContaining("All tracked process max process count"),
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
					all: { maxCount: 1, maxMemoryBytes: 1 },
				},
			},
		});

		expect(result.failures.map((failure) => failure.message)).toContain(
			"Startup capture unavailable: CDP unavailable",
		);
		expect(result.failures.map((failure) => failure.message)).toContain(
			"Required route /tasks was not measured. Pass --route=/tasks to report:runtime.",
		);
	});

	test("fails when a required route is missing from the report", () => {
		const result = evaluateRuntimeBudget({
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
						nodeCount: 1000,
						usedJsHeapSize: 100 * 1024 * 1024,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 10,
						maxMemoryBytes: 2 * 1024 * 1024 * 1024,
					},
					all: {
						maxCount: 10,
						maxMemoryBytes: 2 * 1024 * 1024 * 1024,
					},
				},
				routeMeasurements: [{ path: "/sign-in", durationMs: 1000 }],
			},
		});

		expect(result.failures.map((failure) => failure.message)).toContain(
			"Required route /tasks was not measured. Pass --route=/tasks to report:runtime.",
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
						usedJsHeapSize: 2 * 1024 * 1024 * 1024,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 30,
						maxMemoryBytes: 5 * 1024 * 1024 * 1024,
					},
					all: {
						maxCount: 40,
						maxMemoryBytes: 7 * 1024 * 1024 * 1024,
					},
				},
				routeMeasurements: [{ path: "/workspace/example", durationMs: 5200 }],
			},
		});

		expect(result.failures.map((failure) => failure.message)).toEqual([
			expect.stringContaining("Startup mark main-window:first-show"),
			expect.stringContaining("regressed more than 15%"),
			expect.stringContaining("Desktop process-tree max memory"),
			expect.stringContaining("All tracked process max memory"),
			expect.stringContaining("Desktop process-tree max process count"),
			expect.stringContaining("All tracked process max process count"),
			expect.stringContaining("Renderer DOM node count"),
			expect.stringContaining("Renderer used JS heap"),
			expect.stringContaining("Renderer console error count"),
			expect.stringContaining("Required route /tasks"),
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
						usedJsHeapSize: 100 * 1024 * 1024,
					},
				},
				processSummary: {
					desktop: {
						maxCount: 10,
						maxMemoryBytes: 2 * 1024 * 1024 * 1024,
					},
					all: {
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
