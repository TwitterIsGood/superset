import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { FoldSignal } from "../../ChangesFileList";
import { FileRow } from "../FileRow";
import { FolderHeader } from "./components/FolderHeader";

const ROOT_FOLDER_KEY = "";
const ROOT_FOLDER_LABEL = "Root Path";
const ESTIMATED_ROW_HEIGHT = 24;
const OVERSCAN = 12;
const LARGE_FOLDER_DERIVATION_THRESHOLD = 500;

interface ChangesFoldersViewProps {
	files: ChangesetFile[];
	workspaceId: string;
	worktreePath?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

interface FolderGroup {
	folderPath: string;
	files: ChangesetFile[];
}

type FolderVirtualRow =
	| { kind: "folder"; key: string; group: FolderGroup; isRoot: boolean }
	| { kind: "file"; key: string; file: ChangesetFile; group: FolderGroup };

interface FolderViewModel {
	groups: FolderGroup[];
	rowsByClosedKey: Map<string, FolderVirtualRow[]>;
}

const folderViewModelCache = new WeakMap<ChangesetFile[], FolderViewModel>();

/**
 * Render a flat list of changed files grouped by their immediate parent
 * folder (one level deep — v1's "grouped" mode, not the full tree).
 *
 * Differences from v1's `FileListGrouped`:
 *  - Collapse state tracked as a *closed* set, so folders that newly appear
 *    in the changeset default to open (v1 tracked an *expanded* set keyed by
 *    folder path, so a folder that didn't exist on first render stayed
 *    collapsed when it appeared later).
 *  - Per-folder bulk Stage/Unstage/Discard intentionally not ported —
 *    section-level bulk actions already cover the common case, and the
 *    per-folder buttons crowd the header.
 */
export const ChangesFoldersView = memo(function ChangesFoldersView({
	files,
	workspaceId,
	worktreePath,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFoldersViewProps) {
	const shouldDeferDerivation =
		files.length >= LARGE_FOLDER_DERIVATION_THRESHOLD &&
		!folderViewModelCache.has(files);
	const [deferredViewModel, setDeferredViewModel] =
		useState<FolderViewModel | null>(
			() => folderViewModelCache.get(files) ?? null,
		);

	useEffect(() => {
		const cached = folderViewModelCache.get(files);
		if (cached || files.length < LARGE_FOLDER_DERIVATION_THRESHOLD) {
			setDeferredViewModel(cached ?? null);
			return;
		}

		let cancelled = false;
		const schedule =
			typeof window.requestIdleCallback === "function"
				? window.requestIdleCallback
				: (callback: IdleRequestCallback) =>
						window.setTimeout(
							() =>
								callback({
									didTimeout: true,
									timeRemaining: () => 0,
								} as IdleDeadline),
							0,
						);
		const cancel =
			typeof window.cancelIdleCallback === "function"
				? window.cancelIdleCallback
				: window.clearTimeout;

		const handle = schedule(
			() => {
				if (cancelled) return;
				const next = getFolderViewModel(files);
				if (!cancelled) setDeferredViewModel(next);
			},
			{ timeout: 250 },
		);

		return () => {
			cancelled = true;
			cancel(handle);
		};
	}, [files]);

	const immediateViewModel = useMemo(
		() =>
			shouldDeferDerivation || deferredViewModel
				? null
				: getFolderViewModel(files),
		[deferredViewModel, files, shouldDeferDerivation],
	);
	const viewModel = deferredViewModel ?? immediateViewModel;
	const listRef = useRef<HTMLDivElement>(null);
	const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
	const closedFoldersKey = useMemo(
		() => serializeClosedFolders(closedFolders),
		[closedFolders],
	);

	const toggleFolder = useCallback((folderPath: string) => {
		setClosedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(folderPath)) next.delete(folderPath);
			else next.add(folderPath);
			return next;
		});
	}, []);

	// React to expand-all / collapse-all from the toolbar — but only on a new
	// signal, not when `groups` changes (which would re-apply the last action
	// and stomp any folder the user re-toggled in between).
	const lastFoldEpochRef = useRef(0);
	useEffect(() => {
		if (foldSignal.epoch === 0 || foldSignal.epoch === lastFoldEpochRef.current)
			return;
		if (!viewModel) return;
		lastFoldEpochRef.current = foldSignal.epoch;
		setClosedFolders(
			foldSignal.action === "collapse"
				? new Set(viewModel.groups.map((g) => g.folderPath))
				: new Set(),
		);
	}, [foldSignal, viewModel]);

	const rows = useMemo<FolderVirtualRow[]>(() => {
		if (!viewModel) return [];
		const cached = viewModel.rowsByClosedKey.get(closedFoldersKey);
		if (cached) return cached;
		const nextRows = buildFolderRows(viewModel.groups, closedFolders);
		viewModel.rowsByClosedKey.set(closedFoldersKey, nextRows);
		return nextRows;
	}, [closedFolders, closedFoldersKey, viewModel]);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getItemKey: (index) => rows[index]?.key ?? `missing:${index}`,
		getScrollElement: () =>
			listRef.current?.closest(
				"[data-changes-scroll-container]",
			) as HTMLElement | null,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		rangeExtractor: defaultRangeExtractor,
		overscan: OVERSCAN,
		scrollMargin: listRef.current?.offsetTop ?? 0,
	});
	const virtualItems = virtualizer.getVirtualItems();

	if (!viewModel) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				Preparing folders...
			</div>
		);
	}

	return (
		<div ref={listRef}>
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualItems.map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) return null;

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 w-full"
							style={{
								top: virtualRow.start - (virtualizer.options.scrollMargin ?? 0),
							}}
						>
							{row.kind === "folder" ? (
								<FolderHeader
									label={row.isRoot ? ROOT_FOLDER_LABEL : row.group.folderPath}
									fileCount={row.group.files.length}
									isOpen={!closedFolders.has(row.group.folderPath)}
									onToggle={() => toggleFolder(row.group.folderPath)}
								/>
							) : (
								<FileRow
									file={row.file}
									workspaceId={workspaceId}
									worktreePath={worktreePath}
									hideDir
									onSelect={onSelectFile}
									onOpenFile={onOpenFile}
									onOpenInEditor={onOpenInEditor}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
});

function getFolderViewModel(files: ChangesetFile[]): FolderViewModel {
	const cached = folderViewModelCache.get(files);
	if (cached) return cached;

	const groups = groupFilesByFolder(files);
	const viewModel: FolderViewModel = {
		groups,
		rowsByClosedKey: new Map([
			[serializeClosedFolders(new Set()), buildFolderRows(groups, new Set())],
		]),
	};
	folderViewModelCache.set(files, viewModel);
	return viewModel;
}

function buildFolderRows(
	groups: FolderGroup[],
	closedFolders: ReadonlySet<string>,
): FolderVirtualRow[] {
	const nextRows: FolderVirtualRow[] = [];
	for (const group of groups) {
		const isRoot = group.folderPath === ROOT_FOLDER_KEY;
		nextRows.push({
			kind: "folder",
			key: `folder:${isRoot ? "__root__" : group.folderPath}`,
			group,
			isRoot,
		});
		if (closedFolders.has(group.folderPath)) continue;
		for (const file of group.files) {
			nextRows.push({
				kind: "file",
				key: `file:${file.source.kind}:${file.path}`,
				file,
				group,
			});
		}
	}
	return nextRows;
}

function serializeClosedFolders(closedFolders: ReadonlySet<string>): string {
	if (closedFolders.size === 0) return "";
	return Array.from(closedFolders).sort().join("\n");
}

function groupFilesByFolder(files: ChangesetFile[]): FolderGroup[] {
	const map = new Map<string, ChangesetFile[]>();
	for (const file of files) {
		const lastSlash = file.path.lastIndexOf("/");
		const folderPath =
			lastSlash >= 0 ? file.path.slice(0, lastSlash) : ROOT_FOLDER_KEY;
		const group = map.get(folderPath);
		if (group) group.push(file);
		else map.set(folderPath, [file]);
	}
	return Array.from(map.entries())
		.map(([folderPath, groupFiles]) => ({
			folderPath,
			files: groupFiles.sort((a, b) =>
				basenameOf(a.path).localeCompare(basenameOf(b.path)),
			),
		}))
		.sort((a, b) => {
			// Root-level files come first so they read like the top of a tree.
			if (a.folderPath === ROOT_FOLDER_KEY)
				return b.folderPath === ROOT_FOLDER_KEY ? 0 : -1;
			if (b.folderPath === ROOT_FOLDER_KEY) return 1;
			return a.folderPath.localeCompare(b.folderPath);
		});
}

function basenameOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? path : path.slice(i + 1);
}
