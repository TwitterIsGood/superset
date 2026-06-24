import type {
	TerminalDimensions,
	TerminalScreenSnapshot,
} from "../../../TerminalEmulator";
import {
	replayableInitialTerminalSnapshot,
	terminalTailDelta,
} from "../terminalTailDelta";

type TerminalDimensionRecord = Partial<
	Pick<TerminalDimensions, "cols" | "rows">
>;

export type TerminalSnapshotMergeRun = {
	terminalId: string;
	terminalDimensions: TerminalDimensions | null;
	outputTail: string;
	screenSnapshot: TerminalScreenSnapshot | null;
	restoreRevision: number;
	hasLoadedSnapshot: boolean;
	suppressReplayUntilDelta: boolean;
	usesScreenSnapshotBaseline: boolean;
	exited: boolean;
	exitCode: number | null;
	errorMessage: string | null;
};

export type TerminalSnapshotMergeSnapshot = TerminalDimensionRecord & {
	outputTail: string;
	screenSnapshot?: TerminalScreenSnapshot | null;
	exited: boolean;
	exitCode?: number | null;
};

export type TerminalSnapshotMergeOptions = {
	previousRawTail: string | undefined;
	replayInitialSnapshot?: boolean;
	refreshScreenSnapshot?: boolean;
};

export type TerminalSnapshotMergeResult<
	Run extends TerminalSnapshotMergeRun = TerminalSnapshotMergeRun,
> = {
	run: Run;
	nextRawTail: string;
};

export function terminalDimensionsFromRecord(
	value: TerminalDimensionRecord,
): TerminalDimensions | null {
	const cols = value.cols;
	const rows = value.rows;
	if (
		typeof cols !== "number" ||
		typeof rows !== "number" ||
		!Number.isInteger(cols) ||
		!Number.isInteger(rows) ||
		cols <= 0 ||
		rows <= 0
	) {
		return null;
	}

	return {
		cols,
		rows,
	};
}

export function mergeTerminalSnapshotState<
	Run extends TerminalSnapshotMergeRun,
>(
	current: Run,
	snapshot: TerminalSnapshotMergeSnapshot,
	options: TerminalSnapshotMergeOptions,
): TerminalSnapshotMergeResult<Run> {
	const replayInitialSnapshot = options.replayInitialSnapshot ?? true;
	const refreshScreenSnapshot = options.refreshScreenSnapshot ?? false;
	const previousRawTail = options.previousRawTail;
	const delta = terminalTailDelta(previousRawTail, snapshot.outputTail);
	const screenSnapshot = snapshot.screenSnapshot ?? null;
	const terminalDimensions =
		(screenSnapshot ? terminalDimensionsFromRecord(screenSnapshot) : null) ??
		terminalDimensionsFromRecord(snapshot) ??
		current.terminalDimensions;
	const nextRawTail = snapshot.outputTail;

	if (screenSnapshot) {
		const shouldRestoreScreenSnapshot =
			replayInitialSnapshot ||
			refreshScreenSnapshot ||
			!current.hasLoadedSnapshot ||
			!current.usesScreenSnapshotBaseline;
		if (shouldRestoreScreenSnapshot) {
			const sameRenderedContent = current.outputTail === screenSnapshot.content;
			const snapshotDimensionsChanged =
				current.screenSnapshot?.cols !== screenSnapshot.cols ||
				current.screenSnapshot?.rows !== screenSnapshot.rows;
			const shouldForceRestore =
				sameRenderedContent &&
				(!current.usesScreenSnapshotBaseline || snapshotDimensionsChanged);
			return {
				nextRawTail,
				run: {
					...current,
					terminalDimensions,
					outputTail: screenSnapshot.content,
					screenSnapshot,
					restoreRevision: shouldForceRestore
						? current.restoreRevision + 1
						: current.restoreRevision,
					hasLoadedSnapshot: true,
					suppressReplayUntilDelta: false,
					usesScreenSnapshotBaseline: true,
					exited: snapshot.exited,
					exitCode: snapshot.exitCode ?? null,
					errorMessage: null,
				} as Run,
			};
		}

		return {
			nextRawTail,
			run: {
				...current,
				terminalDimensions,
				hasLoadedSnapshot: true,
				suppressReplayUntilDelta: false,
				usesScreenSnapshotBaseline: true,
				exited: snapshot.exited,
				exitCode: snapshot.exitCode ?? null,
				errorMessage: null,
			} as Run,
		};
	}

	if (current.usesScreenSnapshotBaseline) {
		return {
			nextRawTail,
			run: {
				...current,
				terminalDimensions,
				hasLoadedSnapshot: true,
				suppressReplayUntilDelta: false,
				usesScreenSnapshotBaseline: true,
				exited: snapshot.exited,
				exitCode: snapshot.exitCode ?? null,
				errorMessage: null,
			} as Run,
		};
	}

	if (current.suppressReplayUntilDelta) {
		if (previousRawTail === undefined) {
			const replayableSnapshot = replayInitialSnapshot
				? replayableInitialTerminalSnapshot(snapshot.outputTail)
				: null;
			return {
				nextRawTail,
				run: {
					...current,
					terminalDimensions,
					outputTail: replayableSnapshot ?? current.outputTail,
					screenSnapshot: null,
					restoreRevision: current.restoreRevision,
					hasLoadedSnapshot: true,
					suppressReplayUntilDelta: replayableSnapshot === null,
					usesScreenSnapshotBaseline: false,
					exited: snapshot.exited,
					exitCode: snapshot.exitCode ?? null,
					errorMessage: null,
				} as Run,
			};
		}

		if (delta.length > 0) {
			const replayableDeltaSnapshot = replayableInitialTerminalSnapshot(delta);
			if (replayableDeltaSnapshot !== null) {
				const shouldReplaceFromHardReset = replayableDeltaSnapshot !== delta;
				return {
					nextRawTail,
					run: {
						...current,
						terminalDimensions,
						outputTail: shouldReplaceFromHardReset
							? replayableDeltaSnapshot
							: current.outputTail + delta,
						screenSnapshot: null,
						restoreRevision: shouldReplaceFromHardReset
							? current.restoreRevision + 1
							: current.restoreRevision,
						hasLoadedSnapshot: true,
						suppressReplayUntilDelta: false,
						usesScreenSnapshotBaseline: false,
						exited: snapshot.exited,
						exitCode: snapshot.exitCode ?? null,
						errorMessage: null,
					} as Run,
				};
			}

			return {
				nextRawTail,
				run: {
					...current,
					terminalDimensions,
					screenSnapshot: null,
					restoreRevision: current.restoreRevision,
					hasLoadedSnapshot: true,
					suppressReplayUntilDelta: true,
					usesScreenSnapshotBaseline: false,
					exited: snapshot.exited,
					exitCode: snapshot.exitCode ?? null,
					errorMessage: null,
				} as Run,
			};
		}

		return {
			nextRawTail,
			run: {
				...current,
				terminalDimensions,
				screenSnapshot: null,
				restoreRevision: current.restoreRevision,
				hasLoadedSnapshot: true,
				usesScreenSnapshotBaseline: false,
				exited: snapshot.exited,
				exitCode: snapshot.exitCode ?? null,
				errorMessage: null,
			} as Run,
		};
	}

	return {
		nextRawTail,
		run: {
			...current,
			terminalDimensions,
			outputTail:
				previousRawTail === undefined
					? snapshot.outputTail
					: current.outputTail + delta,
			screenSnapshot: null,
			restoreRevision: current.restoreRevision,
			hasLoadedSnapshot: true,
			usesScreenSnapshotBaseline: false,
			exited: snapshot.exited,
			exitCode: snapshot.exitCode ?? null,
			errorMessage: null,
		} as Run,
	};
}
