import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { AgentLifecycleEvent } from "shared/notification-types";

type TaskStatusType =
	| "started"
	| "completed"
	| "canceled"
	| "unstarted"
	| "backlog";

type TaskAgentWriteback = {
	paneId: string;
	workspaceId: string;
	taskId: string;
	taskPromptFileName: string;
	initialStatusType: TaskStatusType | null;
};

const taskWritebacksByPaneId = new Map<string, TaskAgentWriteback>();

function joinAbsolutePath(parentAbsolutePath: string, name: string): string {
	const separator = parentAbsolutePath.includes("\\") ? "\\" : "/";
	return `${parentAbsolutePath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function getSafePromptFileName(fileName: string): string | null {
	const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
	if (!baseName || baseName !== fileName || fileName.includes("..")) {
		return null;
	}
	return baseName;
}

function parseTaskId(promptContent: string): string | null {
	const match = promptContent.match(/update task "([^"]+)"/i);
	return match?.[1] ?? null;
}

function parseStatusType(content: string): TaskStatusType | null {
	const match = content.match(/^Status:\s*(.+)$/im);
	const status = match?.[1]?.trim().toLowerCase();
	if (!status) return null;

	if (["done", "completed", "complete"].includes(status)) return "completed";
	if (["in progress", "started", "running"].includes(status)) return "started";
	if (["todo", "to do", "unstarted"].includes(status)) return "unstarted";
	if (status === "backlog") return "backlog";
	if (["canceled", "cancelled"].includes(status)) return "canceled";

	return null;
}

async function readTaskPromptFile(
	writeback: TaskAgentWriteback,
): Promise<string | null> {
	const workspace = await electronTrpcClient.workspaces.get.query({
		id: writeback.workspaceId,
	});
	if (!workspace?.worktreePath) return null;

	const result = await electronTrpcClient.filesystem.readFile.query({
		workspaceId: writeback.workspaceId,
		absolutePath: joinAbsolutePath(
			joinAbsolutePath(workspace.worktreePath, ".superset"),
			writeback.taskPromptFileName,
		),
		encoding: "utf-8",
		maxBytes: 64 * 1024,
	});

	return result.kind === "text" ? result.content : null;
}

async function updateLocalTaskStatus({
	taskId,
	statusType,
}: {
	taskId: string;
	statusType: TaskStatusType;
}): Promise<boolean> {
	const task = await electronTrpcClient.tasksLocal.byId.query(taskId);
	if (!task) return false;

	const statuses =
		await electronTrpcClient.tasksLocal.ensureDefaultStatuses.mutate({
			organizationId: task.organizationId,
		});
	const currentStatus = statuses.find((status) => status.id === task.statusId);
	if (
		statusType === "started" &&
		(currentStatus?.type === "completed" || currentStatus?.type === "canceled")
	) {
		return false;
	}
	const status = statuses.find((candidate) => candidate.type === statusType);
	if (!status) return false;

	await electronTrpcClient.tasksLocal.update.mutate({
		id: taskId,
		changes: {
			statusId: status.id,
			...(statusType === "started" && !task.startedAt
				? { startedAt: new Date() }
				: {}),
			...(statusType === "completed" ? { completedAt: new Date() } : {}),
		},
	});

	return true;
}

export function registerTaskAgentWriteback({
	paneId,
	workspaceId,
	taskPromptContent,
	taskPromptFileName,
}: {
	paneId: string | null | undefined;
	workspaceId: string;
	taskPromptContent: string | undefined;
	taskPromptFileName: string | undefined;
}): void {
	if (!paneId || !taskPromptContent || !taskPromptFileName) return;

	const safePromptFileName = getSafePromptFileName(taskPromptFileName);
	const taskId = parseTaskId(taskPromptContent);
	if (!safePromptFileName || !taskId) return;

	taskWritebacksByPaneId.set(paneId, {
		paneId,
		workspaceId,
		taskId,
		taskPromptFileName: safePromptFileName,
		initialStatusType: parseStatusType(taskPromptContent),
	});

	void updateLocalTaskStatus({ taskId, statusType: "started" }).catch(
		(error) => {
			console.error(
				"[task-agent-writeback] Failed to mark task started:",
				error,
			);
		},
	);
}

export async function syncTaskAgentWritebackOnStop(
	event: AgentLifecycleEvent,
): Promise<void> {
	if (event.eventType !== "Stop" || !event.paneId) return;

	const writeback = taskWritebacksByPaneId.get(event.paneId);
	if (!writeback) return;
	if (event.workspaceId && event.workspaceId !== writeback.workspaceId) return;

	try {
		const content = await readTaskPromptFile(writeback);
		if (!content) return;

		const statusType = parseStatusType(content);
		if (!statusType || statusType === writeback.initialStatusType) return;

		await updateLocalTaskStatus({
			taskId: writeback.taskId,
			statusType,
		});
	} finally {
		taskWritebacksByPaneId.delete(event.paneId);
	}
}
