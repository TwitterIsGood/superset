import type { TerminalLogEntry } from "./terminal-runtime-registry";

type TerminalRuntimeRegistryModule =
	typeof import("./terminal-runtime-registry");

let runtimeRegistryModulePromise: Promise<TerminalRuntimeRegistryModule> | null =
	null;
let runtimeRegistryModule: TerminalRuntimeRegistryModule | null = null;

function loadTerminalRuntimeRegistry(): Promise<TerminalRuntimeRegistryModule> {
	runtimeRegistryModulePromise ??= import("./terminal-runtime-registry").then(
		(module) => {
			runtimeRegistryModule = module;
			return module;
		},
	);
	return runtimeRegistryModulePromise;
}

export function subscribeTerminalTitleLazy({
	terminalId,
	instanceId,
	callback,
}: {
	terminalId: string;
	instanceId: string;
	callback: () => void;
}): () => void {
	let disposed = false;
	let unsubscribe: (() => void) | null = null;

	void loadTerminalRuntimeRegistry().then((module) => {
		if (disposed) return;
		unsubscribe = module.terminalRuntimeRegistry.onTitleChange(
			terminalId,
			callback,
			instanceId,
		);
		callback();
	});

	return () => {
		disposed = true;
		unsubscribe?.();
	};
}

export function getTerminalTitleSnapshotLazy({
	terminalId,
	instanceId,
}: {
	terminalId: string;
	instanceId: string;
}): string | undefined {
	return (
		runtimeRegistryModule?.terminalRuntimeRegistry
			.getTitle(terminalId, instanceId)
			?.trim() || undefined
	);
}

export async function releaseTerminalRuntimeLazy(
	terminalId: string,
	instanceId?: string,
): Promise<void> {
	const module = await loadTerminalRuntimeRegistry();
	module.terminalRuntimeRegistry.release(terminalId, instanceId);
}

export async function disposeTerminalRuntimeLazy(
	terminalId: string,
): Promise<void> {
	const module = await loadTerminalRuntimeRegistry();
	module.terminalRuntimeRegistry.dispose(terminalId);
}

export async function getTerminalSelectionLazy(
	terminalId: string,
	instanceId?: string,
): Promise<string> {
	const module = await loadTerminalRuntimeRegistry();
	return module.terminalRuntimeRegistry.getSelection(terminalId, instanceId);
}

export async function pasteTerminalLazy(
	terminalId: string,
	text: string,
	instanceId?: string,
): Promise<void> {
	const module = await loadTerminalRuntimeRegistry();
	module.terminalRuntimeRegistry.paste(terminalId, text, instanceId);
}

export async function clearTerminalLazy(
	terminalId: string,
	instanceId?: string,
): Promise<void> {
	const module = await loadTerminalRuntimeRegistry();
	module.terminalRuntimeRegistry.clear(terminalId, instanceId);
}

export async function scrollTerminalToBottomLazy(
	terminalId: string,
	instanceId?: string,
): Promise<void> {
	const module = await loadTerminalRuntimeRegistry();
	module.terminalRuntimeRegistry.scrollToBottom(terminalId, instanceId);
}

export async function getTerminalLogsLazy(
	terminalId: string,
	instanceId?: string,
): Promise<readonly TerminalLogEntry[]> {
	const module = await loadTerminalRuntimeRegistry();
	return module.terminalRuntimeRegistry.getLogs(terminalId, instanceId);
}
