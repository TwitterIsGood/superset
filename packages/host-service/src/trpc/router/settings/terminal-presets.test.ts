import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentConfigsRouter } from "./agent-configs";
import { terminalPresetsRouter } from "./terminal-presets";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function createCallers() {
	const db = createTestDb();
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return {
		agents: agentConfigsRouter.createCaller(ctx),
		presets: terminalPresetsRouter.createCaller(ctx),
	};
}

describe("terminalPresetsRouter", () => {
	it("lists the desktop V2 default terminal presets, not every host agent", async () => {
		const caller = createCallers();

		const result = await caller.presets.list();

		expect(result.map((preset) => preset.presetId)).toEqual([
			"claude",
			"codex",
			"opencode",
			"copilot",
		]);
		expect(result.map((preset) => preset.label)).toEqual([
			"Claude",
			"Codex",
			"OpenCode",
			"Copilot",
		]);
		expect(result.map((preset) => preset.command)).toEqual([
			"claude --dangerously-skip-permissions",
			"codex --dangerously-bypass-approvals-and-sandbox",
			"opencode",
			"copilot --allow-tool=write",
		]);
		expect(result.map((preset) => preset.presetId)).not.toContain("amp");
		expect(result.map((preset) => preset.presetId)).not.toContain("gemini");
	});

	it("resolves linked preset commands from edited host agent configs", async () => {
		const caller = createCallers();
		const agents = await caller.agents.list();
		const claude = agents.find((agent) => agent.presetId === "claude");
		if (!claude) throw new Error("expected seeded Claude agent");

		await caller.agents.update({
			id: claude.id,
			patch: {
				label: "Claude Work",
				command: "claude",
				args: ["--dangerously-skip-permissions", "--model", "sonnet"],
				env: { ANTHROPIC_BASE_URL: "https://example.test" },
			},
		});

		const result = await caller.presets.list();
		const resolvedClaude = result.find(
			(preset) => preset.presetId === "claude",
		);

		expect(resolvedClaude?.label).toBe("Claude Work");
		expect(resolvedClaude?.agentId).toBe(claude.id);
		expect(resolvedClaude?.command).toBe(
			"ANTHROPIC_BASE_URL=https://example.test claude --dangerously-skip-permissions --model sonnet",
		);
	});
});
