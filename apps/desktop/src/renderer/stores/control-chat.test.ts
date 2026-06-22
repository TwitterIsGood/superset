import { beforeEach, describe, expect, it } from "bun:test";
import {
	CONTROL_CHAT_DEFAULT_HEIGHT,
	CONTROL_CHAT_DEFAULT_WIDTH,
	CONTROL_CHAT_EXPANDED_HEIGHT,
	CONTROL_CHAT_EXPANDED_WIDTH,
	useControlChatStore,
} from "./control-chat";

beforeEach(() => {
	useControlChatStore.setState({
		isOpen: false,
		isExpanded: false,
		activeSessionId: null,
		isCreatingNewSession: false,
		width: CONTROL_CHAT_DEFAULT_WIDTH,
		height: CONTROL_CHAT_DEFAULT_HEIGHT,
	});
});

describe("control-chat store", () => {
	it("opens and closes the floating panel", () => {
		useControlChatStore.getState().open();
		expect(useControlChatStore.getState().isOpen).toBe(true);

		useControlChatStore.getState().close();
		expect(useControlChatStore.getState().isOpen).toBe(false);
	});

	it("persists the active cloud session id locally", () => {
		useControlChatStore
			.getState()
			.setActiveSessionId("11111111-1111-4111-8111-111111111111");
		expect(useControlChatStore.getState().activeSessionId).toBe(
			"11111111-1111-4111-8111-111111111111",
		);
	});

	it("keeps explicit new chat state separate from no restored session", () => {
		useControlChatStore
			.getState()
			.setActiveSessionId("11111111-1111-4111-8111-111111111111");

		useControlChatStore.getState().startNewSession();
		expect(useControlChatStore.getState().activeSessionId).toBeNull();
		expect(useControlChatStore.getState().isCreatingNewSession).toBe(true);

		useControlChatStore
			.getState()
			.setActiveSessionId("22222222-2222-4222-8222-222222222222");
		expect(useControlChatStore.getState().isCreatingNewSession).toBe(false);
	});

	it("toggles between compact and expanded dimensions", () => {
		useControlChatStore.getState().toggleExpanded();
		expect(useControlChatStore.getState().isExpanded).toBe(true);
		expect(useControlChatStore.getState().width).toBe(
			CONTROL_CHAT_EXPANDED_WIDTH,
		);
		expect(useControlChatStore.getState().height).toBe(
			CONTROL_CHAT_EXPANDED_HEIGHT,
		);

		useControlChatStore.getState().toggleExpanded();
		expect(useControlChatStore.getState().isExpanded).toBe(false);
		expect(useControlChatStore.getState().width).toBe(
			CONTROL_CHAT_DEFAULT_WIDTH,
		);
		expect(useControlChatStore.getState().height).toBe(
			CONTROL_CHAT_DEFAULT_HEIGHT,
		);
	});

	it("clamps manual resize dimensions", () => {
		useControlChatStore.getState().setSize({ width: 100, height: 2000 });
		expect(useControlChatStore.getState().width).toBe(360);
		expect(useControlChatStore.getState().height).toBe(900);
	});
});
