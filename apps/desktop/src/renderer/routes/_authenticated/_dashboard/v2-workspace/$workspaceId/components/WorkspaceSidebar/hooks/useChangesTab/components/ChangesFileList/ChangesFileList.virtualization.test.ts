import { describe, expect, test } from "bun:test";

const changesFileListSource = await Bun.file(
	new URL("./ChangesFileList.tsx", import.meta.url),
).text();
const changesFoldersViewSource = await Bun.file(
	new URL(
		"./components/ChangesFoldersView/ChangesFoldersView.tsx",
		import.meta.url,
	),
).text();
const changesTreeViewSource = await Bun.file(
	new URL("./components/ChangesTreeView/ChangesTreeView.tsx", import.meta.url),
).text();

describe("ChangesFileList virtualization", () => {
	test("uses a shared changes scroll container and virtualized folder rows", () => {
		expect(changesFileListSource).toContain("data-changes-scroll-container");
		expect(changesFoldersViewSource).toContain("useVirtualizer");
		expect(changesFoldersViewSource).toContain("listRef.current?.closest");
		expect(changesFoldersViewSource).toContain(
			"[data-changes-scroll-container]",
		);
		expect(changesFoldersViewSource).toContain("virtualizer.getVirtualItems()");
		expect(changesFoldersViewSource).not.toContain("groups.map((group)");
	});

	test("keeps Pierre tree mode and starts large changesets collapsed", () => {
		expect(changesTreeViewSource).toContain("usePierreFileTree");
		expect(changesTreeViewSource).toContain(
			"LARGE_CHANGESET_TREE_COLLAPSE_THRESHOLD = 500",
		);
		expect(changesTreeViewSource).toContain(
			'initialExpansion: shouldStartCollapsed ? "closed" : "open"',
		);
		expect(changesTreeViewSource).not.toContain("flattenVisibleRows");
	});
});
