import { describe, expect, test } from "bun:test";
import {
	evaluateCanaryBuildDuration,
	filterCanaryBuildDurationJobs,
} from "./check-canary-build-duration";

const quickBudget = {
	maxSeconds: 300,
	targetSeconds: 180,
	criticalPathMaxSeconds: {
		artifactUpload: 10,
		compile: 120,
		dependencyCache: 60,
		electronBuilderZip: 45,
		install: 90,
	},
};

describe("evaluateCanaryBuildDuration", () => {
	test("passes a fast artifact-only quick canary and reports phase timings", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					completed_at: "2026-06-27T00:03:00Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Cache dependencies", 0, 20),
						step("Install dependencies", 20, 55),
						step("Compile app with electron-vite", 55, 130),
						step("Build Electron app", 130, 165),
						step("Upload ZIP artifact", 165, 170),
					],
				},
			],
		});

		expect(result.failures).toEqual([]);
		expect(result.targetWarnings).toEqual([]);
		expect(result.artifactReadySeconds).toBe(170);
		expect(result.criticalPathSeconds).toBe(180);
		expect(result.phases.map((phase) => phase.name)).toEqual([
			"macArm64",
			"compile",
			"install",
			"electronBuilderZip",
			"dependencyCache",
			"artifactUpload",
		]);
	});

	test("fails the quick lane when artifact-ready time or a phase exceeds hard limits", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					completed_at: "2026-06-27T00:06:10Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Install dependencies", 0, 80),
						step("Compile app with electron-vite", 80, 260),
						step("Build Electron app", 260, 330),
						step("Upload ZIP artifact", 330, 340),
						step("Post Cache dependencies", 340, 370),
					],
				},
			],
		});

		expect(result.failures.map((failure) => failure.message)).toEqual([
			expect.stringContaining("quick canary artifact-ready path"),
			expect.stringContaining("compile"),
			expect.stringContaining("electronBuilderZip"),
		]);
		expect(
			result.phases.find((phase) => phase.name === "postCache")
				?.durationSeconds,
		).toBe(30);
		expect(
			result.phases.find((phase) => phase.name === "dependencyCache")
				?.durationSeconds,
		).toBeUndefined();
	});

	test("uses artifact-producing jobs for quick artifact-ready timing", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					completed_at: "2026-06-27T00:00:15Z",
					name: "Check for changes",
					started_at: "2026-06-27T00:00:00Z",
				},
				{
					completed_at: "2026-06-27T00:05:50Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:20Z",
					steps: [
						step("Restore dependencies cache", 20, 62),
						step("Install dependencies", 62, 137),
						step("Compile app with electron-vite", 137, 257),
						step("Build Electron app", 257, 285),
						step("Upload ZIP artifact", 285, 289),
						step("Upload auto-update manifest", 289, 290),
						step("Post Cache dependencies", 290, 350),
					],
				},
			],
		});

		expect(result.artifactReadySeconds).toBe(270);
		expect(result.criticalPathSeconds).toBe(350);
		expect(result.failures).toEqual([]);
		expect(result.targetWarnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining("quick canary artifact-ready path"),
		]);
	});

	test("warns instead of failing when cache restore exceeds its diagnostic phase budget", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					completed_at: "2026-06-27T00:02:40Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Restore dependencies cache", 0, 84),
						step("Install dependencies", 84, 96),
						step("Compile app with electron-vite", 96, 146),
						step("Build Electron app", 146, 156),
						step("Upload ZIP artifact", 156, 160),
					],
				},
			],
		});

		expect(result.failures).toEqual([]);
		expect(result.artifactReadySeconds).toBe(160);
		expect(result.targetWarnings.map((warning) => warning.message)).toContain(
			"dependencyCache 1m 24s exceeds hard limit 1m 00s.",
		);
	});

	test("warns when published quick exceeds target but stays under hard limit", () => {
		const result = evaluateCanaryBuildDuration({
			budget: {
				maxSeconds: 480,
				targetSeconds: 300,
				criticalPathMaxSeconds: {
					electronBuilderDmgZip: 150,
					releaseUpdate: 60,
					resourcePackBuildUploadVerify: 150,
				},
			},
			lane: "publishedQuick",
			jobs: [
				{
					completed_at: "2026-06-27T00:05:20Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Build Electron app (DMG+ZIP)", 0, 75),
						step("Build desktop resource packs", 20, 100),
						step("Upload desktop resource packs to object storage", 100, 150),
					],
				},
				{
					completed_at: "2026-06-27T00:06:20Z",
					name: "Update Canary Release",
					started_at: "2026-06-27T00:05:20Z",
					steps: [step("Create Canary Release", 320, 350)],
				},
			],
		});

		expect(result.failures).toEqual([]);
		expect(result.targetWarnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining("publishedQuick canary critical path"),
		]);
		expect(
			result.phases.find(
				(phase) => phase.name === "resourcePackBuildUploadVerify",
			)?.durationSeconds,
		).toBe(130);
		expect(
			result.phases.find((phase) => phase.name === "electronBuilderDmgZip")
				?.durationSeconds,
		).toBe(75);
	});

	test("accepts gh run view camelCase timestamp fields", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					completedAt: "2026-06-27T00:02:30Z",
					name: "Build - macOS (arm64)",
					startedAt: "2026-06-27T00:00:00Z",
					steps: [
						camelStep("Install dependencies", 0, 30),
						camelStep("Compile app with electron-vite", 30, 90),
						camelStep("Build Electron app", 90, 125),
					],
				},
			],
		});

		expect(result.failures).toEqual([]);
		expect(result.criticalPathSeconds).toBe(150);
		expect(result.phases.some((phase) => phase.name === "compile")).toBe(true);
	});

	test("fails instead of reporting a fake zero-second run when timings are absent", () => {
		const result = evaluateCanaryBuildDuration({
			budget: quickBudget,
			lane: "quick",
			jobs: [
				{
					name: "Build - macOS (arm64)",
					steps: [{ name: "Compile app with electron-vite" }],
				},
			],
		});

		expect(result.failures.map((failure) => failure.message)).toContain(
			"No GitHub Actions job or step timestamps were available for duration evaluation.",
		);
		expect(result.criticalPathSeconds).toBe(0);
	});

	test("can exclude post-release resource pack jobs from release critical path", () => {
		const jobs = [
			{
				completed_at: "2026-06-27T00:04:00Z",
				name: "Build - macOS (arm64)",
				started_at: "2026-06-27T00:00:00Z",
			},
			{
				completed_at: "2026-06-27T00:04:30Z",
				name: "Update Canary Release",
				started_at: "2026-06-27T00:04:00Z",
			},
			{
				completed_at: "2026-06-27T00:09:30Z",
				name: "Build and upload quick resource packs",
				started_at: "2026-06-27T00:00:00Z",
			},
		];

		const result = evaluateCanaryBuildDuration({
			budget: {
				maxSeconds: 480,
				targetSeconds: 300,
			},
			jobs: filterCanaryBuildDurationJobs({
				excludeJobNamePatterns: ["resource packs"],
				jobs,
			}),
			lane: "publishedQuick",
		});

		expect(result.checkedJobs).toBe(2);
		expect(result.criticalPathSeconds).toBe(270);
		expect(result.failures).toEqual([]);
	});

	test("can isolate the resource pack job for its own duration budget", () => {
		const jobs = [
			{
				completed_at: "2026-06-27T00:04:30Z",
				name: "Update Canary Release",
				started_at: "2026-06-27T00:04:00Z",
			},
			{
				completed_at: "2026-06-27T00:02:00Z",
				name: "Build and upload quick resource packs",
				started_at: "2026-06-27T00:00:00Z",
				steps: [
					step("Check desktop resource pack cache", 0, 10),
					step("Upload desktop resource packs to object storage", 10, 120),
				],
			},
		];

		const result = evaluateCanaryBuildDuration({
			budget: {
				maxSeconds: 480,
				targetSeconds: 300,
				criticalPathMaxSeconds: {
					resourcePackBuildUploadVerify: 90,
				},
			},
			jobs: filterCanaryBuildDurationJobs({
				includeJobNamePatterns: ["resource packs"],
				jobs,
			}),
			lane: "publishedQuick",
		});

		expect(result.checkedJobs).toBe(1);
		expect(result.criticalPathSeconds).toBe(120);
		expect(result.failures.map((failure) => failure.message)).toEqual([
			expect.stringContaining("resourcePackBuildUploadVerify"),
		]);
	});

	test("does not double count overlapping phase work from parallel jobs", () => {
		const result = evaluateCanaryBuildDuration({
			budget: {
				maxSeconds: 300,
				criticalPathMaxSeconds: {
					dependencyCache: 60,
					install: 60,
				},
			},
			lane: "quick",
			jobs: [
				{
					completed_at: "2026-06-27T00:01:30Z",
					name: "Compile - macOS ZIP dist (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Restore dependencies cache", 0, 25),
						step("Install desktop dependency graph", 25, 30),
					],
				},
				{
					completed_at: "2026-06-27T00:02:00Z",
					name: "Build - macOS (arm64)",
					started_at: "2026-06-27T00:00:00Z",
					steps: [
						step("Restore dependencies cache", 0, 52),
						step("Cache Electron packaging downloads", 52, 54),
						step("Install dependencies", 54, 58),
					],
				},
			],
		});

		expect(result.failures).toEqual([]);
		expect(
			result.phases.find((phase) => phase.name === "dependencyCache")
				?.durationSeconds,
		).toBe(54);
		expect(
			result.phases.find((phase) => phase.name === "install")?.durationSeconds,
		).toBe(9);
	});
});

function step(name: string, startSeconds: number, endSeconds: number) {
	const base = Date.parse("2026-06-27T00:00:00Z");
	return {
		completed_at: new Date(base + endSeconds * 1000).toISOString(),
		name,
		started_at: new Date(base + startSeconds * 1000).toISOString(),
	};
}

function camelStep(name: string, startSeconds: number, endSeconds: number) {
	const base = Date.parse("2026-06-27T00:00:00Z");
	return {
		completedAt: new Date(base + endSeconds * 1000).toISOString(),
		name,
		startedAt: new Date(base + startSeconds * 1000).toISOString(),
	};
}
