import { describe, expect, test } from "bun:test";
import {
	clearTerminalAutoAttachSuppression,
	clearTerminalBackgroundMarker,
	getTerminalAutoAttachSuppressionIdsKey,
	getTerminalBackgroundMarkerIdsKey,
	markTerminalForBackground,
	suppressTerminalAutoAttachAfterExplicitClose,
} from "./terminal-background-intents";

describe("terminal background intents", () => {
	test("keeps explicit-close auto-attach suppressions separate from background markers", () => {
		const workspaceId = "ws-explicit-close-suppression";

		suppressTerminalAutoAttachAfterExplicitClose(workspaceId, "term-b", 10_000);
		suppressTerminalAutoAttachAfterExplicitClose(workspaceId, "term-a", 10_000);

		expect(getTerminalAutoAttachSuppressionIdsKey(workspaceId)).toBe(
			'["term-a","term-b"]',
		);
		expect(getTerminalBackgroundMarkerIdsKey(workspaceId)).toBe("[]");

		clearTerminalAutoAttachSuppression(workspaceId, "term-a");
		expect(getTerminalAutoAttachSuppressionIdsKey(workspaceId)).toBe(
			'["term-b"]',
		);

		clearTerminalAutoAttachSuppression(workspaceId, "term-b");
		expect(getTerminalAutoAttachSuppressionIdsKey(workspaceId)).toBe("[]");
	});

	test("does not hide intentionally backgrounded terminals from the background marker key", () => {
		const workspaceId = "ws-background-marker";

		markTerminalForBackground("term-background", workspaceId);
		suppressTerminalAutoAttachAfterExplicitClose(
			workspaceId,
			"term-closed",
			10_000,
		);

		expect(getTerminalBackgroundMarkerIdsKey(workspaceId)).toBe(
			'["term-background"]',
		);
		expect(getTerminalAutoAttachSuppressionIdsKey(workspaceId)).toBe(
			'["term-closed"]',
		);

		clearTerminalBackgroundMarker(workspaceId, "term-background");
		clearTerminalAutoAttachSuppression(workspaceId, "term-closed");
	});
});
