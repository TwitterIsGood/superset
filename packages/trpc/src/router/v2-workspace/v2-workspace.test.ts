import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "v2-workspace.ts"), "utf8");

describe("v2Workspace mobile host control recovery", () => {
	test("routes host workspace-not-found errors through local recovery", () => {
		expect(SOURCE).toContain("RelayDispatchError");
		expect(SOURCE).toContain("isHostWorkspaceMissingError");
		expect(SOURCE).toContain("workspaceCreation.ensureLocal");
		expect(SOURCE).toContain("verifiedCloudWorkspace: args.workspace");
		expect(SOURCE).toContain("withHostWorkspaceRecovery");
	});

	test("maps host cloud-auth failures to host reauthentication guidance", () => {
		expect(SOURCE).toContain("isHostCloudAuthenticationError");
		expect(SOURCE).toContain("Host service is not authenticated with Superset");
		expect(SOURCE).toContain(
			"not authenticated. provide a bearer jwt, x-api-key, or session",
		);
	});

	test("covers all mobile workspace control relay operations", () => {
		const directTerminalProcedures = new Set([
			'"terminal.listSessions"',
			'"terminal.getSnapshot"',
			'"terminal.writeInput"',
			'"terminal.resize"',
			'"terminal.killSession"',
		]);
		for (const procedure of [
			'"agents.run"',
			'"chat.sendMessage"',
			'"chat.getSnapshot"',
			'"chat.stop"',
			'"chat.endSession"',
			'"chat.respondToApproval"',
			'"chat.respondToQuestion"',
			'"chat.respondToPlan"',
			'"terminal.createSession"',
			'"terminal.listSessions"',
			'"terminal.getSnapshot"',
			'"terminal.writeInput"',
			'"terminal.resize"',
			'"terminal.killSession"',
		]) {
			const index =
				procedure === '"terminal.listSessions"'
					? SOURCE.indexOf(
							procedure,
							SOURCE.indexOf("listTerminals: protectedProcedure"),
						)
					: procedure === '"terminal.writeInput"'
						? SOURCE.indexOf(
								procedure,
								SOURCE.indexOf("writeTerminalInput: protectedProcedure"),
							)
						: procedure === '"terminal.resize"'
							? SOURCE.indexOf(
									procedure,
									SOURCE.indexOf("resizeTerminal: protectedProcedure"),
								)
							: procedure === '"terminal.killSession"'
								? SOURCE.indexOf(
										procedure,
										SOURCE.indexOf("deleteTerminal: protectedProcedure"),
									)
								: SOURCE.indexOf(procedure);
			expect(index).toBeGreaterThan(0);
			const before = SOURCE.slice(Math.max(0, index - 1400), index);
			if (directTerminalProcedures.has(procedure)) {
				expect(before).toContain("getWorkspaceHostControlAccess");
			} else {
				expect(before).toContain("withHostWorkspaceRecovery");
			}
		}
	});

	test("mints mobile workspace-control JWTs with the active organization id", () => {
		const mintIndex = SOURCE.indexOf("function mintWorkspaceControlJwt");
		expect(mintIndex).toBeGreaterThan(0);

		const mintSource = SOURCE.slice(
			mintIndex,
			SOURCE.indexOf("}", mintIndex) + 400,
		);
		expect(mintSource).toContain("organizationId: args.organizationId");
		expect(mintSource).toContain("organizationIds: [args.organizationId]");
		expect(mintSource).toContain('scope: "mobile-workspace-control"');
	});

	test("proxies mobile terminal output snapshots through relay", () => {
		const snapshotIndex = SOURCE.indexOf('"terminal.getSnapshot"');
		const listIndex = SOURCE.lastIndexOf(
			'"terminal.listSessions"',
			snapshotIndex,
		);
		const inputIndex = SOURCE.indexOf('"terminal.writeInput"', snapshotIndex);
		const resizeIndex = SOURCE.indexOf('"terminal.resize"', inputIndex);
		const deleteIndex = SOURCE.indexOf('"terminal.killSession"', resizeIndex);
		expect(snapshotIndex).toBeGreaterThan(0);
		expect(listIndex).toBeGreaterThan(0);
		expect(inputIndex).toBeGreaterThan(snapshotIndex);
		expect(resizeIndex).toBeGreaterThan(inputIndex);
		expect(deleteIndex).toBeGreaterThan(resizeIndex);

		const before = SOURCE.slice(
			Math.max(0, snapshotIndex - 1200),
			snapshotIndex,
		);
		expect(before).toContain("getWorkspaceHostControlAccess");
		expect(before).toContain("buildHostRoutingKey");
		expect(before).toContain("WorkspaceTerminalSnapshot");

		const aroundList = SOURCE.slice(
			Math.max(0, listIndex - 900),
			listIndex + 600,
		);
		expect(aroundList).toContain("WorkspaceTerminalListResult");
		expect(aroundList).toContain("workspaceId: workspace.id");

		const aroundInput = SOURCE.slice(
			Math.max(0, inputIndex - 900),
			inputIndex + 700,
		);
		expect(aroundInput).toContain("WorkspaceTerminalInputResult");
		expect(aroundInput).toContain("data: input.data");

		const aroundResize = SOURCE.slice(
			Math.max(0, resizeIndex - 900),
			resizeIndex + 800,
		);
		expect(aroundResize).toContain("WorkspaceTerminalResizeResult");
		expect(aroundResize).toContain("cols: input.cols");
		expect(aroundResize).toContain("rows: input.rows");

		const aroundDelete = SOURCE.slice(
			Math.max(0, deleteIndex - 900),
			deleteIndex + 800,
		);
		expect(aroundDelete).toContain("WorkspaceTerminalDeleteResult");
		expect(aroundDelete).toContain("terminalId: input.terminalId");
	});

	test("exposes a relay websocket attach descriptor for native terminal clients", () => {
		const descriptorIndex = SOURCE.indexOf(
			"getTerminalAttachDescriptor: protectedProcedure",
		);
		expect(descriptorIndex).toBeGreaterThan(0);

		const descriptorSource = SOURCE.slice(
			descriptorIndex,
			descriptorIndex + 4200,
		);
		expect(SOURCE).toContain("type WorkspaceTerminalAttachDescriptor");
		expect(descriptorSource).toContain("getWorkspaceHostControlAccess");
		expect(descriptorSource).toContain("Workspace host is offline");
		expect(descriptorSource).toContain("mintWorkspaceControlJwt");
		expect(descriptorSource).toContain("buildHostRoutingKey");
		expect(descriptorSource).toContain('"terminal.listSessions"');
		expect(descriptorSource).toContain("Terminal session not found");
		expect(descriptorSource).toContain("terminalWebSocketUrl");
		expect(descriptorSource).toContain("webSocketUrl: url.toString()");
		expect(descriptorSource).toContain('mode: "terminal-websocket"');
		expect(descriptorSource).toContain("WORKSPACE_CONTROL_JWT_TTL_SECONDS");
		expect(descriptorSource).toContain('url.searchParams.set("replay", "0")');
	});

	test("passes mobile terminal dimensions into host terminal creation", () => {
		const createIndex = SOURCE.indexOf("createTerminal: protectedProcedure");
		expect(createIndex).toBeGreaterThan(0);

		const aroundCreate = SOURCE.slice(createIndex, createIndex + 2600);
		expect(aroundCreate).toContain(
			"cols: z.number().int().positive().optional()",
		);
		expect(aroundCreate).toContain(
			"rows: z.number().int().positive().optional()",
		);
		expect(aroundCreate).toContain("cols?: number");
		expect(aroundCreate).toContain("rows?: number");
		expect(aroundCreate).toContain("cols: input.cols");
		expect(aroundCreate).toContain("rows: input.rows");
	});

	test("falls back to terminal websocket replay when host snapshot route is missing", () => {
		const fallbackIndex = SOURCE.indexOf(
			"getTerminalSnapshotViaWebSocketFallback",
		);
		expect(fallbackIndex).toBeGreaterThan(0);

		const snapshotIndex = SOURCE.indexOf('"terminal.getSnapshot"');
		const after = SOURCE.slice(snapshotIndex, snapshotIndex + 2200);
		expect(after).toContain(
			'isRelayMissingProcedure(error, "terminal.getSnapshot")',
		);
		expect(after).toContain("getTerminalSnapshotViaWebSocketFallback");
		expect(SOURCE).toContain('"terminal.listSessions"');
		expect(SOURCE).toContain("terminalWebSocketUrl");
		expect(SOURCE).toContain(["/terminal/", "{args.terminalId}"].join("$"));
	});

	test("syncs cloud model providers before listing mobile chat models", () => {
		const listIndex = SOURCE.indexOf('"modelProviders.listChatModels"');
		expect(listIndex).toBeGreaterThan(0);

		const before = SOURCE.slice(Math.max(0, listIndex - 1200), listIndex);
		expect(before).toContain("listModelProviderSyncPayload");
		expect(before).toContain('"modelProviders.syncFromCloud"');
	});

	test("does not synthesize chat models when the host reports no enabled models", () => {
		const listIndex = SOURCE.indexOf("listChatModels: protectedProcedure");
		expect(listIndex).toBeGreaterThan(0);

		const listSource = SOURCE.slice(listIndex, listIndex + 2600);
		expect(SOURCE).not.toContain("AVAILABLE_MODELS");
		expect(SOURCE).not.toContain("function defaultWorkspaceChatModels");
		expect(listSource).toContain("filterMobileAcpChatModels(models)");
		expect(listSource).toContain("return mobileModels");
		expect(listSource).not.toContain("return defaultWorkspaceChatModels()");
	});

	test("lists mobile workspace agents from the host agent configs", () => {
		const listIndex = SOURCE.indexOf('"settings.agentConfigs.list"');
		expect(listIndex).toBeGreaterThan(0);

		const before = SOURCE.slice(Math.max(0, listIndex - 1200), listIndex);
		const listSource = SOURCE.slice(listIndex, listIndex + 1800);
		expect(before).toContain("getWorkspaceHostControlAccess");
		expect(before).toContain("buildHostRoutingKey");
		expect(listSource).toContain("command: agent.command");
		expect(listSource).toContain("args: agent.args");
		expect(listSource).toContain("env: agent.env");
		expect(SOURCE).toContain("Claude Code");
		expect(SOURCE).not.toContain("ACP Chat");
		expect(SOURCE).not.toContain("Superset ACP");
	});

	test("lists mobile terminal presets from the host terminal preset route", () => {
		const listIndex = SOURCE.indexOf("listTerminalPresets: protectedProcedure");
		expect(listIndex).toBeGreaterThan(0);

		const listSource = SOURCE.slice(listIndex, listIndex + 2400);
		expect(listSource).toContain("getWorkspaceHostControlAccess");
		expect(listSource).toContain("buildHostRoutingKey");
		expect(listSource).toContain('"settings.terminalPresets.list"');
		expect(listSource).toContain("HostTerminalPresetSummary");
		expect(listSource).not.toContain('"settings.agentConfigs.list"');
	});

	test("passes mobile ACP file attachments through chat.sendMessage", () => {
		const sendIndex = SOURCE.indexOf('"chat.sendMessage"');
		expect(sendIndex).toBeGreaterThan(0);

		const aroundSend = SOURCE.slice(
			Math.max(0, sendIndex - 1800),
			sendIndex + 900,
		);
		expect(aroundSend).toContain("files: z");
		expect(aroundSend).toContain("data: z.string().min(1)");
		expect(aroundSend).toContain("mediaType: z.string().min(1)");
		expect(aroundSend).toContain("filename: z.string().optional()");
		expect(aroundSend).toContain(
			"payload: { content: input.content, files: input.files }",
		);
	});

	test("keeps the mobile ACP snapshot message role type aligned with persisted signal turns", () => {
		expect(SOURCE).toContain('role: "user" | "signal" | "assistant";');
		expect(SOURCE).not.toContain('role: "user" | "assistant";');
	});

	test("maps relay transport failures to a recoverable unavailable state", () => {
		expect(SOURCE).toContain("isRelayTransportError");
		expect(SOURCE).toContain('"fetch failed"');
		expect(SOURCE).toContain('"PRECONDITION_FAILED"');
		expect(SOURCE).toContain("Relay is unavailable");
	});

	test("exposes mobile ACP chat lifecycle and blocking-response controls", () => {
		for (const procedure of [
			'"chat.stop"',
			'"chat.endSession"',
			'"chat.respondToApproval"',
			'"chat.respondToQuestion"',
			'"chat.respondToPlan"',
		]) {
			const index = SOURCE.indexOf(procedure);
			expect(index).toBeGreaterThan(0);
			const before = SOURCE.slice(Math.max(0, index - 3200), index);
			expect(before).toContain("getWorkspaceHostControlAccess");
			expect(before).toContain("getOwnedWorkspaceChatSession");
			expect(before).toContain("withHostWorkspaceRecovery");
		}

		for (const procedure of [
			"stopChatSession",
			"endChatSession",
			"respondToChatApproval",
			"respondToChatQuestion",
			"respondToChatPlan",
		]) {
			expect(SOURCE).toContain(`${procedure}: protectedProcedure`);
		}

		const controlsStart = SOURCE.indexOf("stopChatSession: protectedProcedure");
		const controlsEnd = SOURCE.indexOf("listChatModels: protectedProcedure");
		const controlsSource = SOURCE.slice(controlsStart, controlsEnd);
		expect(controlsSource).toContain("WorkspaceChatControlResult");
		expect(controlsSource).toContain("return { ok: true }");
	});
});
