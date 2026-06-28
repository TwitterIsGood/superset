import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

function createEventBus(): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => "/tmp/missing-workspace",
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
	});
}

describe("EventBus port events", () => {
	it("broadcasts port changes from the shared port manager and removes listeners on close", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		const port: DetectedPort = {
			port: 5173,
			pid: 123,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 1_700_000_000_000,
			address: "127.0.0.1",
		};

		eventBus.handleOpen(socket);
		eventBus.start();
		eventBus.start();
		portManager.emit("port:add", port);

		expect(sentMessages).toHaveLength(1);
		const message = JSON.parse(sentMessages[0] ?? "{}");
		expect(message).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "add",
			port,
			label: null,
		});
		expect(typeof message.occurredAt).toBe("number");

		portManager.emit("port:remove", port);
		expect(sentMessages).toHaveLength(2);
		expect(JSON.parse(sentMessages[1] ?? "{}")).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "remove",
			port,
			label: null,
		});

		eventBus.close();
		portManager.emit("port:add", port);
		expect(sentMessages).toHaveLength(2);
	});

	it("broadcasts project creation progress by request id", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};

		eventBus.handleOpen(socket);
		eventBus.broadcastProjectCreateProgress({
			requestId: "project-create-1",
			stage: "canceled",
			message: "Clone stopped",
			percent: null,
			occurredAt: 1_700_000_000_000,
		});

		expect(sentMessages).toHaveLength(1);
		expect(JSON.parse(sentMessages[0] ?? "{}")).toMatchObject({
			type: "project:create-progress",
			requestId: "project-create-1",
			stage: "canceled",
			message: "Clone stopped",
			percent: null,
			occurredAt: 1_700_000_000_000,
		});
	});

	it("targets subscribed workspace events while keeping legacy sockets on broadcast", () => {
		const eventBus = createEventBus();
		const workspaceOneMessages: string[] = [];
		const workspaceTwoMessages: string[] = [];
		const legacyMessages: string[] = [];
		const socketForWorkspaceOne = {
			readyState: 1,
			send(data: string) {
				workspaceOneMessages.push(data);
			},
			close() {},
		};
		const socketForWorkspaceTwo = {
			readyState: 1,
			send(data: string) {
				workspaceTwoMessages.push(data);
			},
			close() {},
		};
		const legacySocket = {
			readyState: 1,
			send(data: string) {
				legacyMessages.push(data);
			},
			close() {},
		};
		const port: DetectedPort = {
			port: 5173,
			pid: 123,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 1_700_000_000_000,
			address: "127.0.0.1",
		};

		eventBus.handleOpen(socketForWorkspaceOne);
		eventBus.handleOpen(socketForWorkspaceTwo);
		eventBus.handleOpen(legacySocket);
		eventBus.handleMessage(
			socketForWorkspaceOne,
			JSON.stringify({
				type: "subscribe",
				event: "port:changed",
				workspaceId: "workspace-1",
			}),
		);
		eventBus.handleMessage(
			socketForWorkspaceTwo,
			JSON.stringify({
				type: "subscribe",
				event: "port:changed",
				workspaceId: "workspace-2",
			}),
		);
		eventBus.start();
		portManager.emit("port:add", port);

		expect(workspaceOneMessages).toHaveLength(1);
		expect(workspaceTwoMessages).toHaveLength(0);
		expect(legacyMessages).toHaveLength(1);
		expect(JSON.parse(workspaceOneMessages[0] ?? "{}")).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
		});

		eventBus.handleMessage(
			socketForWorkspaceOne,
			JSON.stringify({
				type: "unsubscribe",
				event: "port:changed",
				workspaceId: "workspace-1",
			}),
		);
		portManager.emit("port:add", port);

		expect(workspaceOneMessages).toHaveLength(1);
		expect(legacyMessages).toHaveLength(2);
		eventBus.close();
	});
});
