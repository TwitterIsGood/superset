import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args";
import {
	parseVisualStabilityCliOptions,
	resolveWorkspaceJsonPath,
	runDesktopAutomationCli,
} from "./desktop-automation-cli";

describe("resolveWorkspaceJsonPath", () => {
	test("allows json reports inside the workspace", () => {
		expect(resolveWorkspaceJsonPath("artifacts/report.json", "/repo")).toBe(
			"/repo/artifacts/report.json",
		);
	});

	test("rejects json reports outside the workspace", () => {
		expect(() => resolveWorkspaceJsonPath("../report.json", "/repo")).toThrow(
			"inside the repository workspace",
		);
	});

	test("rejects non-json report paths", () => {
		expect(() => resolveWorkspaceJsonPath("report.txt", "/repo")).toThrow(
			"end with .json",
		);
	});
});

describe("parseVisualStabilityCliOptions", () => {
	test("parses click actions, repeated selectors, timing, thresholds, and artifacts", () => {
		const parsed = parseVisualStabilityCliOptions(
			parseCliArgs([
				"visual-stability",
				"--click-text",
				"Workspaces",
				"--wait-url-includes",
				"#/v2-workspaces",
				"--persist-selector",
				"[data-shell]",
				"--persist-selector",
				"[data-sidebar]",
				"--measure-selector",
				"[data-sidebar]",
				"--churn-root-selector",
				"main",
				"--sample-ms",
				"900",
				"--sample-interval-ms",
				"75",
				"--max-layout-shift-px",
				"3",
				"--max-dom-removed",
				"0",
				"--fail-on-console-error=false",
				"--before-screenshot",
				".trellis/tasks/t/artifacts/before.png",
				"--after-screenshot",
				".trellis/tasks/t/artifacts/after.png",
				"--failed-frame-dir",
				".trellis/tasks/t/artifacts/frames",
				"--report",
				".trellis/tasks/t/artifacts/report.json",
			]),
		);

		expect(parsed.reportPath).toBe(".trellis/tasks/t/artifacts/report.json");
		expect(parsed.options.action).toEqual({
			kind: "click",
			text: "Workspaces",
			fuzzy: true,
			selector: undefined,
			testId: undefined,
			x: undefined,
			y: undefined,
			index: undefined,
		});
		expect(parsed.options.wait).toMatchObject({
			urlIncludes: "#/v2-workspaces",
		});
		expect(parsed.options.persistSelectors).toEqual([
			"[data-shell]",
			"[data-sidebar]",
		]);
		expect(parsed.options.measureSelectors).toEqual(["[data-sidebar]"]);
		expect(parsed.options.churnRootSelectors).toEqual(["main"]);
		expect(parsed.options.sampleMs).toBe(900);
		expect(parsed.options.sampleIntervalMs).toBe(75);
		expect(parsed.options.thresholds.maxLayoutShiftPx).toBe(3);
		expect(parsed.options.thresholds.maxDomRemoved).toBe(0);
		expect(parsed.options.thresholds.failOnConsoleError).toBe(false);
		expect(parsed.options.artifacts).toEqual({
			beforeScreenshotPath: ".trellis/tasks/t/artifacts/before.png",
			afterScreenshotPath: ".trellis/tasks/t/artifacts/after.png",
			failedFrameDir: ".trellis/tasks/t/artifacts/frames",
		});
	});

	test("requires exactly one action", () => {
		expect(() =>
			parseVisualStabilityCliOptions(
				parseCliArgs([
					"visual-stability",
					"--click-text",
					"Workspaces",
					"--navigate-path",
					"/tasks",
				]),
			),
		).toThrow("exactly one action");
	});

	test("requires complete coordinate click pairs", () => {
		expect(() =>
			parseVisualStabilityCliOptions(
				parseCliArgs(["visual-stability", "--click-x", "10"]),
			),
		).toThrow("both --click-x and --click-y");
	});
});

describe("runDesktopAutomationCli visual-stability help", () => {
	test("prints command-specific usage without connecting to the desktop app", async () => {
		let output = "";
		const exitCode = await runDesktopAutomationCli(
			["visual-stability", "--help"],
			{
				write: (message) => {
					output = message;
				},
				writeError: (message) => {
					output = message;
				},
			},
		);

		expect(exitCode).toBe(0);
		expect(output).toContain("Desktop automation visual-stability");
		expect(output).toContain("--persist-selector <css>");
		expect(output).toContain("--report <file.json>");
	});
});
