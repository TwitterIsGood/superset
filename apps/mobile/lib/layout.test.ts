/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
	getBottomOverlayListFooterHeight,
	getBottomOverlayScrollPadding,
} from "./layout";

describe("getBottomOverlayScrollPadding", () => {
	test("reserves bottom tab-bar height plus a visible end-of-list gap", () => {
		expect(getBottomOverlayScrollPadding(0)).toBe(92);
		expect(getBottomOverlayScrollPadding(34)).toBe(126);
	});

	test("adds enough trailing spacer for bottom-of-list screenshots", () => {
		expect(getBottomOverlayListFooterHeight(0)).toBe(140);
		expect(getBottomOverlayListFooterHeight(34)).toBe(174);
	});
});
