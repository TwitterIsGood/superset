const FLOATING_BOTTOM_OVERLAY_HEIGHT = 76;
const BOTTOM_OVERLAY_GAP = 16;
const END_OF_LIST_VISIBLE_GAP = 48;

export function getBottomOverlayScrollPadding(safeAreaBottom: number): number {
	return safeAreaBottom + FLOATING_BOTTOM_OVERLAY_HEIGHT + BOTTOM_OVERLAY_GAP;
}

export function getBottomOverlayListFooterHeight(
	safeAreaBottom: number,
): number {
	return (
		getBottomOverlayScrollPadding(safeAreaBottom) + END_OF_LIST_VISIBLE_GAP
	);
}
