import { create } from "zustand";
import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from "zustand/middleware";

export const CONTROL_CHAT_DEFAULT_WIDTH = 420;
export const CONTROL_CHAT_DEFAULT_HEIGHT = 620;
export const CONTROL_CHAT_EXPANDED_WIDTH = 720;
export const CONTROL_CHAT_EXPANDED_HEIGHT = 760;

interface ControlChatState {
	isOpen: boolean;
	isExpanded: boolean;
	activeSessionId: string | null;
	isCreatingNewSession: boolean;
	width: number;
	height: number;
	open: () => void;
	close: () => void;
	toggleOpen: () => void;
	toggleExpanded: () => void;
	setActiveSessionId: (sessionId: string | null) => void;
	startNewSession: () => void;
	setSize: (size: { width: number; height: number }) => void;
}

function clampSize(size: { width: number; height: number }) {
	return {
		width: Math.max(360, Math.min(900, Math.round(size.width))),
		height: Math.max(480, Math.min(900, Math.round(size.height))),
	};
}

const fallbackStorageValues = new Map<string, string>();

const fallbackStorage: StateStorage = {
	getItem: (name) => fallbackStorageValues.get(name) ?? null,
	setItem: (name, value) => {
		fallbackStorageValues.set(name, value);
	},
	removeItem: (name) => {
		fallbackStorageValues.delete(name);
	},
};

function getControlChatStorage(): StateStorage {
	try {
		if (typeof localStorage !== "undefined") {
			return localStorage;
		}
	} catch {}
	return fallbackStorage;
}

export const useControlChatStore = create<ControlChatState>()(
	devtools(
		persist(
			(set, get) => ({
				isOpen: false,
				isExpanded: false,
				activeSessionId: null,
				isCreatingNewSession: false,
				width: CONTROL_CHAT_DEFAULT_WIDTH,
				height: CONTROL_CHAT_DEFAULT_HEIGHT,

				open: () => set({ isOpen: true }),
				close: () => set({ isOpen: false }),
				toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
				toggleExpanded: () => {
					const nextExpanded = !get().isExpanded;
					set({
						isExpanded: nextExpanded,
						width: nextExpanded
							? CONTROL_CHAT_EXPANDED_WIDTH
							: CONTROL_CHAT_DEFAULT_WIDTH,
						height: nextExpanded
							? CONTROL_CHAT_EXPANDED_HEIGHT
							: CONTROL_CHAT_DEFAULT_HEIGHT,
					});
				},
				setActiveSessionId: (sessionId) =>
					set({ activeSessionId: sessionId, isCreatingNewSession: false }),
				startNewSession: () =>
					set({ activeSessionId: null, isCreatingNewSession: true }),
				setSize: (size) => set(clampSize(size)),
			}),
			{
				name: "control-chat-store",
				version: 1,
				storage: createJSONStorage(getControlChatStorage),
				partialize: (state) => ({
					isOpen: state.isOpen,
					isExpanded: state.isExpanded,
					activeSessionId: state.activeSessionId,
					width: state.width,
					height: state.height,
				}),
			},
		),
		{ name: "ControlChatStore" },
	),
);
