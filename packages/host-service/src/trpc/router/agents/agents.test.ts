import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __setAccountShellForTesting } from "../../../terminal/user-shell.ts";
import type { ResolvedHostAgentConfig } from "./agents";
import {
	automationAgentRunInputSchema,
	buildAgentLaunchCommand,
	buildAgentLaunchEnv,
	resolveAutomationAgentTimeoutMs,
	resolveAutomationProcessFinalStatus,
	runAutomationAgent,
} from "./agents";

function config(
	patch: Partial<ResolvedHostAgentConfig> = {},
): ResolvedHostAgentConfig {
	return {
		id: "agent-1",
		presetId: "claude",
		label: "Claude",
		command: "claude",
		args: ["--dangerously-skip-permissions"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		...patch,
	};
}

describe("buildAgentLaunchCommand", () => {
	test("does not inject automation env into the visible shell command", () => {
		const command = buildAgentLaunchCommand(config(), "run report");

		expect(command).toStartWith("'claude'");
		expect(command).toContain("'--dangerously-skip-permissions'");
		expect(command).toContain("'run report'");
		expect(command).not.toContain("SUPERSET_AUTOMATION_RUN_TOKEN");
	});
});

describe("buildAgentLaunchEnv", () => {
	test("one-run env overrides persisted agent env for the launched process", () => {
		const env = buildAgentLaunchEnv(
			config({ env: { SUPERSET_API_URL: "https://old.example.com" } }),
			{ SUPERSET_API_URL: "https://new.example.com" },
		);

		expect(env.SUPERSET_API_URL).toBe("https://new.example.com");
	});

	test("keeps shell-sensitive token values as raw environment values", () => {
		const env = buildAgentLaunchEnv(config(), {
			SUPERSET_AUTOMATION_RUN_TOKEN: "tok'en with spaces",
		});

		expect(env.SUPERSET_AUTOMATION_RUN_TOKEN).toBe("tok'en with spaces");
	});
});

describe("automationAgentRunInputSchema", () => {
	test("preserves model selection for run-local model injection", () => {
		const parsed = automationAgentRunInputSchema.parse({
			runId: "11111111-1111-4111-8111-111111111111",
			automationId: "22222222-2222-4222-8222-222222222222",
			agent: "claude",
			prompt: "write a report",
			modelSelection: {
				providerId: "provider-1",
				modelId: "gpt-5.5",
				config: { reasoning: "high" },
			},
		});

		expect(parsed.modelSelection).toEqual({
			providerId: "provider-1",
			modelId: "gpt-5.5",
			config: { reasoning: "high" },
		});
	});
});

describe("resolveAutomationAgentTimeoutMs", () => {
	test("uses an explicit positive millisecond timeout when configured", () => {
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "250",
			}),
		).toBe(250);
	});

	test("falls back when the configured timeout is invalid", () => {
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "0",
			}),
		).toBe(30 * 60 * 1000);
		expect(
			resolveAutomationAgentTimeoutMs({
				SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS: "not-a-number",
			}),
		).toBe(30 * 60 * 1000);
	});
});

describe("resolveAutomationProcessFinalStatus", () => {
	test("fails a cleanly exited agent that produced no output", () => {
		expect(
			resolveAutomationProcessFinalStatus({
				exitCode: 0,
				signal: null,
				stdout: "",
				stderr: "",
			}),
		).toEqual({
			status: "failed",
			title: "Automation produced no output",
			failureReason:
				"Agent exited successfully without writing output or writing back a result.",
			resultSummary: "Automation produced no output",
		});
	});

	test("completes a cleanly exited agent that produced output", () => {
		expect(
			resolveAutomationProcessFinalStatus({
				exitCode: 0,
				signal: null,
				stdout: "done",
				stderr: "",
			}),
		).toEqual({
			status: "completed",
			title: "Automation completed",
			resultSummary: "Automation completed",
		});
	});

	test("keeps timeout failure reason override", () => {
		expect(
			resolveAutomationProcessFinalStatus({
				exitCode: null,
				signal: "SIGTERM",
				stdout: "",
				stderr: "timed out",
				failureReasonOverride: "Automation agent timed out after 50ms",
			}),
		).toEqual({
			status: "failed",
			title: "Automation failed",
			failureReason: "Automation agent timed out after 50ms",
			resultSummary: "Automation failed",
		});
	});
});

function createAgentDb(row: ResolvedHostAgentConfig) {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					get: () => ({
						...row,
						argsJson: JSON.stringify(row.args),
						promptArgsJson: JSON.stringify(row.promptArgs),
						envJson: JSON.stringify(row.env),
						displayOrder: 0,
					}),
				}),
			}),
		}),
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const startedAt = Date.now();
	while (!predicate()) {
		if (Date.now() - startedAt > 3000) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe.serial("runAutomationAgent", () => {
	test("fails a cleanly exited automation agent that writes no output", async () => {
		const root = mkdtempSync(join(tmpdir(), "superset-automation-runs-"));
		const previousRoot = process.env.SUPERSET_AUTOMATION_RUNS_DIR;
		const previousHome = process.env.HOME;
		process.env.SUPERSET_AUTOMATION_RUNS_DIR = root;
		process.env.HOME = root;
		__setAccountShellForTesting("/bin/bash");
		const failed: Array<{
			runId: string;
			failureReason: string;
			resultMarkdown: string;
			resultSummary: string;
		}> = [];

		try {
			const ctx = {
				db: createAgentDb(
					config({
						command: "/bin/sh",
						args: ["-c", ":"],
						promptTransport: "stdin",
						promptArgs: [],
					}),
				),
				api: {
					automation: {
						getRun: {
							query: async () => ({ status: "running" }),
						},
						completeRun: {
							mutate: async () => {
								throw new Error("unexpected completeRun");
							},
						},
						failRun: {
							mutate: async (input: {
								runId: string;
								failureReason: string;
								resultMarkdown: string;
								resultSummary: string;
							}) => {
								failed.push(input);
								return { status: "failed" };
							},
						},
					},
				},
			} as never;

			const runId = "55555555-5555-4555-8555-555555555555";
			const automationId = "66666666-6666-4666-8666-666666666666";
			const result = await runAutomationAgent(ctx, {
				runId,
				automationId,
				agent: "agent-1",
				prompt: "this agent exits without output",
			});

			expect(result.kind).toBe("automation");
			expect(result.runDirectory).toBe(join(root, automationId));
			expect(
				existsSync(join(root, automationId, "runs", `${runId}.prompt.md`)),
			).toBe(true);

			await waitFor(() => failed.length === 1);
			expect(failed[0]?.runId).toBe(runId);
			expect(failed[0]?.failureReason).toBe(
				"Agent exited successfully without writing output or writing back a result.",
			);
			expect(failed[0]?.resultSummary).toBe("Automation produced no output");
			expect(failed[0]?.resultMarkdown).toContain(
				"# Automation produced no output",
			);
			expect(failed[0]?.resultMarkdown).toContain(
				"The agent process exited without writing output.",
			);
		} finally {
			if (previousRoot === undefined) {
				delete process.env.SUPERSET_AUTOMATION_RUNS_DIR;
			} else {
				process.env.SUPERSET_AUTOMATION_RUNS_DIR = previousRoot;
			}
			__setAccountShellForTesting(undefined);
			if (previousHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = previousHome;
			}
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails and kills the automation process when the agent times out", async () => {
		const root = mkdtempSync(join(tmpdir(), "superset-automation-runs-"));
		const previousRoot = process.env.SUPERSET_AUTOMATION_RUNS_DIR;
		const previousTimeout = process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS;
		const previousHome = process.env.HOME;
		process.env.SUPERSET_AUTOMATION_RUNS_DIR = root;
		process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS = "50";
		process.env.HOME = root;
		__setAccountShellForTesting("/bin/bash");
		const failed: Array<{ runId: string; failureReason: string }> = [];

		try {
			const ctx = {
				db: createAgentDb(
					config({
						command: "/bin/sh",
						args: ["-c", "sleep 10"],
						promptTransport: "stdin",
						promptArgs: [],
					}),
				),
				api: {
					automation: {
						getRun: {
							query: async () => ({ status: "running" }),
						},
						completeRun: {
							mutate: async () => {
								throw new Error("unexpected completeRun");
							},
						},
						failRun: {
							mutate: async (input: {
								runId: string;
								failureReason: string;
							}) => {
								failed.push(input);
								return { status: "failed" };
							},
						},
					},
				},
			} as never;

			const runId = "33333333-3333-4333-8333-333333333333";
			await runAutomationAgent(ctx, {
				runId,
				automationId: "44444444-4444-4444-8444-444444444444",
				agent: "agent-1",
				prompt: "this should time out",
			});

			await waitFor(() => failed.length === 1);
			expect(failed[0]?.runId).toBe(runId);
			expect(failed[0]?.failureReason).toBe(
				"Automation agent timed out after 50ms",
			);
		} finally {
			if (previousRoot === undefined) {
				delete process.env.SUPERSET_AUTOMATION_RUNS_DIR;
			} else {
				process.env.SUPERSET_AUTOMATION_RUNS_DIR = previousRoot;
			}
			if (previousTimeout === undefined) {
				delete process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS;
			} else {
				process.env.SUPERSET_AUTOMATION_AGENT_TIMEOUT_MS = previousTimeout;
			}
			__setAccountShellForTesting(undefined);
			if (previousHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = previousHome;
			}
			rmSync(root, { recursive: true, force: true });
		}
	});
});
