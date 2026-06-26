import { describe, expect, test } from "bun:test";
import {
	classifyProcessCommand,
	findScenarioBudgetFailures,
	isServiceSeedCommand,
	parseCliOptions,
} from "./run-runtime-memory-scenario";

describe("parseCliOptions", () => {
	test("parses short memory scenario runs", () => {
		const options = parseCliOptions([
			"--no-automation",
			"--cycles=1",
			"--idle-ms=100",
			"--sample-interval-ms=50",
			"--terminal-count=0",
			"--route",
			"/v2-workspace/workspace-a",
		]);

		expect(options.automation).toBe(false);
		expect(options.cycles).toBe(1);
		expect(options.idleMs).toBe(100);
		expect(options.sampleIntervalMs).toBe(50);
		expect(options.terminalCount).toBe(0);
		expect(options.routes).toEqual(["/v2-workspace/workspace-a"]);
	});

	test("parses memory budget gate options", () => {
		const options = parseCliOptions([
			"--max-action-failures=0",
			"--max-console-errors=0",
			"--max-growth-percent=20",
			"--max-desktop-growth-percent=15.5",
			"--max-peak-process-count=40",
			"--max-peak-desktop-process-count=24",
		]);

		expect(options.maxActionFailures).toBe(0);
		expect(options.maxConsoleErrors).toBe(0);
		expect(options.maxGrowthPercent).toBe(20);
		expect(options.maxDesktopGrowthPercent).toBe(15.5);
		expect(options.maxPeakProcessCount).toBe(40);
		expect(options.maxPeakDesktopProcessCount).toBe(24);
	});

	test("clamps sample interval to short idle windows", () => {
		const options = parseCliOptions([
			"--idle-ms=10",
			"--sample-interval-ms=50",
		]);

		expect(options.idleMs).toBe(10);
		expect(options.sampleIntervalMs).toBe(10);
	});
});

describe("findScenarioBudgetFailures", () => {
	test("reports action, console, growth, and process-count failures", () => {
		const failures = findScenarioBudgetFailures({
			options: {
				...parseCliOptions([]),
				maxActionFailures: 0,
				maxConsoleErrors: 0,
				maxDesktopGrowthPercent: 20,
				maxGrowthPercent: 20,
				maxPeakDesktopProcessCount: 3,
				maxPeakProcessCount: 5,
			},
			summary: {
				actionCount: 4,
				actionFailureCount: 1,
				deltaDesktopMemoryBytes: 30,
				deltaMemoryBytes: 30,
				desktopGrowthPercent: 25,
				durationMs: 100,
				endDesktopMemoryBytes: 130,
				endMemoryBytes: 130,
				growthPercent: 30,
				peakDesktopMemoryBytes: 130,
				peakDesktopProcessCount: 4,
				peakMemoryBytes: 130,
				peakProcessCount: 6,
				snapshotCount: 2,
				startDesktopMemoryBytes: 100,
				startMemoryBytes: 100,
			},
			consoleErrors: [{ level: 3, message: "boom", timestamp: 1 }],
		});

		expect(failures).toHaveLength(6);
		expect(failures[0]).toContain("Action failures");
		expect(failures[1]).toContain("Renderer console errors");
		expect(failures[2]).toContain("Process-tree memory growth");
		expect(failures[3]).toContain("Desktop subtree memory growth");
		expect(failures[4]).toContain("Peak process-tree process count");
		expect(failures[5]).toContain("Peak desktop subtree process count");
	});
});

describe("process classification", () => {
	test("classifies Next dev server children as API", () => {
		expect(classifyProcessCommand("next-server (v16.2.6)")).toBe("api");
	});

	test("includes relay in the sampled service process tree", () => {
		const command = "bun --cwd apps/relay --hot src/index.ts";

		expect(isServiceSeedCommand(command)).toBe(true);
		expect(classifyProcessCommand(command)).toBe("relay");
	});

	test("attributes esbuild helpers to their dev server parent", () => {
		const esbuildCommand =
			"/repo/node_modules/.bun/@esbuild+darwin-arm64/bin/esbuild --service=0.27.4 --ping";

		expect(
			classifyProcessCommand(esbuildCommand, [
				"node /repo/apps/desktop/node_modules/.bin/electron-vite dev --watch",
			]),
		).toBe("desktop-dev-runner");
		expect(
			classifyProcessCommand(esbuildCommand, [
				"node /repo/apps/api/node_modules/.bin/next dev --port 3276",
			]),
		).toBe("api");
	});
});
